/**
 * Turnier-Matches auf dem Server (ADR-0012): Umrechnung zwischen App und API.
 * Reine Funktionen, damit sie ohne Browser getestet werden können.
 */
import type { ApiEvent, TrackerInfo, TrackerMatch } from '../api/types';
import type { GameEvent } from './lifeEvents';
import type { Lobby, MatchConfig, RemoteStatus } from './match';

export function toApi(e: GameEvent): ApiEvent {
  return {
    id: e.id,
    game_id: e.gameId,
    type: e.type,
    player_id: e.playerId,
    ...(e.delta !== undefined ? { delta: e.delta } : {}),
    ...(e.value !== undefined ? { value: e.value } : {}),
    ...(e.undoOf !== undefined ? { undo_of: e.undoOf } : {}),
    ...(e.reason !== undefined ? { reason: e.reason } : {}),
    device_id: e.deviceId,
    seq: e.seq,
    client_ts: e.clientTs,
    source: e.source,
  };
}

export function fromApi(e: ApiEvent): GameEvent {
  return {
    id: e.id,
    gameId: e.game_id,
    playerId: e.player_id,
    type: e.type,
    deviceId: e.device_id,
    seq: e.seq,
    // Server liefert z. B. „+00:00“; einheitlich als ISO mit „Z“, damit Vergleiche passen
    clientTs: new Date(e.client_ts).toISOString(),
    source: e.source,
    ...(e.delta != null ? { delta: e.delta } : {}),
    ...(e.value != null ? { value: e.value } : {}),
    ...(e.undo_of != null ? { undoOf: e.undo_of } : {}),
    ...(e.reason != null ? { reason: e.reason } : {}),
  };
}

export function remoteStatus(m: TrackerMatch): RemoteStatus {
  return { status: m.status, gamesA: m.games_a, gamesB: m.games_b, gamesDrawn: m.games_drawn, version: m.version };
}

export function lobbyFrom(info: TrackerInfo): Lobby {
  const seats: Record<string, string> = {};
  const rolls: Record<string, number> = {};
  for (const s of info.seats ?? []) {
    seats[s.player_id] = s.device_id;
    if (s.roll !== null) rolls[s.player_id] = s.roll;
  }
  return { seats, rolls, tie: info.tie ?? null };
}

/** Match-Konfiguration aus dem Stand des Servers; Spieler-IDs sind die Server-IDs. */
export function configFromTracker(info: TrackerInfo, myPlayer: string | null, now = new Date()): MatchConfig {
  const mode = info.match.tracker_mode === 'dual' ? 'dual' : 'shared';
  return {
    id: info.match.id,
    players: [
      { id: info.player_a.id, name: info.player_a.display_name, colors: info.player_a.colors ?? undefined },
      { id: info.player_b.id, name: info.player_b.display_name, colors: info.player_b.colors ?? undefined },
    ],
    startingLife: info.starting_life,
    bestOf: 3,
    timeLimitMin: info.time_limit_min,
    createdAt: now.toISOString(),
    remote: {
      tournamentId: info.tournament_id,
      matchId: info.match.id,
      mode,
      myPlayer: mode === 'dual' ? myPlayer : null,
      server: remoteStatus(info.match),
      lobby: lobbyFrom(info),
    },
  };
}

/** Ereignisse, die in `next` neu sind; diese wandern in die Outbox. */
export function freshEvents(prev: readonly GameEvent[], next: readonly GameEvent[]): GameEvent[] {
  const known = new Set(prev.map((e) => e.id));
  return next.filter((e) => !known.has(e.id));
}

/**
 * Wen zählt dieses Handy im Modus `dual`? Wer selbst mitspielt, zählt sich; sonst muss
 * man wählen (z. B. Peter hält das Handy für einen Spieler ohne Konto).
 */
export function defaultSide(info: TrackerInfo): string | null {
  const me = info.my_player_id;
  return me === info.player_a.id || me === info.player_b.id ? me : null;
}
