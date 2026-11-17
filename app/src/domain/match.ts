/**
 * Ein Match im Best-of-3, abgeleitet nur aus dem Ereignisprotokoll (ADR-0005).
 *
 * - `game_start`: neues Spiel, `playerId` = wer beginnt
 * - `die_roll`:   W20-Wurf vor Spiel 1, `playerId` = wer würfelt, `value` = Augenzahl
 * - `life`:       Lebenspunkte-Änderung, `delta`
 * - `undo`:       nimmt ein `life`-Ereignis zurück (`undoOf`)
 * - `game_end`:   Spiel vorbei, `playerId` = Sieger
 *
 * Der Zustand wird nie gespeichert, sondern immer neu berechnet. So lässt sich später
 * jedes Ereignis an den Server schicken (Phase 3) und für Statistiken auswerten (Phase 8).
 */
import { type EventSource, type GameEvent, lifeTotals } from './lifeEvents';

export interface MatchPlayer {
  id: string;
  name: string;
}

export interface MatchConfig {
  id: string;
  players: readonly [MatchPlayer, MatchPlayer];
  startingLife: number;
  bestOf: number;
  createdAt: string;
}

export interface GameInfo {
  gameId: string;
  number: number;
  starter: string;
  startedAt: string;
  winner: string | null;
  endedAt: string | null;
}

export type MatchPhase = 'roll' | 'playing' | 'choose' | 'finished';

export interface MatchState {
  phase: MatchPhase;
  games: GameInfo[];
  wins: Record<string, number>;
  winner: string | null;
  /** Das laufende Spiel (nur in Phase `playing`). */
  current: GameInfo | null;
  /** Lebenspunkte im laufenden Spiel, sonst Startleben. */
  totals: Record<string, number>;
  /** Wer entscheidet, wer das nächste Spiel beginnt (Verlierer des letzten Spiels). */
  chooser: string | null;
}

export const winsNeeded = (bestOf: number): number => Math.floor(bestOf / 2) + 1;

const byTime = (a: GameEvent, b: GameEvent) =>
  a.clientTs === b.clientTs ? a.seq - b.seq : a.clientTs < b.clientTs ? -1 : 1;

export function opponentOf(players: readonly string[], id: string): string {
  const other = players.find((p) => p !== id);
  if (other === undefined) throw new RangeError('Gegner nicht gefunden');
  return other;
}

export function deriveGames(events: readonly GameEvent[]): GameInfo[] {
  const ends = new Map(events.filter((e) => e.type === 'game_end').map((e) => [e.gameId, e]));
  return events
    .filter((e) => e.type === 'game_start' && e.playerId !== null)
    .sort(byTime)
    .map((start, i) => {
      const end = ends.get(start.gameId);
      return {
        gameId: start.gameId,
        number: i + 1,
        starter: start.playerId as string,
        startedAt: start.clientTs,
        winner: end?.playerId ?? null,
        endedAt: end?.clientTs ?? null,
      };
    });
}

export function matchState(config: MatchConfig, events: readonly GameEvent[]): MatchState {
  const ids = config.players.map((p) => p.id);
  const games = deriveGames(events);
  const wins: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const g of games) if (g.winner !== null && g.winner in wins) wins[g.winner] += 1;

  const winner = ids.find((id) => wins[id] >= winsNeeded(config.bestOf)) ?? null;
  const last = games.at(-1);
  const current = last && last.winner === null ? last : null;

  let phase: MatchPhase;
  if (winner !== null) phase = 'finished';
  else if (!last) phase = 'roll';
  else if (current) phase = 'playing';
  else phase = 'choose';

  const totals = current
    ? lifeTotals(ids, events.filter((e) => e.gameId === current.gameId), config.startingLife)
    : Object.fromEntries(ids.map((id) => [id, config.startingLife]));

  const chooser = phase === 'choose' && last?.winner ? opponentOf(ids, last.winner) : null;

  return { phase, games, wins, winner, current, totals, chooser };
}

/** Bei 0 oder weniger Leben schlägt die App den Sieg des Gegners vor (bei beiden auf 0: kein Vorschlag). */
export function suggestedWinner(totals: Readonly<Record<string, number>>, players: readonly string[]): string | null {
  const down = players.filter((p) => totals[p] <= 0);
  return down.length === 1 ? opponentOf(players, down[0]) : null;
}

/**
 * Summe der letzten zusammenhängenden Änderungen eines Spielers, z. B. −7 nach sieben schnellen Tipps.
 * Änderungen gehören zusammen, wenn höchstens `windowMs` zwischen ihnen liegt. Nach `windowMs`
 * ohne neue Änderung verschwindet die Anzeige (`null`).
 */
export function recentChange(
  events: readonly GameEvent[],
  playerId: string,
  now: number,
  windowMs = 2500,
): number | null {
  const undone = new Set(events.filter((e) => e.type === 'undo').map((e) => e.undoOf));
  const mine = events
    .filter((e) => e.type === 'life' && e.playerId === playerId && !undone.has(e.id))
    .sort(byTime);
  const latest = mine.at(-1);
  if (!latest || now - Date.parse(latest.clientTs) > windowMs) return null;

  let sum = 0;
  let prevTs = Date.parse(latest.clientTs);
  for (let i = mine.length - 1; i >= 0; i--) {
    const ts = Date.parse(mine[i].clientTs);
    if (prevTs - ts > windowMs) break;
    sum += mine[i].delta ?? 0;
    prevTs = ts;
  }
  return sum === 0 ? null : sum;
}

/** Spieldauer in Millisekunden (laufendes Spiel: bis `now`). */
export function gameDuration(game: GameInfo, now: number = Date.now()): number {
  const end = game.endedAt ? Date.parse(game.endedAt) : now;
  return Math.max(0, end - Date.parse(game.startedAt));
}

export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Zeichen für die Anzeige der letzten Änderung, mit echtem Minuszeichen. */
export function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}

/** Baut ein Ereignis mit allen Pflichtfeldern. */
export function createEvent(
  fields: Pick<GameEvent, 'id' | 'gameId' | 'playerId' | 'type' | 'deviceId' | 'seq'> &
    Partial<Pick<GameEvent, 'delta' | 'value' | 'undoOf'>> & { source?: EventSource },
  now: number = Date.now(),
): GameEvent {
  return { source: 'app', clientTs: new Date(now).toISOString(), ...fields };
}
