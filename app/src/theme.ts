import type { CSSProperties } from 'react';

/**
 * Wählbare Farben für die Hälften im Life-Tracker: die fünf Farben von Magic in WUBRG-Reihenfolge.
 * Weiß ist hell und bekommt deshalb eigene, dunkle Textfarben. Alle Kombinationen erfüllen mindestens 4.5:1 (ADR-0011).
 */
export interface PlayerColor {
  key: string;
  label: string;
  /** Kürzel wie auf den Karten: W, U, B, R, G */
  symbol: string;
  value: string;
  /** Überschreibt Design-Tokens innerhalb der Hälfte (nur für helle Farben nötig). */
  tokens?: Record<string, string>;
}

export const PLAYER_COLORS: readonly PlayerColor[] = [
  {
    key: 'weiss',
    label: 'Weiß',
    symbol: 'W',
    value: '#ece6d3',
    tokens: {
      '--text': '#1c1a14',
      '--muted': '#57513f',
      '--gold': '#7a5a10',
      '--gold-ink': '#ece6d3',
      '--down': '#a3301f',
      '--up': '#2c6a37',
      '--danger': '#a3301f',
      '--surface-2': '#f6f1e2',
    },
  },
  { key: 'blau', label: 'Blau', symbol: 'U', value: '#1a2b42' },
  { key: 'schwarz', label: 'Schwarz', symbol: 'B', value: '#17161c' },
  { key: 'rot', label: 'Rot', symbol: 'R', value: '#3d1f25' },
  { key: 'gruen', label: 'Grün', symbol: 'G', value: '#1a3427' },
];

export const DEFAULT_COLORS: readonly [string, string] = ['blau', 'rot'];

export function findColor(key: string | undefined, index: 0 | 1): PlayerColor {
  return (
    PLAYER_COLORS.find((c) => c.key === key) ??
    PLAYER_COLORS.find((c) => c.key === DEFAULT_COLORS[index]) ??
    PLAYER_COLORS[0]
  );
}

/** Hintergrund und Textfarben für die Hälfte eines Spielers. */
export function halfStyle(key: string | undefined, index: 0 | 1): CSSProperties {
  const c = findColor(key, index);
  return { background: c.value, color: 'var(--text)', ...(c.tokens ?? {}) } as CSSProperties;
}
