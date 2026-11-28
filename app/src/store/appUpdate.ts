import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { BUILD } from '../build';
import { CHECK_INTERVAL_MS, alreadyReloadedFor, markReloadFor, newerOnServer } from '../domain/update';

/**
 * Stabile Updates (Phase 5, AP-14, ADR-0021). Die App fragt beim Öffnen, beim Zurückkehren und
 * alle 30 Minuten den Server nach seiner Update-Nummer und den Service Worker nach einer neuen
 * Version. Ist der Server neuer, meldet der Hook ``available``; hat ein Neuladen dafür schon
 * nicht geholfen, ``stuck`` (dann hilft „App zurücksetzen“).
 */
export type UpdateState = { status: 'current' } | { status: 'available'; server: string } | { status: 'stuck'; server: string };

async function serverBuild(): Promise<string | null> {
  try {
    const r = await fetch('/api/v1/health', { cache: 'no-store', credentials: 'same-origin', redirect: 'manual' });
    if (!r.ok) return null;
    const h = (await r.json()) as { build?: { pr?: string } };
    return h.build?.pr ?? null;
  } catch {
    return null;
  }
}

async function askServiceWorker(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch {
    // z. B. sw.js nicht erreichbar: der Abgleich mit /health greift trotzdem
  }
}

export function useAppUpdate(): { state: UpdateState; reload(): void } {
  const [state, setState] = useState<UpdateState>({ status: 'current' });

  const check = useCallback(async () => {
    await askServiceWorker();
    const server = await serverBuild();
    if (!server || !newerOnServer(BUILD.pr, server)) return setState({ status: 'current' });
    setState(alreadyReloadedFor(server) ? { status: 'stuck', server } : { status: 'available', server });
  }, []);

  useEffect(() => {
    void check();
    const onVisible = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    // Hat ein neuer Service Worker die Seite übernommen, liegt die neue Version bereit
    const onController = () => void check();
    navigator.serviceWorker?.addEventListener('controllerchange', onController);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
      navigator.serviceWorker?.removeEventListener('controllerchange', onController);
    };
  }, [check]);

  const reload = useCallback(() => {
    if (state.status !== 'current') markReloadFor(state.server);
    window.location.reload();
  }, [state]);

  return { state, reload };
}

/**
 * „App zurücksetzen“: Service Worker abmelden und seine Zwischenspeicher leeren, dann neu laden.
 * Spielstände und Outbox (IndexedDB) und die Anmeldung (Cookie) bleiben erhalten.
 */
export async function resetApp(): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    // weiter mit den Zwischenspeichern
  }
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // Neuladen holt die Dateien dann vom Server
  }
  window.location.replace(window.location.pathname === '/profil' ? '/' : window.location.pathname);
}

// Läuft gerade ein Match? Dann wartet der Hinweis (N-06). App.tsx meldet den Stand.
let matchActive = false;
const MATCH_EVENT = 'topstack:match-active';

export function setMatchActive(on: boolean): void {
  if (matchActive === on) return;
  matchActive = on;
  window.dispatchEvent(new Event(MATCH_EVENT));
}

export function useMatchActive(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(MATCH_EVENT, cb);
      return () => window.removeEventListener(MATCH_EVENT, cb);
    },
    () => matchActive,
  );
}
