import { describe, expect, it } from 'vitest';
import type { MatchInfo, Standing, Tournament } from '../api/types';
import { homeCard, localToday, showOnHome } from './homeCard';

const ME = 'p-anna';

const match = (id: string, a: [string, string], b: [string, string], extra: Partial<MatchInfo> = {}): MatchInfo => ({
  id,
  player_a_id: a[0],
  player_a: a[1],
  player_b_id: b[0],
  player_b: b[1],
  status: 'scheduled',
  games_a: 0,
  games_b: 0,
  games_drawn: 0,
  version: 0,
  mine: a[0] === ME || b[0] === ME,
  can_report: true,
  tracker_mode: 'none',
  game_no: null,
  life_a: null,
  life_b: null,
  ...extra,
});

const standing = (id: string, name: string, rank: number, extra: Partial<Standing> = {}): Standing => ({
  player_id: id,
  display_name: name,
  rank,
  played: 1,
  wins: rank === 1 ? 1 : 0,
  draws: 0,
  losses: rank === 1 ? 0 : 1,
  match_points: rank === 1 ? 3 : 0,
  games_won: 0,
  games_lost: 0,
  game_diff: 0,
  needs_roll: false,
  roll: null,
  final_place: null,
  ranking_points: null,
  ...extra,
});

function tournament(extra: Partial<Tournament> = {}): Tournament {
  return {
    id: 't-1',
    group_id: 'g-1',
    group_name: 'Draft-Runde',
    set_code: 'DSK',
    status: 'running',
    held_on: '2026-12-28',
    location: null,
    started_by: ME,
    seating: null,
    entries: [
      { player_id: ME, display_name: 'Anna', kind: 'member', status: 'accepted', seat_no: 1, colors: 'UR', is_me: true },
      { player_id: 'p-dana', display_name: 'Dana', kind: 'member', status: 'accepted', seat_no: 2, colors: 'BR', is_me: false },
      { player_id: 'p-ben', display_name: 'Ben', kind: 'member', status: 'accepted', seat_no: 3, colors: 'G', is_me: false },
    ],
    my_player_id: ME,
    actions: ['report_result', 'next_round'],
    rounds: [
      { number: 1, status: 'finished', bye: 'Ben', matches: [match('m1', [ME, 'Anna'], ['p-dana', 'Dana'], { status: 'finished', games_a: 2 })] },
      { number: 2, status: 'running', bye: 'Dana', matches: [match('m2', ['p-ben', 'Ben'], [ME, 'Anna'])] },
      { number: 3, status: 'planned', bye: 'Anna', matches: [match('m3', ['p-dana', 'Dana'], ['p-ben', 'Ben'])] },
    ],
    current_round: 2,
    open_in_current: 1,
    rounds_left: 2,
    standings: [standing(ME, 'Anna', 1), standing('p-dana', 'Dana', 2), standing('p-ben', 'Ben', 3, { played: 0 })],
    suggestion: null,
    cancel_vote: null,
    next_opponent: null,
    ...extra,
  };
}

const withMyMatch = (extra: Partial<MatchInfo>) =>
  tournament({
    rounds: [{ number: 2, status: 'running', bye: 'Dana', matches: [match('m2', ['p-ben', 'Ben'], [ME, 'Anna'], extra)] }],
    current_round: 2,
  });

