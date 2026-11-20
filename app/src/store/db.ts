/** Lokaler Speicher in IndexedDB (Dexie). Jede Änderung wird sofort geschrieben (N-01). */
import Dexie, { type EntityTable } from 'dexie';
import type { GameEvent } from '../domain/lifeEvents';
import type { MatchConfig } from '../domain/match';

export interface MatchRecord {
  id: string;
  config: MatchConfig;
  events: GameEvent[];
  /** `active`: läuft oder ist noch nicht bestätigt; `closed`: abgeschlossen oder abgebrochen. */
  status: 'active' | 'closed';
  updatedAt: string;
}

/** Noch nicht vom Server bestätigtes Ereignis eines Turnier-Matches (ADR-0012). */
export interface OutboxItem {
  id: string;
  matchId: string;
  tournamentId: string;
  event: GameEvent;
}

class TopStackDb extends Dexie {
  matches!: EntityTable<MatchRecord, 'id'>;
  outbox!: EntityTable<OutboxItem, 'id'>;

  constructor() {
    super('topstack');
    this.version(1).stores({ matches: 'id, status, updatedAt' });
    // Version 2: Outbox für Turnier-Matches; vorhandene lokale Matches bleiben unverändert
    this.version(2).stores({ matches: 'id, status, updatedAt', outbox: 'id, matchId' });
  }
}

export const db = new TopStackDb();

export async function loadActiveMatch(): Promise<MatchRecord | undefined> {
  const active = await db.matches.where('status').equals('active').sortBy('updatedAt');
  return active.at(-1);
}

/** Spielstand speichern; neue Ereignisse eines Turnier-Matches im selben Schritt in die Outbox. */
export async function saveMatch(record: MatchRecord, fresh: readonly GameEvent[] = []): Promise<void> {
  const remote = record.config.remote;
  if (!remote || fresh.length === 0) {
    await db.matches.put(record);
    return;
  }
  await db.transaction('rw', db.matches, db.outbox, async () => {
    await db.matches.put(record);
    await db.outbox.bulkPut(
      fresh.map((event) => ({ id: event.id, matchId: remote.matchId, tournamentId: remote.tournamentId, event })),
    );
  });
}

export async function pendingEvents(matchId: string): Promise<OutboxItem[]> {
  return db.outbox.where('matchId').equals(matchId).toArray();
}

export async function allPending(): Promise<OutboxItem[]> {
  return db.outbox.toArray();
}

export async function confirmEvents(ids: readonly string[]): Promise<void> {
  await db.outbox.bulkDelete([...ids]);
}
