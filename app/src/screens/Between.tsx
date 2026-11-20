import { useState } from 'react';
import { type MatchConfig, type MatchState, formatDuration, gameDuration, isDrawn, opponentOf } from '../domain/match';

interface ChooseProps {
  config: MatchConfig;
  state: MatchState;
  onChoose(starter: string): void;
}

/** Nach einem Spiel entscheidet der Verlierer, wer das nächste beginnt (F-09). */
export function ChooseStarter({ config, state, onChoose }: ChooseProps) {
  const ids = config.players.map((p) => p.id);
  const chooser = state.chooser ?? ids[0];
  const other = opponentOf(ids, chooser);
  const name = (id: string) => config.players.find((p) => p.id === id)?.name ?? id;
  const last = state.games.at(-1);
  // Der Verlierer soll die Frage lesen können: Sitzt er oben (Spieler 1), wird die Karte gedreht.
  const flipped = chooser === ids[0];

  return (
    <main className="page center">
      <div className={`card ${flipped ? 'flipped' : ''}`}>
        <p className="muted">
          Spiel {last?.number} an {name(last?.winner ?? '')} · Stand {state.wins[ids[0]]}:{state.wins[ids[1]]}
        </p>
        <h2>{name(chooser)}, wer beginnt Spiel {(last?.number ?? 0) + 1}?</h2>
        <div className="stack">
          <button className="btn primary big" onClick={() => onChoose(chooser)}>
            Ich beginne
          </button>
          <button className="btn big" onClick={() => onChoose(other)}>
            {name(other)} beginnt
          </button>
        </div>
      </div>
    </main>
  );
}

interface EndProps {
  config: MatchConfig;
  state: MatchState;
  onRematch(): void;
  onDone(): void;
  /** Turnier-Match: Ergebnis bestätigen, falls der Server es nicht schon selbst abgeschlossen hat. */
  onConfirm?(): Promise<void>;
}

export function MatchEnd({ config, state, onRematch, onDone, onConfirm }: EndProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remote = config.remote;
  const serverDone = remote?.server?.status === 'finished';
  const ids = config.players.map((p) => p.id);
  const name = (id: string | null) => config.players.find((p) => p.id === id)?.name ?? '–';
  const winner = state.winner;
  const loser = winner ? opponentOf(ids, winner) : null;
  const byTime = state.timeUp || state.games.some(isDrawn);

  return (
    <main className="page center">
      <div className="card trophy">
        <svg viewBox="0 0 64 64" aria-hidden="true" className="cup">
          <path d="M18 8h28v10a14 14 0 0 1-28 0z" />
          <path d="M18 12H8a10 10 0 0 0 10 12M46 12h10a10 10 0 0 1-10 12" fill="none" />
          <rect x="29" y="31" width="6" height="12" />
          <rect x="20" y="43" width="24" height="6" rx="2" />
        </svg>
        <h2 data-testid="match-winner">{state.draw ? 'Unentschieden' : `${name(winner)} gewinnt`}</h2>
        <p className="result">
          {winner && loser ? `${state.wins[winner]}:${state.wins[loser]}` : `${state.wins[ids[0]]}:${state.wins[ids[1]]}`}
        </p>
        {byTime && <p className="muted small">nach Zeitablauf</p>}
        <table className="games">
          <thead>
            <tr>
              <th>Spiel</th>
              <th>Begonnen</th>
              <th>Sieger</th>
              <th>Dauer</th>
            </tr>
          </thead>
          <tbody>
            {state.games.map((g) => (
              <tr key={g.gameId}>
                <td>{g.number}</td>
                <td>{name(g.starter)}</td>
                <td>{isDrawn(g) ? 'unentschieden' : name(g.winner)}</td>
                <td>{formatDuration(gameDuration(g))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {remote ? (
          <div className="stack">
            {serverDone ? (
              <p className="ok small" data-testid="result-saved">
                Ergebnis ist im Turnier eingetragen.
              </p>
            ) : (
              onConfirm && (
                <button
                  className="btn primary big"
                  disabled={sending}
                  onClick={async () => {
                    setSending(true);
                    setError(null);
                    try {
                      await onConfirm();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Fehler beim Speichern');
                    } finally {
                      setSending(false);
                    }
                  }}
                >
                  Ergebnis ins Turnier übernehmen
                </button>
              )
            )}
            {error && (
              <p className="warn" role="alert">
                {error}
              </p>
            )}
            <button className={serverDone ? 'btn primary big' : 'btn big'} onClick={onDone}>
              Zurück zum Turnier
            </button>
          </div>
        ) : (
          <div className="stack">
            <button className="btn primary big" onClick={onRematch}>
              Rückspiel
            </button>
            <button className="btn big" onClick={onDone}>
              Fertig
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
