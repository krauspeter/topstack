/** Wählbare Farben für die Hälften im Life-Tracker. Alle dunkel genug für hellen Text (ADR-0011, mind. 4.5:1). */
export interface PlayerColor {
  key: string;
  label: string;
  value: string;
}

export const PLAYER_COLORS: readonly PlayerColor[] = [
  { key: 'nacht', label: 'Nacht', value: '#1e1e28' },
  { key: 'schiefer', label: 'Schiefer', value: '#2a2a38' },
  { key: 'rot', label: 'Rot', value: '#3d1f25' },
  { key: 'blau', label: 'Blau', value: '#1a2b42' },
  { key: 'gruen', label: 'Grün', value: '#1a3427' },
  { key: 'lila', label: 'Lila', value: '#2d2145' },
  { key: 'gold', label: 'Gold', value: '#3b321c' },
];

export const DEFAULT_COLORS: readonly [string, string] = ['nacht', 'schiefer'];

export function colorValue(key: string | undefined, index: 0 | 1): string {
  const found = PLAYER_COLORS.find((c) => c.key === (key ?? DEFAULT_COLORS[index]));
  return (found ?? PLAYER_COLORS[index]).value;
}
