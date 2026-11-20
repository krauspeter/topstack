import { describe, expect, it } from 'vitest';
import type { TrackerInfo } from '../api/types';
import type { GameEvent } from './lifeEvents';
import { matchState } from './match';
import { configFromTracker, defaultSide, freshEvents, fromApi, toApi } from './remote';

const info = (over: Partial<TrackerInfo> = {}): TrackerInfo => ({
  tournament_id: 't1',
  match: { id: 'm1', status: 'running', tracker_mode: 'dual', games_a: 0, games_b: 0, games_drawn: 0, version: 0 },
  player_a: { id: 'pa', display_name: 'Peter', colors: 'G', kind: 'member' },
  player_b: { id: 'pb', display_name: 'Ben', colors: null, kind: 'reserved' },
  my_player_id: 'pa',
  starting_life: 20,
  time_limit_min: 50,
  events: [],
  ...over,
});

const ev = (p: Partial<GameEvent>): GameEvent => ({
  id: 'e1',
  gameId: 'g1',
  playerId: 'pa',
  type: 'life',
  deviceId: 'd1',
  seq: 1,
  clientTs: '2027-01-20T19:00:00.000Z',
  source: 'app',
  ...p,
});

describe('toApi / fromApi', () => {
  it('rechnet Ereignisse hin und zurück', () => {
    const events = [
      ev({ delta: -3 }),
      ev({ id: 'e2', type: 'die_roll', value: 17, seq: 2 }),
      ev({ id: 'e3', type: 'undo', playerId: null, undoOf: 'e1', seq: 3 }),
      ev({ id: 'e4', type: 'game_end', reason: 'concede', seq: 4 }),
    ];
    expect(events.map(toApi).map(fromApi)).toEqual(events);
    expect(toApi(events[0])).toEqual({
      id: 'e1',
      game_id: 'g1',
      type: 'life',
      player_id: 'pa',
      delta: -3,
      device_id: 'd1',
      seq: 1,
      client_ts: '2027-01-20T19:00:00.000Z',
      source: 'app',
    });
  });

  it('vereinheitlicht die Zeitzone vom Server und ignoriert null-Felder', () => {
    const e = fromApi({ ...toApi(ev({})), client_ts: '2027-01-20T20:00:00+01:00', value: null, reason: null });
    expect(e.clientTs).toBe('2027-01-20T19:00:00.000Z');
    expect('value' in e).toBe(false);
    expect('reason' in e).toBe(false);
  });
});

describe('configFromTracker', () => {
  it('übernimmt Server-IDs, Startleben, Zeitlimit und Modus', () => {
    const c = configFromTracker(info(), 'pa');
    expect(c.id).toBe('m1');
    expect(c.players.map((p) => [p.id, p.name, p.colors])).toEqual([
      ['pa', 'Peter', 'G'],
      ['pb', 'Ben', undefined],
    ]);
    expect(c.timeLimitMin).toBe(50);
    expect(c.remote).toMatchObject({ tournamentId: 't1', matchId: 'm1', mode: 'dual', myPlayer: 'pa' });
    expect(matchState(c, []).phase).toBe('roll');
  });

  it('kein eigener Spieler im Modus shared', () => {
    const c = configFromTracker(info({ match: { ...info().match, tracker_mode: 'shared' } }), 'pa');
    expect(c.remote?.myPlayer).toBeNull();
  });
});

describe('freshEvents und defaultSide', () => {
  it('findet neue Ereignisse', () => {
    const a = ev({});
    const b = ev({ id: 'e2' });
    expect(freshEvents([a], [a, b])).toEqual([b]);
  });

  it('wer mitspielt, zählt sich selbst; sonst Auswahl', () => {
    expect(defaultSide(info())).toBe('pa');
    expect(defaultSide(info({ my_player_id: 'px' }))).toBeNull();
  });
});
