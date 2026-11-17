import { useMemo, useState } from 'react';
import { type GameEvent, lifeTotals, uuidv7 } from './domain/lifeEvents';

const DEVICE_ID = 'pwa-local';
const PLAYERS = [
  { id: 'a', name: 'Spieler A' },
  { id: 'b', name: 'Spieler B' },
] as const;

/** Platzhalter für Phase 2: zeigt, dass PWA, Reducer und Build funktionieren. */
export function App() {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const totals = useMemo(() => lifeTotals(PLAYERS.map((p) => p.id), events), [events]);

  const change = (playerId: string, delta: number) =>
    setEvents((prev) => [
      ...prev,
      {
        id: uuidv7(),
        gameId: 'local',
        playerId,
        type: 'life',
        delta,
        deviceId: DEVICE_ID,
        seq: prev.length + 1,
        clientTs: new Date().toISOString(),
        source: 'app',
      },
    ]);

  return (
    <main className="table">
      {PLAYERS.map((p, i) => (
        <section key={p.id} className={i === 0 ? 'half flipped' : 'half'}>
          <button aria-label={`${p.name} −1`} onClick={() => change(p.id, -1)}>
            −
          </button>
          <div className="life">
            <span data-testid={`life-${p.id}`}>{totals[p.id]}</span>
            <small>{p.name}</small>
          </div>
          <button aria-label={`${p.name} +1`} onClick={() => change(p.id, +1)}>
            +
          </button>
        </section>
      ))}
    </main>
  );
}
