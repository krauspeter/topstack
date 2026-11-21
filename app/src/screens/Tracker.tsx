import { useState } from 'react';
import type { EndReason, GameEvent } from '../domain/lifeEvents';
import {
  EXTRA_TURNS,
  type MatchConfig,
  type MatchState,
  controls,
  formatDelta,
  formatDuration,
  gameDuration,
  opponentOf,
  recentChange,
  suggestedWinner,
  timeLeft,
  winsNeeded,
} from '../domain/match';
import { buzz, useHold, useNow } from '../hooks';
import { halfStyle, playerColors } from '../theme';
import type { SyncInfo } from '../store/useSync';
import { ManaPips } from './ManaPips';

interface Props {
  config: MatchConfig;
  state: MatchState;
  events: readonly GameEvent[];
  onChange(playerId: string, delta: number): void;
  onUndo(): void;
  /** `null` = Spiel endet unentschieden (nach Zeitablauf). */
  onWin(winner: string | null, reason: EndReason): void;
  onAbort(): void;
  /** Nur bei Turnier-Matches: Stand der Übertragung an den Server. */
  sync?: SyncInfo;
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

export function Tracker({ config, state, events, onChange, onUndo, onWin, onAbort, sync }: Props) {
  const now = useNow(250);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<{ winner: string; reason: 'life' | 'concede' } | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [abort, setAbort] = useState(false);
  const [drawConfirm, setDrawConfirm] = useState(false);
  // Hinweis „Zeit abgelaufen“ einmal pro Spiel zeigen
  const [timeNoticeSeen, setTimeNoticeSeen] = useState<string | null>(null);

  const game = state.current;
  if (!game) return null;
  const ids = config.players.map((p) => p.id);
  const gameEvents = events.filter((e) => e.gameId === game.gameId);
  const name = (id: string) => config.players.find((p) => p.id === id)?.name ?? id;

  // Bei 0 Leben den Sieg vorschlagen; „Weiterspielen“ blendet den Vorschlag für genau diesen Stand aus.
  const totalsKey = ids.map((id) => state.totals[id]).join(':');
  const suggestion = suggestedWinner(state.totals, ids);
  const showTimeNotice = state.timeUp && timeNoticeSeen !== game.gameId && !menu && !confirm && !abort && !drawConfirm;
  const showSuggestion = suggestion !== null && dismissed !== totalsKey && !confirm && !menu && !showTimeNotice;
  const left = timeLeft(state, now);

  const step = (playerId: string, delta: number) => {
    onChange(playerId, delta);
    buzz();
  };

  const finish = (winner: string | null, reason: EndReason) => {
    setConfirm(null);
    setDrawConfirm(false);
    setMenu(false);
    setDismissed(null);
    onWin(winner, reason);
  };
  const mine = (id: string) => controls(config, id);
  const remote = config.remote;
  // Jeder sein eigenes Handy: Gegner oben und richtig herum, man selbst immer unten
  const myId = remote?.mode === 'dual' ? remote.myPlayer : null;
  const dual = myId !== null;
  const shown = dual ? [...config.players].sort((a, b) => Number(a.id === myId) - Number(b.id === myId)) : config.players;

  return (
    <main className={dual ? 'table dual' : 'table'}>
      {shown.map((p, i) => {
        const change = recentChange(gameEvents, p.id, now);
        const life = state.totals[p.id];
        const index = config.players.indexOf(p);
        return (
          <section
            key={p.id}
            className={`half tracker ${i === 0 && !dual ? 'flipped' : ''} ${life <= 0 ? 'dead' : ''}`}
            style={halfStyle(playerColors(p, index === 0 ? 0 : 1))}
            data-testid={`half-${p.id}`}
          >
            {mine(p.id) ? (
              <LifeButton label={`${p.name} −1`} sign={-1} onStep={(d) => step(p.id, d)} />
            ) : (
              <span className="step off" aria-hidden="true" />
            )}
            <div className="life">
              <span className={`delta ${change === null ? 'hidden' : change < 0 ? 'down' : 'up'}`} aria-live="polite">
                {change === null ? ' ' : formatDelta(change)}
              </span>
              <span className="value" data-testid={`life-${p.id}`}>
                {life}
              </span>
              <span className="who">
                <ManaPips colors={playerColors(p, i === 0 ? 0 : 1)} />
                {p.name}
                {game.starter === p.id && <span className="badge" title="Hat dieses Spiel begonnen">beginnt</span>}
              </span>
              <span className="pips" aria-label={`${state.wins[p.id]} Spielsiege`}>
                {Array.from({ length: winsNeeded(config.bestOf) }, (_, k) => (
                  <i key={k} className={k < state.wins[p.id] ? 'on' : ''} />
                ))}
              </span>
            </div>
            {mine(p.id) ? (
              <LifeButton label={`${p.name} +1`} sign={1} onStep={(d) => step(p.id, d)} />
            ) : (
              <span className="step off" aria-hidden="true" />
            )}
          </section>
        );
      })}

      <div className="center-bar">
        <button className="btn ghost icon" onClick={onUndo} aria-label="Rückgängig">
          ↶
        </button>
        <div className="score" data-testid="score">
          <strong>Spiel {game.number}</strong>
          {remote && sync && (
            <span className={sync.online && sync.pending === 0 ? 'sync ok' : 'sync'} data-testid="sync">
              {!sync.online ? 'offline · zählt weiter' : sync.pending > 0 ? `sendet ${sync.pending}` : 'gespeichert'}
            </span>
          )}
          <span>
            {state.wins[ids[0]]}:{state.wins[ids[1]]} ·{' '}
            {left === null ? (
              formatDuration(gameDuration(game, now))
            ) : state.timeUp ? (
              <b className="time-up">Zeit! +{EXTRA_TURNS} Züge</b>
            ) : (
              <span className={left < 5 * 60_000 ? 'time-low' : ''} aria-label="Restzeit">
                ⏱ {formatDuration(left)}
              </span>
            )}
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
            <button className="btn primary big" onClick={() => finish(suggestion, 'life_zero')}>
              Sieg bestätigen
            </button>
            <button className="btn" onClick={() => setDismissed(totalsKey)}>
              Weiterspielen
            </button>
          </div>
        </div>
      )}

