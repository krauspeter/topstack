import type { CSSProperties } from 'react';
import { type ColorChoice, type Mana, colorKind, isValidColors, normalizeColors } from './domain/colors';

/**
 * Hintergründe der Hälften im Life-Tracker, angelehnt an die Kartenrahmen:
 * einfarbig in der Farbe, mehrfarbig gold, farblos grau.
 * Helle Flächen bekommen eigene, dunkle Textfarben. Alle Kombinationen erfüllen mindestens 4.5:1 (ADR-0011).
 */
interface Surface {
  value: string;
  /** Überschreibt Design-Tokens innerhalb der Hälfte. */
  tokens?: Record<string, string>;
}

const LIGHT_CREAM: Surface['tokens'] = {
  '--text': '#1c1a14',
  '--muted': '#57513f',
  '--gold': '#7a5a10',
  '--gold-ink': '#ece6d3',
  '--down': '#a3301f',
  '--up': '#2c6a37',
  '--danger': '#a3301f',
  '--surface-2': '#f6f1e2',
};

export const MANA_SURFACES: Record<Mana, Surface> = {
  W: { value: '#ece6d3', tokens: LIGHT_CREAM },
  U: { value: '#1a2b42' },
  B: { value: '#17161c' },
  R: { value: '#3d1f25' },
  G: { value: '#1a3427' },
};

/** Mehrfarbig: gold wie der Rahmen mehrfarbiger Karten. */
export const MULTI_SURFACE: Surface = {
  value: '#d6b35a',
  tokens: {
    '--text': '#1c1608',
    '--muted': '#4a3a10',
    '--gold': '#5a430f',
    '--gold-ink': '#d6b35a',
    '--down': '#7f2114',
    '--up': '#1d5227',
    '--danger': '#7f2114',
    '--surface-2': '#e4c77c',
  },
};

/** Farblos: grau wie der Rahmen von Artefakten. */
export const COLORLESS_SURFACE: Surface = {
  value: '#4b4d55',
  tokens: {
    '--muted': '#d6d4de',
    '--gold': '#f0cf7e',
    '--down': '#ffb4a8',
    '--up': '#b0eabb',
    '--danger': '#ffb4a8',
    '--surface-2': '#5a5c65',
  },
};

/** Farbe der Auswahlknöpfe im Setup. */
export function choiceSurface(choice: ColorChoice): Surface {
  return choice === 'C' ? COLORLESS_SURFACE : MANA_SURFACES[choice];
}

export const DEFAULT_COLORS: readonly [string, string] = ['U', 'R'];

/** Ältere Spielstände speicherten einen Farbschlüssel statt WUBRG. */
const LEGACY: Record<string, string> = { weiss: 'W', blau: 'U', schwarz: 'B', rot: 'R', gruen: 'G' };

/** Deckfarben eines Spielers, auch aus älteren Spielständen. */
export function playerColors(player: { colors?: string; color?: string }, index: 0 | 1): string {
  if (isValidColors(player.colors)) return player.colors;
  if (player.color && player.color in LEGACY) return LEGACY[player.color];
  return DEFAULT_COLORS[index];
}

export function surfaceFor(colors: string): Surface {
  const kind = colorKind(colors);
  if (kind === 'colorless') return COLORLESS_SURFACE;
  if (kind === 'multi') return MULTI_SURFACE;
  return MANA_SURFACES[normalizeColors(colors) as Mana];
}

/** Hintergrund und Textfarben für die Hälfte eines Spielers. */
export function halfStyle(colors: string): CSSProperties {
  const s = surfaceFor(colors);
  return { background: s.value, color: 'var(--text)', ...(s.tokens ?? {}) } as CSSProperties;
}
