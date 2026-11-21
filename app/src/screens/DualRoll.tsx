import { useEffect, useRef, useState } from 'react';
import { api, errorText } from '../api/client';
import type { TrackerInfo } from '../api/types';
import { rollDie } from '../domain/dice';
import type { MatchConfig } from '../domain/match';
import { buzz } from '../hooks';
import { halfStyle, playerColors } from '../theme';

const ROLL_MS = 900;

interface Props {
  config: MatchConfig;
  device: string;
  /** Antwort des Servers übernehmen (Warteraum, Ereignisse). */
  onInfo(info: TrackerInfo): void;
  onStart(rolls: { playerId: string; value: number }[], starter: string): void;
  onCancel(): void;
}

/**
 * „Jeder sein eigenes Handy“ vor Spiel 1 (UC-10, UC-11): warten, bis beide da sind,
 * dann würfelt jeder nur seinen eigenen W20. Wer höher würfelt, wählt, wer beginnt.
 * Der Gegner steht oben und richtig herum, man selbst unten.
 */
export function DualRoll({ config, device, onInfo, onStart, onCancel }: Props) {
  const remote = config.remote;
  const me = remote?.myPlayer ?? config.players[1].id;
  const meIndex: 0 | 1 = config.players[0].id === me ? 0 : 1;
  const oppIndex: 0 | 1 = meIndex === 0 ? 1 : 0;
  const mine = config.players[meIndex];
  const opp = config.players[oppIndex];
  const lobby = remote?.lobby ?? { seats: {}, rolls: {}, tie: null };
  const base = `/tournaments/${remote?.tournamentId}/matches/${remote?.matchId}/tracker/seats`;

  const [spin, setSpin] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => void (timer.current !== null && window.clearInterval(timer.current)), []);

  const oppHere = lobby.seats[opp.id] !== undefined;
  const meHere = lobby.seats[me] === device;
  const myRoll = lobby.rolls[me];
  const oppRoll = lobby.rolls[opp.id];
  const both = myRoll !== undefined && oppRoll !== undefined;
  const winner = both && myRoll !== oppRoll ? (myRoll > oppRoll ? me : opp.id) : null;

  const call = async (path: string, body: object) => {
    setSending(true);
    setError(null);
    try {
      onInfo(await api<TrackerInfo>(path, { method: 'PUT', body }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  };

  const roll = () => {
    if (spin !== null || sending || myRoll !== undefined || !oppHere) return;
    const value = rollDie(20);
    const startedAt = Date.now();
    timer.current = window.setInterval(() => {
      if (Date.now() - startedAt >= ROLL_MS) {
        if (timer.current !== null) window.clearInterval(timer.current);
        timer.current = null;
        setSpin(null);
        buzz(20);
        void call(`${base}/${me}/roll`, { device_id: device, value });
      } else {
        setSpin(rollDie(20, Math.random));
      }
    }, 70);
    setSpin(rollDie(20, Math.random));
  };

  const rolls = () => [
    { playerId: me, value: myRoll ?? 0 },
    { playerId: opp.id, value: oppRoll ?? 0 },
  ];

  return (
    <main className="table dual">
      <section className="half roll" style={halfStyle(playerColors(opp, oppIndex))} data-testid="half-opponent">
        <div className={`die ${winner === opp.id ? "won" : ""}`} role="img" aria-label={`W20 von ${opp.name}`}>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <polygon points="50,4 93,28 93,72 50,96 7,72 7,28" />
          </svg>
          <span data-testid={`roll-${opp.id}`}>{oppRoll ?? (oppHere ? '…' : '?')}</span>
        </div>
        <p className="who">{opp.name}</p>
        <p className="hint" data-testid="opponent-status">
          {!oppHere
            ? `Warte auf ${opp.name} … ${opp.name} öffnet das Match auf dem eigenen Handy.`
            : oppRoll === undefined
              ? `${opp.name} ist da und würfelt …`
              : winner === opp.id
                ? `${opp.name} entscheidet, wer beginnt …`
                : `${opp.name} hat gewürfelt`}
        </p>
      </section>

      <div className="center-bar">
        <button className="btn ghost" onClick={onCancel}>
          Schließen
        </button>
        <span className="muted small">
          {lobby.tie !== null && !both ? `Gleichstand bei ${lobby.tie} – beide noch mal!` : 'Höherer Wurf wählt, wer beginnt'}
        </span>
      </div>

      <section className="half roll" style={halfStyle(playerColors(mine, meIndex))} data-testid="half-me">
        <button
          className={`die ${spin !== null ? 'spinning' : ''} ${winner === me ? 'won' : ''}`}
          onClick={roll}
          disabled={!oppHere || !meHere || myRoll !== undefined || sending || spin !== null}
          aria-label={`${mine.name} würfelt`}
        >
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <polygon points="50,4 93,28 93,72 50,96 7,72 7,28" />
          </svg>
          <span data-testid={`roll-${me}`}>{spin ?? myRoll ?? 'W20'}</span>
        </button>
        <p className="who">{mine.name}</p>
        {!meHere ? (
          <div className="stack">
            <p className="hint">Für {mine.name} zählt jetzt ein anderes Handy.</p>
            <button className="btn" onClick={() => void call(`${base}/${me}`, { device_id: device, force: true })}>
              Hierher zurückholen
            </button>
          </div>
        ) : winner === me ? (
          <div className="choose" role="group" aria-label="Wer beginnt Spiel 1?">
            <p className="hint">Du hast gewonnen. Wer beginnt Spiel 1?</p>
            <button className="btn primary" onClick={() => onStart(rolls(), me)}>
              Ich beginne
            </button>
            <button className="btn" onClick={() => onStart(rolls(), opp.id)}>
              {opp.name} beginnt
            </button>
          </div>
        ) : (
          <p className="hint">
            {!oppHere
              ? 'Würfeln geht los, sobald beide da sind.'
              : myRoll === undefined
                ? 'Tippen zum Würfeln'
                : winner
                  ? `${opp.name} hat höher gewürfelt`
                  : 'Warte auf den Wurf des Gegners …'}
          </p>
        )}
        {error && (
          <p className="warn" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
