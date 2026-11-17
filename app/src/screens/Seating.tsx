import { type FormEvent, useEffect, useRef, useState } from 'react';
import { BOOSTERS_PER_PLAYER, drawSeats, neighbour, passDirection, seatPosition } from '../domain/seating';
import { buzz } from '../hooks';

const PLAYERS_KEY = 'topstack.draftPlayers';
const SHUFFLE_MS = 1600;
const SIZE = 340;
const C = SIZE / 2;

function loadPlayers(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PLAYERS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : [];
  } catch {
    return [];
  }
}

/** Draftplätze zufällig auslosen und als runde Tischgrafik mit Passrichtung zeigen (F-03, F-04, UC-06). */
export function Seating({ onBack }: { onBack(): void }) {
  const [players, setPlayers] = useState<string[]>(loadPlayers);
  const [draft, setDraft] = useState('');
  const [seats, setSeats] = useState<string[] | null>(null);
  const [shuffling, setShuffling] = useState(false);
  const [booster, setBooster] = useState(1);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    try {
      localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
    } catch {
      // ignorieren
    }
  }, [players]);

  useEffect(() => () => window.clearInterval(timer.current), []);

  const add = (e: FormEvent) => {
    e.preventDefault();
    const n = draft.trim();
    if (!n || players.some((p) => p.toLocaleLowerCase('de') === n.toLocaleLowerCase('de'))) return;
    setPlayers((prev) => [...prev, n]);
    setDraft('');
    setSeats(null);
  };

  const remove = (n: string) => {
    setPlayers((prev) => prev.filter((p) => p !== n));
    setSeats(null);
  };

  const draw = () => {
    if (players.length < 2 || shuffling) return;
    const final = drawSeats(players);
    const startedAt = Date.now();
    setShuffling(true);
    setBooster(1);
    window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      if (Date.now() - startedAt >= SHUFFLE_MS) {
        window.clearInterval(timer.current);
        setSeats(final);
        setShuffling(false);
        buzz(30);
      } else {
        // Nur Show: die Animation nutzt einfachen Zufall, das Ergebnis steht vorher fest.
        setSeats(drawSeats(players, Math.random));
      }
    }, 110);
  };

  const nextBooster = () => {
    if (!seats || shuffling) return;
    setBooster((b) => (b % BOOSTERS_PER_PLAYER) + 1);
    buzz();
  };

  const dir = passDirection(booster);
  const n = seats?.length ?? 0;
  const seatR = 124;

  return (
    <main className="page">
      <header className="bar">
        <button className="btn ghost" onClick={onBack} aria-label="Zurück">
          ‹ Zurück
        </button>
        <h2>Draftplätze</h2>
      </header>

      <form className="row" onSubmit={add}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Name hinzufügen"
          maxLength={24}
          autoComplete="off"
          enterKeyHint="done"
          aria-label="Name"
        />
        <button className="btn" type="submit" disabled={!draft.trim()}>
          +
        </button>
      </form>

      <ul className="chips" aria-label="Spieler">
        {players.map((p) => (
          <li key={p}>
            {p}
            <button onClick={() => remove(p)} aria-label={`${p} entfernen`}>
              ×
            </button>
          </li>
        ))}
      </ul>

      <button className="btn primary big" onClick={draw} disabled={players.length < 2 || shuffling}>
        {seats ? 'Neu auslosen' : 'Plätze auslosen'}
      </button>

      {seats && (
        <section className="seating">
          <button
            className="table-graphic"
            onClick={nextBooster}
            aria-label={`Booster ${booster}, nach ${dir === 'left' ? 'links' : 'rechts'}. Tippen für den nächsten Booster`}
          >
            <svg viewBox={`-84 -26 ${SIZE + 168} ${SIZE + 40}`} className={shuffling ? 'shuffling' : ''}>
              <circle cx={C} cy={C} r={62} className="felt" />
              <text x={C} y={C - 8} className="booster">
                Booster {booster}
              </text>
              <text x={C} y={C + 14} className="direction">
                {dir === 'left' ? 'nach links ↻' : 'nach rechts ↺'}
              </text>
              {seats.map((_, i) => {
                // Pfeil genau auf der Mitte der Verbindungslinie zwischen Platz i und i+1,
                // zeigt im Uhrzeigersinn (links) oder dagegen (rechts)
                const a = seatPosition(i, n, seatR, C, C);
                const b = seatPosition((i + 1) % n, n, seatR, C, C);
                const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
                const rotate = dir === 'left' ? angle : angle + 180;
                return (
                  <path
                    key={`a${i}`}
                    d="M -4 -7 L 4 0 L -4 7"
                    className="arrow"
                    transform={`translate(${(a.x + b.x) / 2} ${(a.y + b.y) / 2}) rotate(${rotate})`}
                  />
                );
              })}
              {seats.map((name, i) => {
                const pos = seatPosition(i, n, seatR, C, C);
                // Namen strahlenförmig außen neben den Platz, damit sie weder Tisch noch Pfeile berühren
                const label = seatPosition(i, n, seatR + 40, C, C);
                const dx = label.x - C;
                const anchor = dx > 40 ? 'start' : dx < -40 ? 'end' : 'middle';
                return (
                  <g key={name} className="seat">
                    <circle cx={pos.x} cy={pos.y} r={26} />
                    <text x={pos.x} y={pos.y} className="seat-no">
                      {i + 1}
                    </text>
                    <text x={label.x} y={label.y} className="seat-name" style={{ textAnchor: anchor }}>
                      {name.length > 10 ? `${name.slice(0, 9)}…` : name}
                    </text>
                  </g>
                );
              })}
            </svg>
          </button>
          {!shuffling && (
            <ol className="pass-list" data-testid="seats">
              {seats.map((name) => (
                <li key={name}>
                  <strong>{name}</strong> gibt an {neighbour(seats, name, booster)}
                </li>
              ))}
            </ol>
          )}
          <p className="muted small">Tippe auf den Tisch, um zum nächsten Booster zu wechseln.</p>
        </section>
      )}
    </main>
  );
}
