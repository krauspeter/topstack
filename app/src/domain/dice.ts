/** Würfel für den Start eines Matches (F-09, UC-10). */

/** Zufallsquelle im Bereich [0, 1), in Tests austauschbar. */
export type Rng = () => number;

/** Kryptografisch sauberer Zufall, damit niemand am Tisch dem Würfel misstraut. */
export const cryptoRng: Rng = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

export function rollDie(sides = 20, rng: Rng = cryptoRng): number {
  return 1 + Math.floor(rng() * sides);
}

/**
 * Wer hat den W20-Wurf gewonnen? Der höhere Wurf beginnt Spiel 1.
 * Liefert `null`, solange nicht alle gewürfelt haben oder bei Gleichstand (dann neu würfeln).
 */
export function rollWinner(rolls: Readonly<Record<string, number | undefined>>, players: readonly string[]): string | null {
  const values = players.map((p) => rolls[p]);
  if (values.some((v) => v === undefined)) return null;
  const max = Math.max(...(values as number[]));
  const best = players.filter((p) => rolls[p] === max);
  return best.length === 1 ? best[0] : null;
}
