import type { H2HPair, H2HPlayer } from '../api/types';

/** Eine Zeile der Rivalen-Liste: meine Bilanz gegen einen Gegner (Phase 5, AP-6). */
export interface Rival {
  id: string;
  name: string;
  wins: number;
  draws: number;
  losses: number;
  played: number;
  imported: number;
  nemesis: boolean;
}

/**
 * Meine Gegner, meiste Begegnungen zuerst, danach nach Namen; wer nie gegen mich gespielt hat,
 * steht am Ende. Angstgegner ist, gegen wen ich am deutlichsten hinten liege, ab 3 Matches.
 */
export function rivals(me: string, players: readonly H2HPlayer[], pairs: readonly H2HPair[]): Rival[] {
  const mine = new Map(pairs.filter((p) => p.player_id === me).map((p) => [p.opponent_id, p]));
  const list: Rival[] = players
    .filter((p) => p.player_id !== me)
    .map((p) => {
      const r = mine.get(p.player_id);
      const wins = r?.wins ?? 0;
      const draws = r?.draws ?? 0;
      const losses = r?.losses ?? 0;
      return { id: p.player_id, name: p.display_name, wins, draws, losses, played: wins + draws + losses, imported: r?.imported ?? 0, nemesis: false };
    })
    .sort((a, b) => b.played - a.played || a.name.localeCompare(b.name, 'de'));
  const candidates = list.filter((r) => r.played >= 3 && r.losses > r.wins);
  if (candidates.length > 0) {
    const worst = candidates.reduce((x, y) => (y.losses - y.wins > x.losses - x.wins ? y : x));
    worst.nemesis = true;
  }
  return list;
}

/** „3–1–5“ für Siege, Unentschieden, Niederlagen. */
export const recordText = (r: { wins: number; draws: number; losses: number }): string => `${r.wins}–${r.draws}–${r.losses}`;
