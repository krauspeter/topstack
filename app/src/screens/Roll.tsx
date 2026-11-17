import { useEffect, useRef, useState } from 'react';
import { rollDie, rollWinner } from '../domain/dice';
import type { MatchPlayer } from '../domain/match';
import { buzz } from '../hooks';

const ROLL_MS = 900;

interface Props {
  players: readonly [MatchPlayer, MatchPlayer];
  onStart(rolls: { playerId: string; value: number }[], starter: string): void;
  onCancel(): void;
}

/** W20-Wurf vor Spiel 1: jeder würfelt selbst, der höhere Wurf beginnt, bei Gleichstand neu (UC-10). */
export function Roll({ players, onStart, onCancel }: Props) {
  const ids = players.map((p) => p.id);
  const [rolls, setRolls] = useState<Record<string, number | undefined>>({});
  const [spinning, setSpinning] = useState<Record<string, number | undefined>>({});
  const history = useRef<{ playerId: string; value: number }[]>([]);
  const timers = useRef<number[]>([]);

  const winner = rollWinner(rolls, ids);
  const tie = ids.every((id) => rolls[id] !== undefined) && winner === null;

  useEffect(() => () => timers.current.forEach((t) => window.clearInterval(t)), []);

  useEffect(() => {
    if (!tie) return;
    const t = window.setTimeout(() => setRolls({}), 1400);
    return () => window.clearTimeout(t);
  }, [tie]);

  const roll = (playerId: string) => {
    if (rolls[playerId] !== undefined || spinning[playerId] !== undefined) return;
    const value = rollDie(20);
    const startedAt = Date.now();
    const tick = window.setInterval(() => {
      if (Date.now() - startedAt >= ROLL_MS) {
        window.clearInterval(tick);
        setSpinning((s) => ({ ...s, [playerId]: undefined }));
        setRolls((r) => ({ ...r, [playerId]: value }));
        history.current.push({ playerId, value });
        buzz(20);
      } else {
        setSpinning((s) => ({ ...s, [playerId]: rollDie(20, Math.random) }));
      }
    }, 70);
    timers.current.push(tick);
    setSpinning((s) => ({ ...s, [playerId]: rollDie(20, Math.random) }));
  };

  const starterName = players.find((p) => p.id === winner)?.name;

  return (
    <main className="table">
      {players.map((p, i) => {
        const value = spinning[p.id] ?? rolls[p.id];
        const done = rolls[p.id] !== undefined;
        return (
          <section key={p.id} className={`half roll ${i === 0 ? 'flipped' : ''}`}>
            <button
              className={`die ${spinning[p.id] !== undefined ? 'spinning' : ''} ${winner === p.id ? 'won' : ''}`}
              onClick={() => roll(p.id)}
              disabled={done || winner !== null}
              aria-label={`${p.name} würfelt`}
            >
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <polygon points="50,4 93,28 93,72 50,96 7,72 7,28" />
              </svg>
              <span data-testid={`roll-${p.id}`}>{value ?? 'W20'}</span>
            </button>
            <p className="who">{p.name}</p>
            <p className="hint">
              {winner === p.id
                ? 'Du beginnst Spiel 1'
                : winner
                  ? `${starterName} beginnt`
                  : tie
                    ? 'Gleichstand – noch mal!'
                    : done
                      ? 'Warte auf den Gegner …'
                      : 'Tippen zum Würfeln'}
            </p>
          </section>
        );
      })}

      <div className="center-bar">
        <button className="btn ghost" onClick={onCancel}>
          Abbrechen
        </button>
        <button
          className="btn primary"
          disabled={winner === null}
          onClick={() => winner && onStart(history.current, winner)}
        >
          Spiel 1 starten
        </button>
      </div>
    </main>
  );
}
