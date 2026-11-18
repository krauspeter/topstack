import { type ColorChoice, COLORLESS, describeColors, normalizeColors } from '../domain/colors';
import { choiceSurface } from '../theme';

/** Kleine Farbsymbole wie auf den Karten, z. B. U R für Blau-Rot oder C für farblos. */
export function ManaPips({ colors }: { colors: string }) {
  const c = normalizeColors(colors);
  const symbols: ColorChoice[] = c === '' ? [COLORLESS] : ([...c] as ColorChoice[]);
  return (
    <span className="pips-mana" role="img" aria-label={describeColors(c)}>
      {symbols.map((s) => {
        const surface = choiceSurface(s);
        return (
          <i key={s} style={{ background: surface.value, color: surface.tokens?.['--text'] ?? '#f2f0ea' }}>
            {s}
          </i>
        );
      })}
    </span>
  );
}