      {menu && !confirm && !abort && !drawConfirm && (
        <div className="overlay" role="dialog" aria-label="Menü" onClick={() => setMenu(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {config.players.filter((p) => mine(p.id)).map((p) => (
              <button
                key={p.id}
                className="btn"
                onClick={() => setConfirm({ winner: opponentOf(ids, p.id), reason: 'concede' })}
              >
                {p.name} gibt auf
              </button>
            ))}
            {state.timeUp && (
              <button className="btn" onClick={() => setDrawConfirm(true)}>
                Spiel unentschieden beenden
              </button>
            )}
            <button className="btn danger" onClick={() => setAbort(true)}>
              {remote ? 'Tracker schließen' : 'Match abbrechen'}
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
            <button className="btn primary big" onClick={() => finish(confirm.winner, 'concede')}>
              Ja, Spiel beenden
            </button>
            <button className="btn" onClick={() => setConfirm(null)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
      {showTimeNotice && (
        <div className="overlay" role="dialog" aria-label="Zeit abgelaufen">
          <div className="sheet">
            <p>
              <strong>Die Zeit ist abgelaufen.</strong>
              <br />
              Es folgen noch {EXTRA_TURNS} Extra-Züge. Danach endet das Match, ein neues Spiel beginnt nicht mehr.
            </p>
            <p className="muted small">Ist das Spiel nach den Extra-Zügen nicht entschieden, beendet ihr es über das Menü als unentschieden.</p>
            <button className="btn primary big" onClick={() => setTimeNoticeSeen(game.gameId)}>
              Verstanden
            </button>
          </div>
        </div>
      )}

      {sync?.notice && (
        <div className="overlay" role="dialog" aria-label="Hinweis vom Server">
          <div className="sheet">
            <p>{sync.notice}</p>
            <p className="muted small">Der Stand vom Server wurde übernommen.</p>
            <button className="btn primary big" onClick={sync.dismiss}>
              OK
            </button>
          </div>
        </div>
      )}

      {drawConfirm && (
        <div className="overlay" role="dialog" aria-label="Unentschieden bestätigen">
          <div className="sheet">
            <p>
              <strong>Spiel {game.number} unentschieden beenden?</strong>
              <br />
              Das Match endet beim Stand {state.wins[ids[0]]}:{state.wins[ids[1]]}.
            </p>
            <button className="btn primary big" onClick={() => finish(null, 'time')}>
              Ja, unentschieden
            </button>
            <button className="btn" onClick={() => setDrawConfirm(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {abort && (
        <div className="overlay" role="dialog" aria-label={remote ? 'Tracker schließen' : 'Match abbrechen'}>
          <div className="sheet">
            {remote ? (
              <p>
                <strong>Tracker auf diesem Handy schließen?</strong>
                <br />
                Das Match bleibt im Turnier offen. {sync && sync.pending > 0 ? `${sync.pending} Eingaben sind noch nicht gesendet und gehen später raus.` : ''}
              </p>
            ) : (
              <p>
                <strong>Match wirklich abbrechen?</strong>
                <br />
                Es wird nicht gewertet.
              </p>
            )}
            <button className="btn danger big" onClick={onAbort}>
              {remote ? 'Ja, schließen' : 'Ja, abbrechen'}
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
