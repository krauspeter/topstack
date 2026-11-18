/**
 * Deckfarben wie im Datenmodell (docs/schema.sql): eine Zeichenkette aus W, U, B, R, G
 * in WUBRG-Reihenfolge. Die leere Zeichenkette heißt farblos (offizielles Symbol {C}).
 */
export const MANA = ['W', 'U', 'B', 'R', 'G'] as const;
export type Mana = (typeof MANA)[number];
/** Symbol für farblos in der Oberfläche; gespeichert wird farblos als leere Zeichenkette. */
export const COLORLESS = 'C';
export type ColorChoice = Mana | typeof COLORLESS;

export type ColorKind = 'mono' | 'multi' | 'colorless';

/** Nur gültige Farben, ohne Doppelte, in WUBRG-Reihenfolge. */
export function normalizeColors(input: string): string {
  return MANA.filter((m) => input.includes(m)).join('');
}

export function isValidColors(value: unknown): value is string {
  return typeof value === 'string' && /^[WUBRG]*$/.test(value) && normalizeColors(value) === value;
}

/**
 * Auswahl umschalten: Farben lassen sich beliebig kombinieren, „farblos“ schließt alle Farben aus.
 * Die letzte Farbe lässt sich nicht abwählen, so ist immer etwas gewählt (sonst wäre es farblos).
 */
export function toggleColor(current: string, choice: ColorChoice): string {
  if (choice === COLORLESS) return '';
  if (!current.includes(choice)) return normalizeColors(current + choice);
  const without = current.replace(choice, '');
  return without === '' ? current : without;
}

export function isSelected(current: string, choice: ColorChoice): boolean {
  return choice === COLORLESS ? current === '' : current.includes(choice);
}

export function colorKind(colors: string): ColorKind {
  const n = normalizeColors(colors).length;
  return n === 0 ? 'colorless' : n === 1 ? 'mono' : 'multi';
}

const NAMES: Record<Mana, string> = { W: 'Weiß', U: 'Blau', B: 'Schwarz', R: 'Rot', G: 'Grün' };

export function choiceName(choice: ColorChoice): string {
  return choice === COLORLESS ? 'Farblos' : NAMES[choice];
}

/** Kurzbeschreibung, z. B. „Blau“, „Blau-Rot (mehrfarbig)“, „Farblos“. */
export function describeColors(colors: string): string {
  const c = normalizeColors(colors);
  if (c === '') return 'Farblos';
  const names = [...c].map((m) => NAMES[m as Mana]).join('-');
  return c.length === 1 ? names : `${names} (mehrfarbig)`;
}
