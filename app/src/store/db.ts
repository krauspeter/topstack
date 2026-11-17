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

class TopStackDb extends Dexie {
  matches!: EntityTable<MatchRecord, 'id'>;

  constructor() {
    super('topstack');
    this.version(1).stores({ matches: 'id, status, updatedAt' });
  }
}

export const db = new TopStackDb();

export async function loadActiveMatch(): Promise<MatchRecord | undefined> {
  const active = await db.matches.where('status').equals('active').sortBy('updatedAt');
  return active.at(-1);
}

export async function saveMatch(record: MatchRecord): Promise<void> {
  await db.matches.put(record);
}
