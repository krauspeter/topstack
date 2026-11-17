/**
 * Ereignisprotokoll für Lebenspunkte (ADR-0005).
 * Muss sich exakt wie server/topstack/domain/life.py verhalten.
 */

export type EventType = 'game_start' | 'die_roll' | 'life' | 'undo' | 'game_end';
export type EventSource = 'app' | 'hardware' | 'table';

export interface GameEvent {
  id: string;
  gameId: string;
  playerId: string | null;
  type: EventType;
  deviceId: string;
  seq: number;
  clientTs: string;
  source: EventSource;
  delta?: number;
  value?: number;
  undoOf?: string;
}

/** UUIDv7: zeitlich sortierbar, auf dem Gerät erzeugt (RFC 9562). */
export function uuidv7(now: number = Date.now()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let ts = now;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts & 0xff;
    ts = Math.floor(ts / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // Version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variante RFC 9562
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function lifeTotals(
  players: readonly string[],
  events: readonly GameEvent[],
  startingLife = 20,
): Record<string, number> {
  const undone = new Set(events.filter((e) => e.type === 'undo').map((e) => e.undoOf));
  const totals: Record<string, number> = Object.fromEntries(players.map((p) => [p, startingLife]));
  const sorted = [...events].sort((a, b) =>
    a.deviceId === b.deviceId ? a.seq - b.seq : a.deviceId < b.deviceId ? -1 : 1,
  );
  for (const e of sorted) {
    if (e.type === 'life' && !undone.has(e.id) && e.playerId !== null && e.playerId in totals) {
      totals[e.playerId] += e.delta ?? 0;
    }
  }
  return totals;
}

/** Fügt Ereignisse idempotent zusammen (doppelte IDs vom Neusenden werden ignoriert). */
export function mergeEvents(known: readonly GameEvent[], incoming: readonly GameEvent[]): GameEvent[] {
  const byId = new Map(known.map((e) => [e.id, e]));
  for (const e of incoming) if (!byId.has(e.id)) byId.set(e.id, e);
  return [...byId.values()];
}

/** Letztes noch nicht rückgängig gemachtes Lebenspunkte-Ereignis dieses Geräts. */
export function lastUndoable(events: readonly GameEvent[], deviceId: string): GameEvent | undefined {
  const undone = new Set(events.filter((e) => e.type === 'undo').map((e) => e.undoOf));
  return [...events]
    .filter((e) => e.deviceId === deviceId && e.type === 'life' && !undone.has(e.id))
    .sort((a, b) => b.seq - a.seq)[0];
}
