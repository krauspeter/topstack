import { passDirection, seatPosition } from '../domain/seating';

const SIZE = 340;
const C = SIZE / 2;
const SEAT_R = 124;

interface Props {
  /** Namen in Sitzreihenfolge, Platz 1 zuerst. */
  seats: string[];
  booster: number;
  shuffling: boolean;
  onTap(): void;
}

/** Runde Tischgrafik mit Plätzen und Passrichtung je Booster (F-04), lokal und im Turnier. */
export function DraftTable({ seats, booster, shuffling, onTap: nextBooster }: Props) {
  const dir = passDirection(booster);
  const n = seats.length;
  const seatR = SEAT_R;
  return (
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
  );
}
