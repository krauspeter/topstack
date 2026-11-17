import { describe, expect, it } from 'vitest';
import { rollDie, rollWinner } from './dice';
import { drawSeats, neighbour, passDirection, seatPosition } from './seating';

/** Deterministischer Zufall (mulberry32) für reproduzierbare Tests. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('drawSeats', () => {
  it('setzt jeden Spieler genau einmal', () => {
    const players = ['Anna', 'Ben', 'Chris', 'Dana', 'Eli'];
    const seats = drawSeats(players, seeded(1));
    expect([...seats].sort()).toEqual([...players].sort());
    expect(players).toEqual(['Anna', 'Ben', 'Chris', 'Dana', 'Eli']);
  });

  it('ist ungefähr gleichverteilt', () => {
    const rng = seeded(42);
    const firstSeat: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    for (let i = 0; i < 4000; i++) firstSeat[drawSeats(['A', 'B', 'C', 'D'], rng)[0]] += 1;
    for (const count of Object.values(firstSeat)) expect(count).toBeGreaterThan(850);
  });
});

describe('passDirection', () => {
  it('links, rechts, links', () => {
    expect([1, 2, 3].map(passDirection)).toEqual(['left', 'right', 'left']);
  });
  it('lehnt ungültige Booster ab', () => {
    expect(() => passDirection(0)).toThrow(RangeError);
  });
});

describe('neighbour', () => {
  const seats = ['A', 'B', 'C', 'D'];
  it('gibt nach links an den nächsten Platz', () => {
    expect(neighbour(seats, 'A', 1)).toBe('B');
    expect(neighbour(seats, 'D', 1)).toBe('A');
  });
  it('gibt nach rechts an den vorigen Platz', () => {
    expect(neighbour(seats, 'A', 2)).toBe('D');
    expect(neighbour(seats, 'C', 2)).toBe('B');
  });
});

describe('seatPosition', () => {
  it('beginnt oben und läuft im Uhrzeigersinn', () => {
    const top = seatPosition(0, 4, 10);
    const right = seatPosition(1, 4, 10);
    expect(top.x).toBeCloseTo(0);
    expect(top.y).toBeCloseTo(-10);
    expect(right.x).toBeCloseTo(10);
    expect(right.y).toBeCloseTo(0);
  });
});

describe('Würfel', () => {
  it('würfelt 1 bis 20', () => {
    expect(rollDie(20, () => 0)).toBe(1);
    expect(rollDie(20, () => 0.999999)).toBe(20);
  });
  it('höherer Wurf gewinnt, Gleichstand heißt neu würfeln', () => {
    expect(rollWinner({ A: 17, B: 3 }, ['A', 'B'])).toBe('A');
    expect(rollWinner({ A: 9, B: 9 }, ['A', 'B'])).toBeNull();
    expect(rollWinner({ A: 9 }, ['A', 'B'])).toBeNull();
  });
});
