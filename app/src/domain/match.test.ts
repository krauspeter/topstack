import { describe, expect, it } from 'vitest';
import type { GameEvent } from './lifeEvents';
import {
  type MatchConfig,
  deriveGames,
  formatDelta,
  formatDuration,
  matchState,
  recentChange,
  suggestedWinner,
  winsNeeded,
} from './match';

const config: MatchConfig = {
  id: 'm1',
  players: [
    { id: 'A', name: 'Anna' },
    { id: 'B', name: 'Ben' },
  ],
  startingLife: 20,
  bestOf: 3,
  createdAt: new Date(0).toISOString(),
};

let n = 0;
const t0 = Date.parse('2027-01-10T19:00:00Z');
const ev = (p: Partial<GameEvent>, atMs = n * 1000): GameEvent => {
  n += 1;
  return {
    id: `e${n}`,
    gameId: 'g1',
    playerId: 'A',
    type: 'life',
    deviceId: 'd1',
    seq: n,
    clientTs: new Date(t0 + atMs).toISOString(),
    source: 'app',
    ...p,
  };
};
const start = (gameId: string, starter: string) => ev({ type: 'game_start', gameId, playerId: starter });
const end = (gameId: string, winner: string) => ev({ type: 'game_end', gameId, playerId: winner });

describe('winsNeeded', () => {
  it('Best-of-3 braucht zwei Siege', () => {
    expect(winsNeeded(3)).toBe(2);
    expect(winsNeeded(1)).toBe(1);
    expect(winsNeeded(5)).toBe(3);
  });
});

describe('matchState', () => {
  it('beginnt mit dem W20-Wurf', () => {
    const s = matchState(config, []);
    expect(s.phase).toBe('roll');
    expect(s.totals).toEqual({ A: 20, B: 20 });
  });

  it('zählt nur die Lebenspunkte des laufenden Spiels', () => {
    const events = [
      start('g1', 'A'),
      ev({ gameId: 'g1', playerId: 'B', delta: -20 }),
      end('g1', 'A'),
      start('g2', 'B'),
      ev({ gameId: 'g2', playerId: 'A', delta: -3 }),
    ];
    const s = matchState(config, events);
    expect(s.phase).toBe('playing');
    expect(s.current?.number).toBe(2);
    expect(s.current?.starter).toBe('B');
    expect(s.totals).toEqual({ A: 17, B: 20 });
    expect(s.wins).toEqual({ A: 1, B: 0 });
  });

  it('lässt nach einem Spiel den Verlierer wählen', () => {
    const s = matchState(config, [start('g1', 'A'), end('g1', 'A')]);
    expect(s.phase).toBe('choose');
    expect(s.chooser).toBe('B');
    expect(s.totals).toEqual({ A: 20, B: 20 });
  });

  it('endet mit zwei Siegen', () => {
    const events = [start('g1', 'A'), end('g1', 'B'), start('g2', 'A'), end('g2', 'A'), start('g3', 'B'), end('g3', 'B')];
    const s = matchState(config, events);
    expect(s.phase).toBe('finished');
    expect(s.winner).toBe('B');
    expect(s.wins).toEqual({ A: 1, B: 2 });
    expect(s.games.map((g) => g.winner)).toEqual(['B', 'A', 'B']);
  });

  it('endet bei 2:0 ohne drittes Spiel', () => {
    const s = matchState(config, [start('g1', 'A'), end('g1', 'A'), start('g2', 'B'), end('g2', 'A')]);
    expect(s.phase).toBe('finished');
    expect(s.winner).toBe('A');
  });
});

describe('deriveGames', () => {
  it('nummeriert in zeitlicher Reihenfolge, unabhängig von der Speicherreihenfolge', () => {
    const g1 = start('g1', 'A');
    const g2 = start('g2', 'B');
    expect(deriveGames([g2, g1]).map((g) => [g.gameId, g.number])).toEqual([
      ['g1', 1],
      ['g2', 2],
    ]);
  });
});

describe('suggestedWinner', () => {
  it('schlägt den Gegner vor, wenn einer auf 0 ist', () => {
    expect(suggestedWinner({ A: 0, B: 4 }, ['A', 'B'])).toBe('B');
    expect(suggestedWinner({ A: 3, B: -2 }, ['A', 'B'])).toBe('A');
  });
  it('schlägt nichts vor, wenn keiner oder beide auf 0 sind', () => {
    expect(suggestedWinner({ A: 1, B: 4 }, ['A', 'B'])).toBeNull();
    expect(suggestedWinner({ A: 0, B: 0 }, ['A', 'B'])).toBeNull();
  });
});

describe('recentChange', () => {
  it('fasst schnelle Änderungen zusammen', () => {
    const events = [ev({ delta: -1 }, 0), ev({ delta: -1 }, 500), ev({ delta: -5 }, 1200)];
    expect(recentChange(events, 'A', t0 + 1500)).toBe(-7);
  });

  it('beginnt nach einer Pause neu', () => {
    const events = [ev({ delta: -4 }, 0), ev({ delta: -2 }, 10_000)];
    expect(recentChange(events, 'A', t0 + 10_500)).toBe(-2);
  });

  it('verschwindet nach Ablauf und ignoriert Zurückgenommenes', () => {
    const hit = ev({ delta: -3 }, 0);
    expect(recentChange([hit], 'A', t0 + 5000)).toBeNull();
    const undo = ev({ type: 'undo', playerId: null, undoOf: hit.id }, 100);
    expect(recentChange([hit, undo], 'A', t0 + 200)).toBeNull();
  });

  it('zählt nur den gefragten Spieler', () => {
    const events = [ev({ delta: -1 }, 0), ev({ playerId: 'B', delta: +2 }, 100)];
    expect(recentChange(events, 'B', t0 + 200)).toBe(2);
  });
});

describe('Formatierung', () => {
  it('zeigt Änderungen mit Vorzeichen', () => {
    expect(formatDelta(-7)).toBe('−7');
    expect(formatDelta(3)).toBe('+3');
  });
  it('zeigt Dauer als m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(754_000)).toBe('12:34');
  });
});
