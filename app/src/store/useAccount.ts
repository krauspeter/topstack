import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../api/client';
import type { Me } from '../api/types';

/**
 * Anmeldestand. „offline“ heißt: Server nicht erreichbar. Der Life-Tracker funktioniert
 * dann trotzdem, nur Konto und Turniere fehlen (N-01). ``reason`` sagt, warum:
 * - ``network``: kein Netz oder Server antwortet nicht
 * - ``access``: Cloudflare Access leitet auf seine Anmeldung um (Staging, Sitzung abgelaufen)
 */
export type OfflineReason = 'network' | 'access';

export type Account =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'offline'; reason: OfflineReason }
  | { status: 'signed-in'; me: Me };

/** Unterscheidet abgelaufene Access-Sitzung von fehlendem Netz: Access antwortet mit Umleitung. */
export async function offlineReason(): Promise<OfflineReason> {
  try {
    const r = await fetch('/api/v1/health', { redirect: 'manual', cache: 'no-store', credentials: 'same-origin' });
    return r.type === 'opaqueredirect' ? 'access' : 'network';
  } catch {
    return 'network';
  }
}

/** Neue Anmeldung bei Access: Adressen unter /api/ gehen am Service Worker vorbei zu Cloudflare. */
export function reauthenticate(next = '/'): void {
  window.location.assign(`/api/v1/return?next=${encodeURIComponent(next)}`);
}

export function useAccount() {
  const [account, setAccount] = useState<Account>({ status: 'loading' });

  const refresh = useCallback(async () => {
    try {
      const me = await api<Me>('/me');
      setAccount({ status: 'signed-in', me });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setAccount({ status: 'anonymous' });
      else setAccount({ status: 'offline', reason: await offlineReason() });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Offline: wieder versuchen, sobald das Netz zurück ist oder die App in den Vordergrund kommt
  const offline = account.status === 'offline';
  useEffect(() => {
    if (!offline) return;
    const retry = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retry);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', retry);
    };
  }, [offline, refresh]);

  const signedIn = useCallback((me: Me) => setAccount({ status: 'signed-in', me }), []);

  const signOut = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setAccount({ status: 'anonymous' });
    }
  }, []);

  return { account, refresh, signedIn, signOut };
}