describe('Turnier-Karte auf der Startseite', () => {
  it('Du bist dran: Gegner, Runde, Platz, Punkte, Bilanz, goldener Knopf', () => {
    const card = homeCard(tournament())!;
    expect(card.state).toEqual({ kind: 'your_turn', opponent: 'Ben' });
    expect(card.roundLabel).toBe('RUNDE 2 VON 3');
    expect([card.place, card.matchPoints, card.record]).toEqual([1, 3, '1-0-0']);
    expect(card.primary).toBe(true);
  });

  it('Match läuft: Lebenspunkte und Spielstand aus meiner Sicht (ich bin Spieler B)', () => {
    const card = homeCard(
      withMyMatch({ status: 'running', game_no: 2, games_a: 0, games_b: 1, life_a: 14, life_b: 8, tracker_mode: 'dual' }),
    )!;
    expect(card.state).toEqual({ kind: 'playing', opponent: 'Ben', gameNo: 2, myGames: 1, oppGames: 0, myLife: 8, oppLife: 14 });
    expect(card.primary).toBe(true);
  });

  it('Pause: nächster Gegner und Live-Stand der anderen, kein Gold', () => {
    const card = homeCard(
      tournament({
        rounds: [
          {
            number: 2,
            status: 'running',
            bye: 'Anna',
            matches: [match('m2', ['p-ben', 'Ben'], ['p-dana', 'Dana'], { status: 'running', life_a: 20, life_b: 11 })],
          },
        ],
        next_opponent: { player_id: 'p-ben', display_name: 'Ben', round: 3, wins: 2, draws: 1, losses: 0 },
      }),
    )!;
    expect(card.state).toMatchObject({ kind: 'bye', live: ['Ben – Dana 20 : 11'] });
    expect(card.state.kind === 'bye' && card.state.next?.display_name).toBe('Ben');
    expect(card.primary).toBe(false);
  });

  it('Mein Match fertig: nächste Runde golden, sobald alle Matches fertig sind', () => {
    const open = homeCard(withMyMatch({ status: 'finished', games_b: 2 }))!;
    expect(open.state).toEqual({ kind: 'done', canNextRound: false, openMatches: 1 });
    expect(open.primary).toBe(false);
    const ready = homeCard({ ...withMyMatch({ status: 'finished', games_b: 2 }), open_in_current: 0 })!;
    expect(ready.state).toEqual({ kind: 'done', canNextRound: true, openMatches: 0 });
    expect(ready.primary).toBe(true);
  });

  it('Beendet: Endplatz, Ranglistenpunkte und Sieger', () => {
    const card = homeCard(
      tournament({
        status: 'finished',
        standings: [
          standing('p-dana', 'Dana', 1, { final_place: 1, ranking_points: 5 }),
          standing(ME, 'Anna', 2, { final_place: 2, ranking_points: 3 }),
        ],
      }),
    )!;
    expect(card.state).toEqual({ kind: 'finished', place: 2, points: 3, winner: 'Dana' });
    expect(card.roundLabel).toBe('');
    expect(card.primary).toBe(false);
  });

  it('Vorbereitung, Einladung und Pause', () => {
    expect(homeCard(tournament({ status: 'drafting', current_round: null }))!.state).toEqual({ kind: 'prep', label: 'Draft läuft' });
    const invited = tournament({ status: 'setup' });
    invited.entries[0] = { ...invited.entries[0], status: 'invited' };
    expect(homeCard(invited)!.state).toEqual({ kind: 'invited' });
    expect(homeCard(tournament({ status: 'paused' }))!.state).toEqual({ kind: 'paused' });
  });

  it('Keine Karte, wenn ich nicht dabei bin, abgesagt habe oder das Turnier abgebrochen ist', () => {
    const notMine = tournament();
    notMine.entries = notMine.entries.map((e) => ({ ...e, is_me: false }));
    expect(homeCard(notMine)).toBeNull();
    const declined = tournament();
    declined.entries[0] = { ...declined.entries[0], status: 'declined' };
    expect(homeCard(declined)).toBeNull();
    expect(homeCard(tournament({ status: 'cancelled' }))).toBeNull();
  });

  it('Vor dem ersten Match keine Zahlen', () => {
    const card = homeCard(tournament({ standings: [standing(ME, 'Anna', 1, { played: 0 })] }))!;
    expect([card.place, card.matchPoints, card.record]).toEqual([null, null, null]);
  });

  it('Beendete Turniere nur am selben Tag', () => {
    expect(showOnHome('running', '2026-12-27', '2026-12-28')).toBe(true);
    expect(showOnHome('finished', '2026-12-28', '2026-12-28')).toBe(true);
    expect(showOnHome('finished', '2026-12-27', '2026-12-28')).toBe(false);
    expect(showOnHome('cancelled', '2026-12-28', '2026-12-28')).toBe(false);
    expect(localToday(new Date(2026, 11, 3, 23, 30))).toBe('2026-12-03');
  });
});
