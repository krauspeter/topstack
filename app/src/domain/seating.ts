/**
 * Auslosung der Draftplätze und Passrichtung (F-03, F-04, UC-06).
 * Muss sich wie server/topstack/domain/seating.py verhalten.
 *
 * Sitzreihenfolge: Index 0 ist Platz 1, die Plätze folgen im Uhrzeigersinn (von oben gesehen).
 * „Nach links“ geben heißt damit: an den nächsten Platz im Uhrzeigersinn.
 */
import { type Rng, cryptoRng } from './dice';

export type PassDirection = 'left' | 'right';

export const BOOSTERS_PER_PLAYER = 3;

/** Fisher-Yates: jede Reihenfolge ist gleich wahrscheinlich. */
export function drawSeats<P>(players: readonly P[], rng: Rng = cryptoRng): P[] {
  const seats = [...players];
  for (let i = seats.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [seats[i], seats[j]] = [seats[j], seats[i]];
  }
  return seats;
}

/** Booster 1 und 3 gehen nach links, Booster 2 nach rechts. */
export function passDirection(boosterNo: number): PassDirection {
  if (!Number.isInteger(boosterNo) || boosterNo < 1) throw new RangeError('Booster-Nummer beginnt bei 1');
  return boosterNo % 2 === 1 ? 'left' : 'right';
}

/** An wen gibt `player` im Booster `boosterNo` weiter? */
export function neighbour<P>(seats: readonly P[], player: P, boosterNo: number): P {
  const i = seats.indexOf(player);
  if (i < 0) throw new RangeError('Spieler sitzt nicht am Tisch');
  const step = passDirection(boosterNo) === 'left' ? 1 : -1;
  return seats[(i + step + seats.length) % seats.length];
}

/** Position eines Platzes auf einem Kreis (Platz 1 oben, weiter im Uhrzeigersinn), für die Tischgrafik. */
export function seatPosition(index: number, count: number, radius: number, cx = 0, cy = 0): { x: number; y: number } {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}
