import { useState } from 'react';
import type { GameEvent } from '../domain/lifeEvents';
import {
  type MatchConfig,
  type MatchState,
  formatDelta,
  formatDuration,
  gameDuration,
  opponentOf,
  recentChange,
  suggestedWinner,
  winsNeeded,
} from '../domain/match';
import { buzz, useHold, useNow } from '../hooks';

interface Props {
  config: MatchConfig;
  state: MatchState;
  events: readonly GameEvent[];
  onChange(playerId: string, delta: number): void;
  onUndo(): void;
  onWin(winner: string): void;
  onAbort(): void;
}

function LifeButton({ label, sign, onStep }: { label: string; sign: 1 | -1; onStep(delta: number): void }) {
  const hold = useHold(
    () => onStep(sign),
    () => onStep(sign * 5),
  );
  return (
    <button className="step" aria-label={label} {...hold}>
      {sign > 0 ? '+' : '−'}
    </button>
  );
}

export function Tracker({ config, state, events, onChange, onUndo, onWin, onAbort }: Props) {
  const now = useNow(250);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<{ winner: string; reason: 'life' | 'concede' } | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [abort, setAbort] = useState(false);

  const game = state.current;
  if (!game) return null;
  const ids = config.players.map((p) => p.id);
  const gameEvents = events.filter((e) => e.gameId === game.gameId);
  const name = (id: string) => config.players.find((p) => p.id === id)?.name ?? id;

  // Bei 0 Leben den Sieg vorschlagen; „Weiterspielen“ blendet den Vorschlag für genau diesen Stand aus.
  const totalsKey = ids.map((id) => state.totals[id]).join(':');
  const suggestion = suggestedWinner(state.totals, ids);
  const showSuggestion = suggestion !== null && dismissed !== totalsKey && !confirm && !menu;

  const step = (playerId: string, delta: number) => {
    onChange(playerId, delta);
    buzz();
  };

  const finish = (winner: string) => {
    setConfirm(null);
    setMenu(false);
    setDismissed(null);
    onWin(winner);
  };

  return (
    <main className="table">
      {config.players.map((p, i) => {
        const change = recentChange(gameEvents, p.id, now);
        const life = state.totals[p.id];
        return (
          <section key={p.id} className={`half tracker ${i === 0 ? 'flipped' : ''} ${life <= 0 ? 'dead' : ''}`}>
            <LifeButton label={`${p.name} −1`} sign={-1} onStep={(d) => step(p.id, d)} />
            <div className="life">
              <span className={`delta ${change === null ? 'hidden' : change < 0 ? 'down' : 'up'}`} aria-live="polite">
                {change === null ? ' ' : formatDelta(change)}
              </span>
              <span className="value" data-testid={`life-${p.id}`}>
                {life}
              </span>
              <span className="who">
                {p.name}
                {game.starter === p.id && <span className="badge" title="Hat dieses Spiel begonnen">beginnt</span>}
              </span>
              <span className="pips" aria-label={`${state.wins[p.id]} Spielsiege`}>
                {Array.from({ length: winsNeeded(config.bestOf) }, (_, k) => (
                  <i key={k} className={k < state.wins[p.id] ? 'on' : ''} />
                ))}
              </span>
            </div>
            <LifeButton label={`${p.name} +1`} sign={1} onStep={(d) => step(p.id, d)} />
          </section>
        );
      })}

      <div className="center-bar">
        <button className="btn ghost icon" onClick={onUndo} aria-label="Rückgängig">
          ↶
        </button>
        <div className="score" data-testid="score">
          <strong>Spiel {game.number}</strong>
          <span>
            {state.wins[ids[0]]}:{state.wins[ids[1]]} · {formatDuration(gameDuration(game, now))}
          </span>
        </div>
        <button className="btn ghost icon" onClick={() => setMenu(true)} aria-label="Menü">
          ⋯
        </button>
      </div>

      {showSuggestion && (
        <div className="overlay" role="dialog" aria-label="Sieg vorschlagen">
          <div className="sheet">
            <p>
              {name(opponentOf(ids, suggestion))} hat keine Leben mehr.
              <br />
              <strong>Sieg für {name(suggestion)}?</strong>
            </p>
            <button className="btn primary big" onClick={() => finish(suggestion)}>
              Sieg bestätigen
            </button>
            <button className="btn" onClick={() => setDismissed(totalsKey)}>
              Weiterspielen
            </button>
          </div>
        </div>
      )}

      {menu && !confirm && !abort && (
        <div className="overlay" role="dialog" aria-label="Menü" onClick={() => setMenu(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {config.players.map((p) => (
              <button
                key={p.id}
                className="btn"
                onClick={() => setConfirm({ winner: opponentOf(ids, p.id), reason: 'concede' })}
              >
                {p.name} gibt auf
              </button>
            ))}
            <button className="btn danger" onClick={() => setAbort(true)}>
              Match abbrechen
            </button>
            <button className="btn ghost" onClick={() => setMenu(false)}>
              Schließen
            </button>
          </div>
        </div>
      )}

      {confirm && (
        <div className="overlay" role="dialog" aria-label="Aufgeben bestätigen">
          <div className="sheet">
            <p>
              {name(opponentOf(ids, confirm.winner))} gibt Spiel {game.number} auf.
              <br />
              <strong>Sieg für {name(confirm.winner)}?</strong>
            </p>
            <button className="btn primary big" onClick={() => finish(confirm.winner)}>
              Ja, Spiel beenden
            </button>
            <button className="btn" onClick={() => setConfirm(null)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
      {abort && (
        <div className="overlay" role="dialog" aria-label="Match abbrechen">
          <div className="sheet">
            <p>
              <strong>Match wirklich abbrechen?</strong>
              <br />
              Es wird nicht gewertet.
            </p>
            <button className="btn danger big" onClick={onAbort}>
              Ja, abbrechen
            </button>
            <button className="btn" onClick={() => setAbort(false)}>
              Weiterspielen
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
