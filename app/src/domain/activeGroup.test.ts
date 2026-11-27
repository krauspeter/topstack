import { describe, expect, it } from 'vitest';
import { bestOf, fitInto, matchResults, pickActiveGroup } from './activeGroup';

describe('pickActiveGroup', () => {
  const a = { id: 'a', archived: true };
  const b = { id: 'b' };
  const c = { id: 'c' };

  it('nimmt die zuletzt genutzte Gruppe, auch wenn sie archiviert ist', () => {
    expect(pickActiveGroup([a, b, c], 'c')).toBe(c);
    expect(pickActiveGroup([a, b, c], 'a')).toBe(a);
  });

  it('fällt auf die erste nicht archivierte zurück', () => {
    expect(pickActiveGroup([a, b, c], null)).toBe(b);
    expect(pickActiveGroup([a, b, c], 'weg')).toBe(b);
  });

  it('nimmt notfalls eine archivierte, ohne Gruppen nichts', () => {
    expect(pickActiveGroup([a], null)).toBe(a);
    expect(pickActiveGroup([], 'a')).toBeNull();
  });
});

describe('fitInto', () => {
  it('verkleinert auf 512 px an der langen Seite', () => {
    expect(fitInto(2048, 1024)).toEqual({ width: 512, height: 256 });
    expect(fitInto(1000, 3000)).toEqual({ width: 171, height: 512 });
  });

  it('vergrößert kleine Bilder nicht', () => {
    expect(fitInto(300, 200)).toEqual({ width: 300, height: 200 });
  });
});

describe('bestOf', () => {
  it('rechnet die nötigen Siege in Best-of um', () => {
    expect(bestOf(1)).toBe('Best-of-1');
    expect(bestOf(2)).toBe('Best-of-3');
    expect(bestOf(3)).toBe('Best-of-5');
  });
});

describe('matchResults', () => {
  it('Best-of-3 wie bisher', () => {
    expect(matchResults(2)).toEqual([
      [2, 0],
      [2, 1],
      [1, 0],
      [1, 1],
      [0, 1],
      [1, 2],
      [0, 2],
    ]);
  });

  it('Best-of-1 und Best-of-5', () => {
    expect(matchResults(1)).toEqual([
      [1, 0],
      [0, 1],
    ]);
    const bo5 = matchResults(3);
    expect(bo5[0]).toEqual([3, 0]);
    expect(bo5.at(-1)).toEqual([0, 3]);
    expect(bo5).toContainEqual([2, 2]);
    expect(bo5).not.toContainEqual([3, 3]);
  });
});
