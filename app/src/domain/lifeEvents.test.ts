import { describe, expect, it } from 'vitest';
import { type GameEvent, lastUndoable, lifeTotals, mergeEvents, uuidv7 } from './lifeEvents';

let n = 0;
const ev = (p: Partial<GameEvent>): GameEvent => ({
  id: `e${++n}`,
  gameId: 'g1',
  playerId: 'A',
  type: 'life',
  deviceId: 'd1',
  seq: n,
  clientTs: new Date(0).toISOString(),
  source: 'app',
  ...p,
});

describe('lifeTotals', () => {
  it('summiert die Änderungen', () => {
    const events = [ev({ delta: -3 }), ev({ delta: -2 }), ev({ playerId: 'B', delta: -5, deviceId: 'd2' })];
    expect(lifeTotals(['A', 'B'], events)).toEqual({ A: 15, B: 15 });
  });

  it('berücksichtigt Rückgängig', () => {
    const hit = ev({ delta: -7 });
    const undo = ev({ type: 'undo', playerId: null, undoOf: hit.id });
    expect(lifeTotals(['A'], [hit, undo])).toEqual({ A: 20 });
  });
});

describe('mergeEvents', () => {
  it('ist idempotent', () => {
    const e = ev({ delta: -1 });
    expect(mergeEvents([e], [e, e])).toHaveLength(1);
  });
});

describe('lastUndoable', () => {
  it('liefert das jüngste eigene Ereignis', () => {
    const a = ev({ delta: -1 });
    const b = ev({ delta: -2 });
    const other = ev({ delta: -9, deviceId: 'd2' });
    expect(lastUndoable([a, b, other], 'd1')?.id).toBe(b.id);
    const undo = ev({ type: 'undo', undoOf: b.id });
    expect(lastUndoable([a, b, undo], 'd1')?.id).toBe(a.id);
  });
});

describe('uuidv7', () => {
  it('hat Version 7 und ist zeitlich sortierbar', () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
  });
});
