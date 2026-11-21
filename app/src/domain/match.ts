/**
 * Ein Match im Best-of-3, abgeleitet nur aus dem Ereignisprotokoll (ADR-0005).
 *
 * - `game_start`: neues Spiel, `playerId` = wer beginnt
 * - `die_roll`:   W20-Wurf vor Spiel 1, `playerId` = wer würfelt, `value` = Augenzahl
 * - `life`:       Lebenspunkte-Änderung, `delta`
 * - `undo`:       nimmt ein `life`-Ereignis zurück (`undoOf`)
 * - `game_end`:   Spiel vorbei, `playerId` = Sieger, `null` = unentschieden (nur nach Zeitablauf)
 *
 * Der Zustand wird nie gespeichert, sondern immer neu berechnet. So lässt sich später
 * jedes Ereignis an den Server schicken (Phase 3) und für Statistiken auswerten (Phase 8).
 */
import { type EndReason, type EventSource, type GameEvent, lifeTotals } from './lifeEvents';

export interface MatchPlayer {
  id: string;
  name: string;
  /** Deckfarben als WUBRG-Zeichenkette, `''` = farblos (wie `tournament_entry.colors`). */
  colors?: string;
  /** Veraltet: einzelner Farbschlüssel aus älteren Spielständen. */
  color?: string;
}

export interface MatchConfig {
  id: string;
  players: readonly [MatchPlayer, MatchPlayer];
  startingLife: number;
  bestOf: number;
  /** Zeitlimit für das ganze Match in Minuten ab Beginn von Spiel 1, `null` = aus (F-12). */
  timeLimitMin?: number | null;
  createdAt: string;
  /** Turnier-Match auf dem Server (ADR-0012); fehlt bei lokalen Matches, die nie hochgeladen werden. */
  remote?: RemoteMatch;
}

/** Stand des Matches laut Server; die App rechnet trotzdem immer selbst. */
export interface RemoteStatus {
  status: 'scheduled' | 'running' | 'finished';
  gamesA: number;
  gamesB: number;
  gamesDrawn: number;
  version: number;
}

export interface RemoteMatch {
  tournamentId: string;
  matchId: string;
  /** `shared`: ein Handy zählt beide; `dual`: jedes Handy nur einen Spieler (UC-11). */
  mode: 'shared' | 'dual';
  /** Im Modus `dual` der Spieler, den dieses Handy zählt. */
  myPlayer: string | null;
  server?: RemoteStatus;
  /** Modus `dual`: Warteraum bis Spiel 1 (wer ist da, wer hat was gewürfelt). */
  lobby?: Lobby;
}

export interface Lobby {
  /** Spieler → Gerät, das für ihn zählt. */
  seats: Record<string, string>;
  rolls: Record<string, number>;
  /** Letzter Gleichstand beim W20; beide würfeln neu. */
  tie: number | null;
}

/** Darf dieses Handy die Lebenspunkte dieses Spielers ändern? */
export function controls(config: MatchConfig, playerId: string): boolean {
  const r = config.remote;
  return !r || r.mode === 'shared' || r.myPlayer === playerId;
}

/** Nach Ablauf des Zeitlimits folgen noch so viele Extra-Züge (Festlegung „Zeitlimit“). */
export const EXTRA_TURNS = 5;

export interface GameInfo {
  gameId: string;
  number: number;
  starter: string;
  startedAt: string;
  /** Sieger; `null` bei laufendem oder unentschieden beendetem Spiel. */
  winner: string | null;
  endedAt: string | null;
}

export const isDrawn = (g: GameInfo): boolean => g.endedAt !== null && g.winner === null;

export type MatchPhase = 'roll' | 'playing' | 'choose' | 'finished';

export interface MatchState {
  phase: MatchPhase;
  games: GameInfo[];
  wins: Record<string, number>;
  /** Matchsieger, sobald das Match vorbei ist; `null` bei Unentschieden oder laufendem Match. */
  winner: string | null;
  /** Match vorbei und unentschieden (z. B. 1:1 nach Zeitablauf). */
  draw: boolean;
  /** Ende des Zeitlimits als Zeitstempel (ms), `null` ohne Zeitlimit oder vor Spiel 1. */
  deadline: number | null;
  /** Zeitlimit abgelaufen: Es folgen Extra-Züge, danach beginnt kein neues Spiel mehr. */
  timeUp: boolean;
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

export function matchState(config: MatchConfig, events: readonly GameEvent[], now: number = Date.now()): MatchState {
  const ids = config.players.map((p) => p.id);
  const games = deriveGames(events);
  const wins: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const g of games) if (g.winner !== null && g.winner in wins) wins[g.winner] += 1;

  const first = games[0];
  const deadline = config.timeLimitMin && first ? Date.parse(first.startedAt) + config.timeLimitMin * 60_000 : null;
  const timeUp = deadline !== null && now >= deadline;

  const decided = ids.find((id) => wins[id] >= winsNeeded(config.bestOf)) ?? null;
  const last = games.at(-1);
  const current = last && last.endedAt === null ? last : null;
  // Nach Zeitablauf (oder einem unentschiedenen Spiel) beginnt kein neues Spiel mehr.
  const overByTime = !!last && !current && (timeUp || isDrawn(last));

  let phase: MatchPhase;
  if (decided !== null || overByTime) phase = 'finished';
  else if (!last) phase = 'roll';
  else if (current) phase = 'playing';
  else phase = 'choose';

  let winner: string | null = decided;
  if (phase === 'finished' && winner === null) {
    const [a, b] = ids;
    winner = wins[a] > wins[b] ? a : wins[b] > wins[a] ? b : null;
  }
  const draw = phase === 'finished' && winner === null;

  const totals = current
    ? lifeTotals(ids, events.filter((e) => e.gameId === current.gameId), config.startingLife)
    : Object.fromEntries(ids.map((id) => [id, config.startingLife]));

  const chooser = phase === 'choose' && last?.winner ? opponentOf(ids, last.winner) : null;

  return { phase, games, wins, winner, draw, deadline, timeUp, current, totals, chooser };
}

/** Restzeit bis zum Zeitlimit in ms (nie negativ), `null` ohne Zeitlimit. */
export function timeLeft(state: MatchState, now: number = Date.now()): number | null {
  return state.deadline === null ? null : Math.max(0, state.deadline - now);
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
    Partial<Pick<GameEvent, 'delta' | 'value' | 'undoOf'>> & { source?: EventSource; reason?: EndReason },
  now: number = Date.now(),
): GameEvent {
  return { source: 'app', clientTs: new Date(now).toISOString(), ...fields };
}
