import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../api/client';
import type { Me } from '../api/types';

/**
 * Anmeldestand. „offline“ heißt: Server nicht erreichbar. Der Life-Tracker funktioniert
 * dann trotzdem, nur Konto und Turniere fehlen (N-01).
 */
export type Account =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'offline' }
  | { status: 'signed-in'; me: Me };

export function useAccount() {
  const [account, setAccount] = useState<Account>({ status: 'loading' });

  const refresh = useCallback(async () => {
    try {
      const me = await api<Me>('/me');
      setAccount({ status: 'signed-in', me });
    } catch (error) {
      setAccount(error instanceof ApiError && error.status === 401 ? { status: 'anonymous' } : { status: 'offline' });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
