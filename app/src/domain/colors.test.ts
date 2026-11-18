import { describe, expect, it } from 'vitest';
import { colorKind, describeColors, isSelected, isValidColors, normalizeColors, toggleColor } from './colors';

describe('Deckfarben', () => {
  it('sortiert in WUBRG-Reihenfolge und entfernt Doppelte', () => {
    expect(normalizeColors('RUG')).toBe('URG');
    expect(normalizeColors('UUx')).toBe('U');
  });

  it('erlaubt beliebige Kombinationen', () => {
    let c = 'U';
    c = toggleColor(c, 'R');
    c = toggleColor(c, 'W');
    expect(c).toBe('WUR');
    expect(toggleColor('WUBRG', 'B')).toBe('WURG');
  });

  it('farblos schließt Farben aus, eine Farbe beendet farblos', () => {
    expect(toggleColor('UR', 'C')).toBe('');
    expect(toggleColor('', 'G')).toBe('G');
    expect(isSelected('', 'C')).toBe(true);
    expect(isSelected('U', 'C')).toBe(false);
  });

  it('die letzte Farbe bleibt gewählt', () => {
    expect(toggleColor('U', 'U')).toBe('U');
  });

  it('erkennt einfarbig, mehrfarbig (gold) und farblos (grau)', () => {
    expect(colorKind('R')).toBe('mono');
    expect(colorKind('UR')).toBe('multi');
    expect(colorKind('')).toBe('colorless');
  });

  it('passt zum Datenmodell', () => {
    expect(isValidColors('WUBRG')).toBe(true);
    expect(isValidColors('')).toBe(true);
    expect(isValidColors('RU')).toBe(false);
    expect(isValidColors('blau')).toBe(false);
  });

  it('beschreibt die Auswahl', () => {
    expect(describeColors('U')).toBe('Blau');
    expect(describeColors('UR')).toBe('Blau-Rot (mehrfarbig)');
    expect(describeColors('')).toBe('Farblos');
  });
});
