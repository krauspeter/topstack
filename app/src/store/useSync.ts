/**
 * Sync-Dienst für Turnier-Matches (ADR-0012): Outbox senden, Stand des Servers nachladen.
 * Die Anzeige hängt nie davon ab; ohne Netz zählt die App einfach weiter.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../api/client';
import { useLive } from '../api/live';
import type { EventBatchResult, TrackerInfo } from '../api/types';
import { fromApi, lobbyFrom, remoteStatus, toApi } from '../domain/remote';
import { allPending, confirmEvents, pendingEvents } from './db';
import type { MatchApi } from './useMatch';

const DEBOUNCE_MS = 300;
/** Ohne WebSocket fragt das Handy alle 2 s nach den Eingaben des Gegners, mit nur zur Sicherheit. */
const POLL_MS = 2000;
const POLL_LIVE_MS = 10_000;
/** Reste aus geschlossenen Trackern gehen im Hintergrund raus. */
const DRAIN_MS = 15000;

export interface SyncInfo {
  /** Ereignisse, die der Server noch nicht bestätigt hat. */
  pending: number;
  online: boolean;
  /** Hinweis, z. B. wenn der Server ein Ereignis abgelehnt hat. */
  notice: string | null;
  dismiss(): void;
}

export function useSync(match: MatchApi): SyncInfo {
  const remote = match.record?.config.remote;
  const matchId = remote?.matchId ?? null;
  const tournamentId = remote?.tournamentId ?? null;
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);
  const apply = useRef(match.applyServer);
  apply.current = match.applyServer;

  const base = tournamentId && matchId ? `/tournaments/${tournamentId}/matches/${matchId}` : null;

  const flush = useCallback(async () => {
    if (!base || !matchId || busy.current) return;
    busy.current = true;
    try {
      const items = await pendingEvents(matchId);
      setPending(items.length);
      if (items.length > 0) {
        const res = await api<EventBatchResult>(`${base}/events`, {
          method: 'POST',
          body: { events: items.map((i) => toApi(i.event)) },
        });
        const rejected = res.rejected.map((r) => r.id);
        await confirmEvents([...res.accepted, ...res.duplicates, ...rejected]);
        if (res.rejected.length > 0) setNotice(`Der Server hat eine Eingabe nicht übernommen: ${res.rejected[0].detail}`);
        apply.current(matchId, [], rejected, remoteStatus(res.match));
        setPending((await pendingEvents(matchId)).length);
      }
      const info = await api<TrackerInfo>(`${base}/tracker`);
      apply.current(matchId, info.events.map(fromApi), [], remoteStatus(info.match), lobbyFrom(info));
      setOnline(true);
    } catch (err) {
      // Offline oder Server weg: Ereignisse bleiben in der Outbox und gehen später raus
      setOnline(false);
      if (err instanceof ApiError && err.status !== 0 && err.status < 500) setNotice(err.message);
    } finally {
      busy.current = false;
    }
  }, [base, matchId]);

  // Nach jeder Änderung gebündelt senden
  const count = match.record?.events.length ?? 0;
  useEffect(() => {
    if (!base) return;
    const timer = window.setTimeout(() => void flush(), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [base, count, flush]);

  // Live: Eingaben vom anderen Handy kommen per WebSocket-Hinweis (AP-7)
  const live = useLive(tournamentId, () => void flush(), 50);

  // Regelmäßig nachladen, beim Wiederverbinden und beim Zurückkehren in die App sofort
  useEffect(() => {
    if (!base) return;
    const timer = window.setInterval(() => void flush(), live ? POLL_LIVE_MS : POLL_MS);
    const now = () => void flush();
    const visible = () => document.visibilityState === 'visible' && void flush();
    window.addEventListener('online', now);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', now);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [base, flush, live]);

  // Outbox anderer Matches leeren, z. B. nachdem der Tracker offline geschlossen wurde
  useEffect(() => {
    const drain = async () => {
      const groups = new Map<string, { tournamentId: string; events: ReturnType<typeof toApi>[]; ids: string[] }>();
      for (const item of await allPending()) {
        if (item.matchId === matchId) continue;
        const g = groups.get(item.matchId) ?? { tournamentId: item.tournamentId, events: [], ids: [] };
        g.events.push(toApi(item.event));
        g.ids.push(item.id);
        groups.set(item.matchId, g);
      }
      for (const [mid, g] of groups) {
        try {
          const res = await api<EventBatchResult>(`/tournaments/${g.tournamentId}/matches/${mid}/events`, {
            method: 'POST',
            body: { events: g.events },
          });
          await confirmEvents([...res.accepted, ...res.duplicates, ...res.rejected.map((r) => r.id)]);
        } catch {
          // später erneut
        }
      }
    };
    const run = () => void drain().catch(() => undefined);
    run();
    const timer = window.setInterval(run, DRAIN_MS);
    window.addEventListener('online', run);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', run);
    };
  }, [matchId]);

  return { pending, online, notice, dismiss: () => setNotice(null) };
}
