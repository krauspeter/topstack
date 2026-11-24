/**
 * Turnier-Karte auf der Startseite (Phase 4, eingeschoben am 24.11.2026, Vorschlag A).
 *
 * Leitet aus der Turnieransicht ab, was die Karte zeigt: Runde, Platz, Punkte, Bilanz und vor
 * allem den nächsten Schritt für mich. Reine Funktion, damit jeder Zustand ohne Server
 * testbar ist. Die Karte erscheint nur, wenn ich im Turnier eingetragen oder eingeladen bin.
 *
 * Gold (ADR-0011, präzisiert am 24.11.2026): Solange ich in einem nicht beendeten Turnier bin,
 * trägt die Karte den goldenen Rahmen und „Freies Match“ ist grau. Der Knopf der Karte ist nur
 * dann gold, wenn er etwas auslöst: Match starten, Match vorziehen, nächste Runde starten.
 */
import type { MatchInfo, NextOpponent, Tournament } from '../api/types';

/** Eine laufende Partie anderer Spieler, z. B. „Ben 12 : 7 Chris“. */
export interface LiveLine {
  a: string;
  b: string;
  lifeA: number | null;
  lifeB: number | null;
}

/** Was der Hauptknopf der Karte tut. */
export type CardAction =
  | { kind: 'open' }
  | { kind: 'live' }
  | { kind: 'pull'; matchId: string; opponent: string; round: number }
  | { kind: 'next_round'; round: number };

export type CardState =
  | { kind: 'invited' }
  | { kind: 'prep'; label: string }
  | { kind: 'your_turn'; opponent: string }
  | {
      kind: 'playing';
      opponent: string;
      gameNo: number | null;
      myGames: number;
      oppGames: number;
      myLife: number | null;
      oppLife: number | null;
    }
  | { kind: 'done'; openMatches: number; live: LiveLine[]; allPlayed: boolean }
  | { kind: 'bye'; next: NextOpponent | null; live: LiveLine[] }
  | { kind: 'paused' }
  | { kind: 'finished'; place: number | null; points: number | null; winner: string | null };

export interface HomeCard {
  id: string;
  setCode: string;
  /** z. B. „RUNDE 2 VON 3“; leer vor dem Start und nach dem Ende. */
  roundLabel: string;
  /** Platz, Matchpunkte und Bilanz aus der Turniertabelle, sobald gespielt wurde. */
  place: number | null;
  matchPoints: number | null;
  record: string | null;
  state: CardState;
  action: CardAction;
  /** Der Knopf löst den nächsten Schritt aus und ist deshalb gold. */
  primary: boolean;
  /** Turnier ist nicht beendet: goldener Rahmen (bei zwei Karten nur die obere, siehe sortCards). */
  hot: boolean;
}

const PREP: Record<string, string> = {
  setup: 'Anmeldung läuft',
  seated: 'Plätze ausgelost',
  drafting: 'Draft läuft',
};

const OPEN: CardAction = { kind: 'open' };

