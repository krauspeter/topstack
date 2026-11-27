/**
 * Aktive Gruppe (ADR-0018): Die App merkt sich pro Gerät die zuletzt genutzte Gruppe.
 * Fehlt sie (verlassen, gelöscht) oder wurde nie gewählt, gilt die erste nicht archivierte.
 */

export interface GroupLike {
  id: string;
  archived?: boolean;
}

export function pickActiveGroup<G extends GroupLike>(groups: readonly G[], storedId: string | null): G | null {
  if (groups.length === 0) return null;
  const stored = storedId ? groups.find((g) => g.id === storedId) : undefined;
  return stored ?? groups.find((g) => !g.archived) ?? groups[0];
}

export const ROLE_LABEL = { admin: 'Admin', member: 'Mitglied', viewer: 'Zuschauer' } as const;

/** Nach dem Verkleinern: lange Seite höchstens so viele Pixel (Gruppenbild). */
export const GROUP_IMAGE_PX = 512;

/** Zielgröße eines Bildes, das in ein Quadrat von `max` Pixeln passt; kleinere bleiben, wie sie sind. */
export function fitInto(width: number, height: number, max = GROUP_IMAGE_PX): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export const SEASON_LABEL = {
  calendar_year: 'Kalenderjahr',
  months: 'Nach Monaten',
  eternal: 'Ewig (keine Saisons)',
} as const;

/** „Best-of-3“ aus „2 Siege nötig“. */
export function bestOf(gamesToWin: number): string {
  return `Best-of-${gamesToWin * 2 - 1}`;
}

/**
 * Mögliche Ergebnisse eines Matches mit `gamesToWin` nötigen Siegen, aus Sicht von Spieler A
 * (Phase 5, AP-3). Erst die Siege von A, dann Stände nach Zeitablauf, dann die Siege von B.
 * Best-of-3: 2:0, 2:1, 1:0, 1:1, 0:1, 1:2, 0:2.
 */
export function matchResults(gamesToWin: number): [number, number][] {
  const n = Math.max(1, gamesToWin);
  const wins: [number, number][] = [];
  for (let b = 0; b < n; b++) wins.push([n, b]);
  const open: [number, number][] = [];
  for (let a = n - 1; a >= 0; a--) for (let b = 0; b < n; b++) if (a + b > 0) open.push([a, b]);
  const lost = wins.map(([a, b]) => [b, a] as [number, number]).reverse();
  return [...wins, ...open.filter(([a, b]) => a + b <= 2 * n - 1), ...lost];
}
