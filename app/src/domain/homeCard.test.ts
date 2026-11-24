import { describe, expect, it } from 'vitest';
import type { MatchInfo, Standing, Tournament } from '../api/types';
import { type HomeCard, homeCard, showOnHome, sortCards } from './homeCard';

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

/** Ich (Anna) habe in Runde 2 frei, Ben und Dana spielen; spätere Runden frei wählbar. */
const bye = (later: MatchInfo[][], extra: Partial<Tournament> = {}) =>
  tournament({
    rounds: [
      {
        number: 2,
        status: 'running',
        bye: 'Anna',
        matches: [match('m2', ['p-ben', 'Ben'], ['p-dana', 'Dana'], { status: 'running', life_a: 20, life_b: 11 })],
      },
      ...later.map((matches, i) => ({ number: 3 + i, status: 'planned' as const, bye: null, matches })),
    ],
    ...extra,
  });

describe('Turnier-Karte auf der Startseite', () => {
  it('Du bist dran: Gegner, Runde, Platz, Punkte, Bilanz, goldener Rahmen und Knopf', () => {
    const card = homeCard(tournament())!;
    expect(card.state).toEqual({ kind: 'your_turn', opponent: 'Ben' });
    expect(card.roundLabel).toBe('RUNDE 2 VON 3');
    expect([card.place, card.matchPoints, card.record]).toEqual([1, 3, '1-0-0']);
    expect([card.hot, card.primary, card.action.kind]).toEqual([true, true, 'open']);
  });

  it('Match läuft: Lebenspunkte und Spielstand aus meiner Sicht (ich bin Spieler B)', () => {
    const card = homeCard(
      withMyMatch({ status: 'running', game_no: 2, games_a: 0, games_b: 1, life_a: 14, life_b: 8, tracker_mode: 'dual' }),
    )!;
    expect(card.state).toEqual({ kind: 'playing', opponent: 'Ben', gameNo: 2, myGames: 1, oppGames: 0, myLife: 8, oppLife: 14 });
    expect(card.primary).toBe(true);
  });

  it('Vorgezogenes Match läuft: Karte zeigt mein Match, nicht die Pause', () => {
    const card = homeCard(bye([[match('m3', [ME, 'Anna'], ['p-chris', 'Chris'], { status: 'running', life_a: 17, life_b: 9 })]]))!;
    expect(card.state).toMatchObject({ kind: 'playing', opponent: 'Chris', myLife: 17, oppLife: 9 });
  });

  it('Pause ohne Vorziehen: Live-Stand der anderen, Rahmen gold, Knopf grau', () => {
    const card = homeCard(
      bye([[match('m3', [ME, 'Anna'], ['p-ben', 'Ben'])]], {
        next_opponent: { player_id: 'p-ben', display_name: 'Ben', round: 3, wins: 2, draws: 1, losses: 0 },
      }),
    )!;
    expect(card.state).toMatchObject({ kind: 'bye', live: [{ a: 'Ben', b: 'Dana', lifeA: 20, lifeB: 11 }] });
    expect(card.state.kind === 'bye' && card.state.next?.display_name).toBe('Ben');
    expect([card.hot, card.primary, card.action.kind]).toEqual([true, false, 'live']);
  });

  it('Pause: mein nächstes Match vorziehen, wenn der Gegner frei ist', () => {
    const card = homeCard(bye([[match('m3', ['p-chris', 'Chris'], [ME, 'Anna'])]]))!;
    expect(card.action).toEqual({ kind: 'pull', matchId: 'm3', opponent: 'Chris', round: 3 });
    expect(card.primary).toBe(true);
  });

  it('Vorziehen nur für das nächste eigene Match und nur mit Recht zum Eintragen', () => {
    const later = homeCard(bye([[match('m3', [ME, 'Anna'], ['p-ben', 'Ben'])], [match('m4', [ME, 'Anna'], ['p-chris', 'Chris'])]]))!;
    expect(later.action.kind).toBe('live');
    const noRight = homeCard(bye([[match('m3', [ME, 'Anna'], ['p-chris', 'Chris'], { can_report: false })]]))!;
    expect(noRight.action.kind).toBe('live');
  });

  it('Mein Match fertig, andere spielen noch: Live-Ansicht, sonst Vorziehen', () => {
    const t = tournament({
      rounds: [
        {
          number: 2,
          status: 'running',
          bye: null,
          matches: [
            match('m2', ['p-ben', 'Ben'], [ME, 'Anna'], { status: 'finished', games_b: 2 }),
            match('m5', ['p-dana', 'Dana'], ['p-chris', 'Chris'], { status: 'running', life_a: 5, life_b: 12 }),
          ],
        },
        { number: 3, status: 'planned', bye: null, matches: [match('m3', [ME, 'Anna'], ['p-dana', 'Dana'])] },
      ],
    });
    const waiting = homeCard(t)!;
    expect(waiting.state).toMatchObject({ kind: 'done', openMatches: 1, live: [{ a: 'Dana', b: 'Chris', lifeA: 5, lifeB: 12 }] });
    expect([waiting.action.kind, waiting.primary]).toEqual(['live', false]);
    t.rounds[1].matches[0] = match('m3', [ME, 'Anna'], ['p-ben', 'Ben']);
    expect(homeCard(t)!.action).toEqual({ kind: 'pull', matchId: 'm3', opponent: 'Ben', round: 3 });
  });

  it('Runde fertig: nächste Runde starten, nur mit Recht dazu', () => {
    const ready = { ...withMyMatch({ status: 'finished', games_b: 2 }), open_in_current: 0 };
    const card = homeCard(ready)!;
    expect(card.action).toEqual({ kind: 'next_round', round: 3 });
    expect(card.primary).toBe(true);
    const noRight = homeCard({ ...ready, actions: ['report_result'] })!;
    expect([noRight.action.kind, noRight.primary]).toEqual(['open', false]);
  });

  it('Beendet: Endplatz, Ranglistenpunkte und Sieger, ohne Gold', () => {
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
    expect([card.hot, card.primary]).toEqual([false, false]);
  });

  it('Vorbereitung, Einladung und Pause', () => {
    const prep = homeCard(tournament({ status: 'drafting', current_round: null }))!;
    expect(prep.state).toEqual({ kind: 'prep', label: 'Draft läuft' });
    expect(prep.hot).toBe(true);
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

  it('Zwei Turniere: Karte mit Aktion oben und allein gold, beendetes zuletzt', () => {
    const card = (id: string, hot: boolean, primary: boolean): HomeCard => ({ ...homeCard(tournament())!, id, hot, primary });
    const sorted = sortCards([card('fertig', false, false), card('wartet', true, false), card('dran', true, true)]);
    expect(sorted.map((c) => [c.id, c.hot, c.primary])).toEqual([
      ['dran', true, true],
      ['wartet', false, false],
    ]);
  });

  it('Beendete Turniere 24 Stunden nach dem Abschluss', () => {
    const end = Date.parse('2026-12-28T23:40:00Z');
    expect(showOnHome('running', null, end)).toBe(true);
    expect(showOnHome('finished', '2026-12-28T23:40:00Z', end + 23 * 3600_000)).toBe(true);
    expect(showOnHome('finished', '2026-12-28T23:40:00Z', end + 24 * 3600_000)).toBe(false);
    expect(showOnHome('finished', null, end)).toBe(false);
    expect(showOnHome('cancelled', null, end)).toBe(false);
  });
});
