import { describe, expect, it } from 'vitest';
import { filterQuery } from './Leaderboard';

describe('filterQuery', () => {
  it('lässt leere Filter weg', () => {
    expect(filterQuery('', '', '')).toBe('');
    expect(filterQuery('s1', '', '')).toBe('?season=s1');
    expect(filterQuery('', '2027-01-01', '2027-03-31')).toBe('?from=2027-01-01&to=2027-03-31');
  });
});
