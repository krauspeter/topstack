import { describe, expect, it } from 'vitest';
import { recordText, rivals } from './rivals';

const players = ['anna', 'ben', 'chris', 'finn'].map((id) => ({ player_id: id, display_name: id[0].toUpperCase() + id.slice(1) }));
const pair = (player_id: string, opponent_id: string, wins: number, draws: number, losses: number, imported = 0) => ({
  player_id,
  opponent_id,
  wins,
  draws,
  losses,
  games_won: 0,
  games_lost: 0,
  imported,
});

describe('Rivalen-Liste (AP-6)', () => {
  it('sortiert nach Begegnungen und markiert den Angstgegner', () => {
    const list = rivals('anna', players, [pair('anna', 'ben', 3, 1, 5), pair('anna', 'chris', 6, 0, 2), pair('ben', 'anna', 5, 1, 3)]);
    expect(list.map((r) => [r.name, recordText(r), r.nemesis])).toEqual([
      ['Ben', '3–1–5', true],
      ['Chris', '6–0–2', false],
      ['Finn', '0–0–0', false],
    ]);
  });

  it('kein Angstgegner unter 3 Matches oder bei positiver Bilanz', () => {
    expect(rivals('anna', players, [pair('anna', 'ben', 0, 0, 2)]).some((r) => r.nemesis)).toBe(false);
    expect(rivals('anna', players, [pair('anna', 'ben', 2, 1, 2)]).some((r) => r.nemesis)).toBe(false);
  });
});
