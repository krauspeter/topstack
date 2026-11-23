import { describe, expect, it } from 'vitest';
import { buildLabel, buildTime } from './build';

describe('buildLabel', () => {
  it('zeigt Version, PR-Nummer und deutsche Zeit', () => {
    expect(buildLabel({ version: '0.9.0', pr: '143', sha: 'abcdef1', time: '2026-11-23T15:40:00Z' })).toBe(
      'v0.9.0 · Update #143 · 23.11.2026, 16:40',
    );
  });

  it('ohne Version wie bisher', () => {
    expect(buildLabel({ version: '', pr: '118', sha: 'abcdef1', time: '2026-11-21T11:40:00Z' })).toBe(
      'Update #118 · 21.11.2026, 12:40',
    );
  });

  it('ohne PR den Commit, lokal den Entwicklungsstand', () => {
    expect(buildLabel({ version: '', pr: '', sha: 'abcdef1', time: '' })).toBe('Stand abcdef1');
    expect(buildLabel({ version: '1.0.0-rc.1', pr: '', sha: '', time: '' })).toBe('v1.0.0-rc.1 · Entwicklungsstand');
  });

  it('Sommerzeit wird berücksichtigt', () => {
    expect(buildTime('2027-07-01T10:05:00Z')).toBe('01.07.2027, 12:05');
    expect(buildTime('kaputt')).toBe('');
  });
});
