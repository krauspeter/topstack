import { describe, expect, it } from 'vitest';
import { PRESETS, avatarView, cropRect, initials, initialsBackground } from './avatars';

describe('Profilbilder (AP-15)', () => {
  it('kennt 16 Wesen in sechs Farben', () => {
    expect(PRESETS).toHaveLength(16);
    expect(new Set(PRESETS.map((p) => p.key)).size).toBe(16);
  });

  it('wählt Wesen, Bild oder Initialen', () => {
    expect(avatarView('preset:drache', 'Anna')).toMatchObject({ kind: 'preset', preset: { name: 'Drache' } });
    expect(avatarView('/api/v1/avatars/u1?v=1', 'Anna')).toEqual({ kind: 'image', url: '/api/v1/avatars/u1?v=1' });
    expect(avatarView('preset:unbekannt', 'Anna')).toEqual({ kind: 'initials', text: 'AN' });
    expect(avatarView(null, 'Ben Berger')).toEqual({ kind: 'initials', text: 'BB' });
    expect(avatarView('https://example.org/x.png', 'Ben')).toEqual({ kind: 'initials', text: 'BE' });
  });

  it('Initialen und Farben', () => {
    expect(initials('  ')).toBe('?');
    expect(initialsBackground('')).toBe('var(--gold)');
    expect(initialsBackground('UR')).toBe('linear-gradient(135deg, var(--mana-u), var(--mana-r))');
  });

  it('schneidet quadratisch aus', () => {
    expect(cropRect(400, 200, 1, 0, 0)).toEqual({ sx: 100, sy: 0, side: 200 });
    expect(cropRect(400, 200, 1, -1, 0)).toEqual({ sx: 0, sy: 0, side: 200 });
    expect(cropRect(400, 200, 2, 1, 1)).toEqual({ sx: 300, sy: 100, side: 100 });
  });
});
