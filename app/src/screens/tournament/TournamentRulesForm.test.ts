import { describe, expect, it } from 'vitest';
import { changedRules, customRulesText } from './TournamentRulesForm';

const GROUP = {
  games_to_win: 2,
  starting_life: 20,
  match_time_limit_min: null,
  match_points_win: 3,
  match_points_draw: 1,
  match_points_loss: 0,
};

describe('Regeln pro Turnier (AP-3)', () => {
  it('schickt nur, was von der Gruppe abweicht', () => {
    expect(changedRules(GROUP, { ...GROUP, games_to_win: 1, starting_life: 30 })).toEqual({ games_to_win: 1, starting_life: 30 });
    expect(changedRules(GROUP, GROUP)).toEqual({});
  });

  it('beschreibt die Abweichungen kurz', () => {
    const rules = { ...GROUP, games_to_win: 1, starting_life: 30, match_points_win: 2, custom: ['games_to_win', 'starting_life', 'match_points_win'] };
    expect(customRulesText(rules)).toBe('Best-of-1 · 30 Leben · Punkte 2/1/0');
    expect(customRulesText({ ...GROUP, custom: [] })).toBe('');
  });
});
