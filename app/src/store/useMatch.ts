import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type GameEvent, lastUndoable, uuidv7 } from '../domain/lifeEvents';
import { type MatchConfig, type MatchState, createEvent, matchState } from '../domain/match';
import { useNow } from '../hooks';
import { type MatchRecord, loadActiveMatch, saveMatch } from './db';

const DEVICE_KEY = 'topstack.deviceId';

/** Stabile Geräte-ID, damit Ereignisse später eindeutig zugeordnet werden (ADR-0005). */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = uuidv7();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'pwa-ohne-speicher';
  }
}

type NewEvent = Pick<GameEvent, 'gameId' | 'playerId' | 'type'> & Partial<Pick<GameEvent, 'delta' | 'value' | 'undoOf'>>;

function withEvents(record: MatchRecord, device: string, fresh: NewEvent[]): MatchRecord {
  let seq = record.events.reduce((max, e) => (e.deviceId === device ? Math.max(max, e.seq) : max), 0);
  const now = Date.now();
  const events = fresh.map((f) => createEvent({ ...f, id: uuidv7(now), deviceId: device, seq: ++seq }, now));
  return { ...record, events: [...record.events, ...events], updatedAt: new Date(now).toISOString() };
}

export interface MatchSetup {
  names: [string, string];
  /** Deckfarben je Spieler als WUBRG-Zeichenkette, `''` = farblos. */
  colors: [string, string];
  startingLife: number;
  /** Minuten oder `null` für kein Zeitlimit. */
  timeLimitMin: number | null;
}

export interface MatchApi {
  loaded: boolean;
  record: MatchRecord | null;
  state: MatchState | null;
  start(setup: MatchSetup): void;
  beginFirstGame(rolls: { playerId: string; value: number }[], starter: string): void;
  changeLife(playerId: string, delta: number): void;
  undo(): void;
  /** `null` = Spiel endet unentschieden (nur nach Zeitablauf). */
  endGame(winner: string | null): void;
  startNextGame(starter: string): void;
  close(): void;
}

export function useMatch(): MatchApi {
  const device = useMemo(deviceId, []);
  const [record, setRecordState] = useState<MatchRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Aktueller Stand auch außerhalb des Renderns, damit schnelle Tipps nie einen alten Stand sehen.
  const current = useRef<MatchRecord | null>(null);

  const commit = useCallback((next: MatchRecord | null, persist: MatchRecord | null = next) => {
    current.current = next;
    setRecordState(next);
    if (persist) saveMatch(persist).catch((err: unknown) => console.error('Spielstand konnte nicht gespeichert werden', err));
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadActiveMatch()
      .then((r) => {
        if (!cancelled && r && !current.current) commit(r, null);
      })
      .catch((err: unknown) => console.error('Spielstand konnte nicht geladen werden', err))
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [commit]);

  /** Ändert den Spielstand und schreibt ihn sofort nach IndexedDB. */
  const update = useCallback(
    (fn: (r: MatchRecord) => MatchRecord) => {
      const prev = current.current;
      if (!prev) return;
      const next = fn(prev);
      if (next !== prev) commit(next);
    },
    [commit],
  );

  // Mit Zeitlimit tickt der Zustand jede Sekunde, damit Ablauf und Matchende sofort sichtbar werden.
  const now = useNow(1000, !!record?.config.timeLimitMin);
  const state = useMemo(() => (record ? matchState(record.config, record.events, now) : null), [record, now]);

  const start = useCallback(({ names, colors, startingLife, timeLimitMin }: MatchSetup) => {
    const now = new Date().toISOString();
    const config: MatchConfig = {
      id: uuidv7(),
      players: [
        { id: 'p1', name: names[0], colors: colors[0] },
        { id: 'p2', name: names[1], colors: colors[1] },
      ],
      startingLife,
      bestOf: 3,
      timeLimitMin,
      createdAt: now,
    };
    commit({ id: config.id, config, events: [], status: 'active', updatedAt: now });
  }, [commit]);

  const beginFirstGame = useCallback(
    (rolls: { playerId: string; value: number }[], starter: string) => {
      const gameId = uuidv7();
      update((r) =>
        withEvents(r, device, [
          ...rolls.map((roll) => ({ gameId, playerId: roll.playerId, type: 'die_roll' as const, value: roll.value })),
          { gameId, playerId: starter, type: 'game_start' },
        ]),
      );
    },
    [device, update],
  );

  const changeLife = useCallback(
    (playerId: string, delta: number) =>
      update((r) => {
        const s = matchState(r.config, r.events);
        if (s.phase !== 'playing' || !s.current) return r;
        return withEvents(r, device, [{ gameId: s.current.gameId, playerId, type: 'life', delta }]);
      }),
    [device, update],
  );

  const undo = useCallback(
    () =>
      update((r) => {
        const s = matchState(r.config, r.events);
        if (!s.current) return r;
        const gameId = s.current.gameId;
        const target = lastUndoable(
          r.events.filter((e) => e.gameId === gameId),
          device,
        );
        return target ? withEvents(r, device, [{ gameId, playerId: null, type: 'undo', undoOf: target.id }]) : r;
      }),
    [device, update],
  );

  const endGame = useCallback(
    (winner: string | null) =>
      update((r) => {
        const s = matchState(r.config, r.events);
        if (!s.current) return r;
        return withEvents(r, device, [{ gameId: s.current.gameId, playerId: winner, type: 'game_end' }]);
      }),
    [device, update],
  );

  const startNextGame = useCallback(
    (starter: string) =>
      update((r) => {
        const s = matchState(r.config, r.events);
        if (s.phase !== 'choose') return r;
        return withEvents(r, device, [{ gameId: uuidv7(), playerId: starter, type: 'game_start' }]);
      }),
    [device, update],
  );

  const close = useCallback(() => {
    const prev = current.current;
    commit(null, prev ? { ...prev, status: 'closed', updatedAt: new Date().toISOString() } : null);
  }, [commit]);

  return { loaded, record, state, start, beginFirstGame, changeLife, undo, endGame, startNextGame, close };
}
