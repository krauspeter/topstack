/**
 * Profilbilder (Phase 5, AP-15). Der Server liefert je Spieler ``preset:<Wesen>``, die Adresse
 * eines eigenen Bildes oder ``null``; ohne Bild zeigt die App Initialen in den Lieblingsfarben.
 */
import type { Mana } from './colors';

export type ManaKey = 'w' | 'u' | 'b' | 'r' | 'g' | 'c';

export interface Preset {
  key: string;
  name: string;
  mana: ManaKey;
}

/** Reihenfolge wie im Entwurf vom 28.11.2026: Weiß, Blau, Schwarz, Rot, Grün, Farblos. */
export const PRESETS: readonly Preset[] = [
  { key: 'engel', name: 'Engel', mana: 'w' },
  { key: 'ritter', name: 'Ritter', mana: 'w' },
  { key: 'einhorn', name: 'Einhorn', mana: 'w' },
  { key: 'sphinx', name: 'Sphinx', mana: 'u' },
  { key: 'krake', name: 'Krake', mana: 'u' },
  { key: 'eule', name: 'Eule', mana: 'u' },
  { key: 'zombie', name: 'Zombie', mana: 'b' },
  { key: 'vampir', name: 'Vampir', mana: 'b' },
  { key: 'ratte', name: 'Ratte', mana: 'b' },
  { key: 'drache', name: 'Drache', mana: 'r' },
  { key: 'goblin', name: 'Goblin', mana: 'r' },
  { key: 'phoenix', name: 'Phönix', mana: 'r' },
  { key: 'elf', name: 'Elf', mana: 'g' },
  { key: 'baumhirte', name: 'Baumhirte', mana: 'g' },
  { key: 'hydra', name: 'Hydra', mana: 'g' },
  { key: 'golem', name: 'Golem', mana: 'c' },
];

export type AvatarView = { kind: 'preset'; preset: Preset } | { kind: 'image'; url: string } | { kind: 'initials'; text: string };

/** Was angezeigt wird: Wesen, eigenes Bild oder Initialen. */
export function avatarView(avatar: string | null | undefined, name: string): AvatarView {
  if (avatar?.startsWith('preset:')) {
    const preset = PRESETS.find((p) => p.key === avatar.slice('preset:'.length));
    if (preset) return { kind: 'preset', preset };
  }
  if (avatar && avatar.startsWith('/api/v1/avatars/')) return { kind: 'image', url: avatar };
  return { kind: 'initials', text: initials(name) };
}

/** „Anna“ → „AN“, „Ben Berger“ → „BB“, leere Namen → „?“. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

const MANA_VAR: Record<Mana, string> = { W: 'var(--mana-w)', U: 'var(--mana-u)', B: 'var(--mana-b)', R: 'var(--mana-r)', G: 'var(--mana-g)' };

/** Hintergrund der Initialen: Lieblingsfarben als Verlauf, ohne Farben Gold. */
export function initialsBackground(colors: string | null | undefined): string {
  const list = [...(colors ?? '')].filter((c): c is Mana => c in MANA_VAR).map((c) => MANA_VAR[c]);
  if (list.length === 0) return 'var(--gold)';
  if (list.length === 1) return list[0];
  return `linear-gradient(135deg, ${list.join(', ')})`;
}

/** Zielgröße eines hochgeladenen Bildes. */
export const AVATAR_PX = 256;

/**
 * Quadratischer Ausschnitt aus einem Bild: ``zoom`` 1 = kurze Seite passt genau, ``x``/``y`` von
 * -1 bis 1 verschieben den Ausschnitt. Gibt die Quell-Koordinaten zurück.
 */
export function cropRect(width: number, height: number, zoom: number, x: number, y: number) {
  const side = Math.min(width, height) / Math.max(1, zoom);
  const maxX = (width - side) / 2;
  const maxY = (height - side) / 2;
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  return { sx: maxX + clamp(x) * maxX, sy: maxY + clamp(y) * maxY, side };
}
