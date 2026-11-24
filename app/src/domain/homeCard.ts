/**
 * Turnier-Karte auf der Startseite (Phase 4, eingeschoben am 24.11.2026, Vorschlag A).
 *
 * Leitet aus der Turnieransicht ab, was die Karte zeigt: Runde, Platz, Punkte, Bilanz und vor
 * allem den nächsten Schritt für mich. Reine Funktion, damit jeder Zustand ohne Server
 * testbar ist. Die Karte erscheint nur, wenn ich im Turnier eingetragen oder eingeladen bin.
 */
import type { NextOpponent, Tournament } from '../api/types';

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
  | { kind: 'done'; canNextRound: boolean; openMatches: number }
  | { kind: 'bye'; next: NextOpponent | null; live: string[] }
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
  /** Der Knopf der Karte ist der nächste Schritt und deshalb gold (ADR-0011). */
  primary: boolean;
}

const PREP: Record<string, string> = {
  setup: 'Anmeldung läuft',
  seated: 'Plätze ausgelost',
  drafting: 'Draft läuft',
};

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
  };

  if (me.status === 'invited') return { ...base, state: { kind: 'invited' }, primary: true };
  if (t.status in PREP) return { ...base, state: { kind: 'prep', label: PREP[t.status] }, primary: true };
  if (t.status === 'paused') return { ...base, state: { kind: 'paused' }, primary: false };
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
      primary: false,
    };
  }

  // läuft: mein Match in der aktuellen Runde
  const mine = round?.matches.find((m) => m.player_a_id === myId || m.player_b_id === myId) ?? null;
  if (!mine) {
    const live = (round?.matches ?? [])
      .filter((m) => m.status === 'running')
      .map((m) =>
        m.life_a !== null && m.life_b !== null
          ? `${m.player_a} – ${m.player_b} ${m.life_a} : ${m.life_b}`
          : `${m.player_a} – ${m.player_b}`,
      );
    return { ...base, state: { kind: 'bye', next: t.next_opponent, live }, primary: false };
  }
  const iAmA = mine.player_a_id === myId;
  const opponent = iAmA ? mine.player_b : mine.player_a;
  if (mine.status === 'scheduled') return { ...base, state: { kind: 'your_turn', opponent }, primary: true };
  if (mine.status === 'running') {
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
      primary: true,
    };
  }
  const canNextRound = t.actions.includes('next_round') && t.open_in_current === 0 && t.rounds_left > 0;
  return {
    ...base,
    state: { kind: 'done', canNextRound, openMatches: t.open_in_current },
    primary: canNextRound,
  };
}

/** Turnier fertig und nicht von heute: nicht mehr auf der Startseite zeigen. */
export function showOnHome(status: Tournament['status'], heldOn: string, today: string): boolean {
  if (status === 'cancelled') return false;
  if (status === 'finished') return heldOn === today;
  return true;
}

/** Heutiges Datum als JJJJ-MM-TT in der Zeitzone des Geräts. */
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