export function homeCard(t: Tournament): HomeCard | null {
  const me = t.entries.find((e) => e.is_me);
  if (!me || me.status === 'declined' || me.status === 'removed') return null;
  if (t.status === 'cancelled') return null;

  const myId = t.my_player_id ?? me.player_id;
  const row = t.standings.find((s) => s.player_id === myId) ?? null;
  const played = row !== null && row.played > 0;
  const round = t.rounds.find((r) => r.number === t.current_round) ?? null;
  const base = {
    id: t.id,
    setCode: t.set_code,
    roundLabel:
      t.current_round && t.status !== 'finished' ? `RUNDE ${t.current_round} VON ${t.rounds.length}` : '',
    place: played ? row.rank : null,
    matchPoints: played ? row.match_points : null,
    record: played ? `${row.wins}-${row.draws}-${row.losses}` : null,
    hot: t.status !== 'finished',
  };

  if (me.status === 'invited') return { ...base, state: { kind: 'invited' }, action: OPEN, primary: true };
  if (t.status in PREP) {
    return { ...base, state: { kind: 'prep', label: PREP[t.status] }, action: OPEN, primary: false };
  }
  if (t.status === 'paused') return { ...base, state: { kind: 'paused' }, action: OPEN, primary: false };
  if (t.status === 'finished') {
    const winner = t.standings.find((s) => (s.final_place ?? s.rank) === 1)?.display_name ?? null;
    return {
      ...base,
      state: {
        kind: 'finished',
        place: row?.final_place ?? row?.rank ?? null,
        points: row?.ranking_points ?? null,
        winner,
      },
      action: OPEN,
      primary: false,
    };
  }

  // läuft
  const isMine = (m: MatchInfo) => m.player_a_id === myId || m.player_b_id === myId;
  const planned = t.rounds.filter((r) => r.status === 'planned');
  const pulledRunning = planned.flatMap((r) => r.matches.filter((m) => m.status === 'running'));
  const current = round?.matches ?? [];
  const running = [...current, ...pulledRunning].find((m) => isMine(m) && m.status === 'running');
  const scheduled = current.find((m) => isMine(m) && m.status === 'scheduled');
  const mine = running ?? scheduled ?? current.find(isMine) ?? null;

  if (mine && mine.status !== 'finished') {
    const iAmA = mine.player_a_id === myId;
    const opponent = iAmA ? mine.player_b : mine.player_a;
    if (mine.status === 'scheduled') {
      return { ...base, state: { kind: 'your_turn', opponent }, action: OPEN, primary: true };
    }
    return {
      ...base,
      state: {
        kind: 'playing',
        opponent,
        gameNo: mine.game_no,
        myGames: iAmA ? mine.games_a : mine.games_b,
        oppGames: iAmA ? mine.games_b : mine.games_a,
        myLife: iAmA ? mine.life_a : mine.life_b,
        oppLife: iAmA ? mine.life_b : mine.life_a,
      },
      action: OPEN,
      primary: true,
    };
  }

  // Ich spiele gerade nicht: Pause oder Match fertig
  const others = [...current, ...pulledRunning].filter((m) => m.status === 'running' && !isMine(m));
  const live: LiveLine[] = others.map((m) => ({ a: m.player_a, b: m.player_b, lifeA: m.life_a, lifeB: m.life_b }));
  const busy = new Set(
    [...current.filter((m) => m.status !== 'finished'), ...pulledRunning].flatMap((m) => [m.player_a_id, m.player_b_id]),
  );
  // Mein nächstes Match aus einer späteren Runde, wenn beide frei sind (wie der Server, UC-09)
  let pull: CardAction | null = null;
  for (const r of planned) {
    const m = r.matches.find((x) => isMine(x) && x.status === 'scheduled');
    if (!m) continue;
    if (m.can_report && !busy.has(m.player_a_id) && !busy.has(m.player_b_id)) {
      pull = { kind: 'pull', matchId: m.id, opponent: m.player_a_id === myId ? m.player_b : m.player_a, round: r.number };
    }
    break; // nur das nächste eigene Match, nicht eines aus noch späteren Runden
  }
  const canNextRound =
    t.actions.includes('next_round') && t.open_in_current === 0 && t.rounds_left > 0 && round !== null;
  const action: CardAction = canNextRound
    ? { kind: 'next_round', round: (round?.number ?? 0) + 1 }
    : (pull ?? (live.length > 0 ? { kind: 'live' } : OPEN));
  const primary = action.kind === 'next_round' || action.kind === 'pull';

  if (!mine) return { ...base, state: { kind: 'bye', next: t.next_opponent, live }, action, primary };
  const allPlayed = t.open_in_current === 0 && t.rounds_left === 0;
  return {
    ...base,
    state: { kind: 'done', openMatches: t.open_in_current, live, allPlayed },
    action,
    primary,
  };
}

/**
 * Reihenfolge und Rahmen: Karte mit Aktion zuerst, beendete zuletzt, höchstens zwei.
 * Gold (Rahmen und Knopf) trägt nur die obere Karte, damit es genau einen Blickfang gibt;
 * die zweite Karte bleibt bedienbar, nur grau.
 */
export function sortCards(cards: HomeCard[]): HomeCard[] {
  const rank = (c: HomeCard) => (c.primary ? 0 : c.hot ? 1 : 2);
  return [...cards]
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 2)
    .map((c, i) => (i === 0 ? c : { ...c, hot: false, primary: false }));
}

/** Beendete Turniere bleiben 24 Stunden nach dem Abschluss auf der Startseite. */
export const FINISHED_VISIBLE_MS = 24 * 60 * 60 * 1000;

export function showOnHome(status: Tournament['status'], finishedAt: string | null | undefined, now = Date.now()): boolean {
  if (status === 'cancelled') return false;
  if (status === 'finished') {
    if (!finishedAt) return false;
    return now - Date.parse(finishedAt) < FINISHED_VISIBLE_MS;
  }
  return true;
}
