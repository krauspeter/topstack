/**
 * Elo-Rechnung für die Anzeige (Phase 5, AP-5). Maßgeblich ist der Server (`domain/elo.py`);
 * die App rechnet nur aus, was ein Match gegen einen Gegner bringen würde.
 */
export const START = 1000;

/** K = 40 in den ersten 10 Matches eines Spielers, danach 32. */
export const kFactor = (matches: number): number => (matches < 10 ? 40 : 32);

/** Erwartete Punkte gegen `other`, zwischen 0 und 1. */
export const expected = (rating: number, other: number): number => 1 / (1 + 10 ** ((other - rating) / 400));

/** Gewinn bei Sieg und Verlust bei Niederlage gegen einen Gegner, gerundet. */
export function stakes(rating: number, matches: number, other: number): { win: number; loss: number } {
  const k = kFactor(matches);
  const e = expected(rating, other);
  return { win: Math.round(k * (1 - e)), loss: Math.round(k * e) };
}

/** Richtung der Mini-Kurve: steigend, fallend oder gleich (Unterschied unter 3 Punkten). */
export function direction(trend: readonly number[]): 'up' | 'down' | 'flat' {
  if (trend.length < 2) return 'flat';
  const d = trend[trend.length - 1] - trend[0];
  return d >= 3 ? 'up' : d <= -3 ? 'down' : 'flat';
}

/** SVG-Pfad der Mini-Kurve in einem Feld `width`×`height`, mit 2 px Rand oben und unten. */
export function sparkPath(trend: readonly number[], width = 64, height = 22): string {
  if (trend.length === 0) return '';
  const lo = Math.min(...trend);
  const hi = Math.max(...trend);
  const span = hi - lo || 1;
  const step = trend.length > 1 ? width / (trend.length - 1) : 0;
  return trend
    .map((v, i) => {
      const x = Math.round(i * step * 10) / 10;
      const y = hi === lo ? height / 2 : Math.round((2 + ((hi - v) / span) * (height - 4)) * 10) / 10;
      return `${i === 0 ? 'M' : 'L'}${x} ${y}`;
    })
    .join(' ');
}

/** Elo ohne Nachkommastellen, mit Vorzeichen für Änderungen. */
export const eloText = (v: number): string => String(Math.round(v));
export const deltaText = (d: number): string => {
  const r = Math.round(d);
  return r > 0 ? `+${r}` : r < 0 ? `−${Math.abs(r)}` : '±0';
};
