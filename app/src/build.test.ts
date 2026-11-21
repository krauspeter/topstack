import { describe, expect, it } from 'vitest';
import { buildLabel, buildTime } from './build';

describe('buildLabel', () => {
  it('zeigt PR-Nummer und deutsche Zeit', () => {
    expect(buildLabel({ pr: '118', sha: 'abcdef1', time: '2026-11-21T11:40:00Z' })).toBe(
      'Update #118 · 21.11.2026, 12:40',
    );
  });

  it('ohne PR den Commit, lokal den Entwicklungsstand', () => {
    expect(buildLabel({ pr: '', sha: 'abcdef1', time: '' })).toBe('Stand abcdef1');
    expect(buildLabel({ pr: '', sha: '', time: '' })).toBe('Entwicklungsstand');
  });

  it('Sommerzeit wird berücksichtigt', () => {
    expect(buildTime('2027-07-01T10:05:00Z')).toBe('01.07.2027, 12:05');
    expect(buildTime('kaputt')).toBe('');
  });
});
