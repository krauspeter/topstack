import { describe, expect, it } from 'vitest';
import { deltaText, direction, expected, kFactor, sparkPath, stakes } from './elo';

describe('Elo in der App (AP-5)', () => {
  it('rechnet wie der Server', () => {
    expect(kFactor(9)).toBe(40);
    expect(kFactor(10)).toBe(32);
    expect(expected(1400, 1000)).toBeCloseTo(0.909, 3);
    // Neuling gegen Gleichstarken: ±20
    expect(stakes(1000, 0, 1000)).toEqual({ win: 20, loss: 20 });
    // Anna 1061 (38 Matches) gegen Ben 1084: Außenseiterin gewinnt mehr
    const s = stakes(1061, 38, 1084);
    expect(s.win).toBeGreaterThan(s.loss);
    expect(s.win + s.loss).toBe(32);
  });

  it('beschreibt Richtung und Änderungen', () => {
    expect(direction([1000, 1001])).toBe('flat');
    expect(direction([1000, 1010])).toBe('up');
    expect(direction([1000, 990])).toBe('down');
    expect([deltaText(14.2), deltaText(-7), deltaText(0.2)]).toEqual(['+14', '−7', '±0']);
  });

  it('zeichnet die Mini-Kurve im Feld', () => {
    expect(sparkPath([1000, 1020, 1010], 64, 22)).toBe('M0 20 L32 2 L64 11');
    expect(sparkPath([1000, 1000], 64, 22)).toBe('M0 11 L64 11');
    expect(sparkPath([])).toBe('');
  });
});
