import { describe, expect, it } from 'vitest';
import { qrMatrix } from './qr';

/** Finder-Muster: 7×7, Rand dunkel, Ring hell, Kern 3×3 dunkel. */
function hasFinder(m: boolean[][], x0: number, y0: number): boolean {
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
      if (m[y0 + y][x0 + x] !== (ring !== 2)) return false;
    }
  }
  return true;
}

describe('qrMatrix', () => {
  it('wählt die kleinste Version', () => {
    expect(qrMatrix('HI')).toHaveLength(21); // Version 1
    expect(qrMatrix(`https://topstack.win/gast/${'x'.repeat(43)}`)).toHaveLength(37); // Version 5
  });

  it('setzt die drei Finder-Muster', () => {
    const m = qrMatrix('https://topstack.win/gast/abc');
    const n = m.length;
    expect(hasFinder(m, 0, 0)).toBe(true);
    expect(hasFinder(m, n - 7, 0)).toBe(true);
    expect(hasFinder(m, 0, n - 7)).toBe(true);
  });

  it('ist deterministisch und quadratisch', () => {
    const a = qrMatrix('TopStack');
    expect(a).toEqual(qrMatrix('TopStack'));
    expect(a.every((row) => row.length === a.length)).toBe(true);
  });

  it('lehnt zu lange Texte ab', () => {
    expect(() => qrMatrix('x'.repeat(300))).toThrow();
  });
});
