import { type FormEvent, useState } from 'react';
import type { MatchSetup } from '../store/useMatch';
import { DEFAULT_COLORS, PLAYER_COLORS } from '../theme';

const LAST_KEY = 'topstack.lastSetup';
const LIFE_OPTIONS = [20, 30, 40] as const;
const TIME_OPTIONS = [null, 40, 50, 60] as const;

interface Remembered {
  names: [string, string];
  colors: [string, string];
  startingLife: number;
  timeLimitMin: number | null;
}

const isColor = (c: unknown): c is string => typeof c === 'string' && PLAYER_COLORS.some((p) => p.key === c);

function remembered(): Remembered {
  const fallback: Remembered = { names: ['', ''], colors: [...DEFAULT_COLORS], startingLife: 20, timeLimitMin: null };
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return fallback;
    const r = raw as Partial<Record<keyof Remembered, unknown>>;
    const names = Array.isArray(r.names) && r.names.length === 2 && r.names.every((n) => typeof n === 'string');
    const colors = Array.isArray(r.colors) && r.colors.length === 2 && r.colors.every(isColor);
    return {
      names: names ? (r.names as [string, string]) : fallback.names,
      colors: colors ? (r.colors as [string, string]) : fallback.colors,
      startingLife: LIFE_OPTIONS.some((v) => v === r.startingLife) ? (r.startingLife as number) : 20,
      timeLimitMin: TIME_OPTIONS.some((v) => v === r.timeLimitMin) ? (r.timeLimitMin as number | null) : null,
    };
  } catch {
    return fallback;
  }
}

interface Props {
  onStart(setup: MatchSetup): void;
  onBack(): void;
}

export function Setup({ onStart, onBack }: Props) {
  const [initial] = useState(remembered);
  const [names, setNames] = useState<[string, string]>(initial.names);
  const [colors, setColors] = useState<[string, string]>(initial.colors);
  const [life, setLife] = useState<number>(initial.startingLife);
  const [timeLimit, setTimeLimit] = useState<number | null>(initial.timeLimitMin);

  const clean: [string, string] = [names[0].trim() || 'Spieler 1', names[1].trim() || 'Spieler 2'];
  const duplicate = clean[0].toLocaleLowerCase('de') === clean[1].toLocaleLowerCase('de');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (duplicate) return;
    try {
      const keep: Remembered = { names: [names[0].trim(), names[1].trim()], colors, startingLife: life, timeLimitMin: timeLimit };
      localStorage.setItem(LAST_KEY, JSON.stringify(keep));
    } catch {
      // ignorieren
    }
    onStart({ names: clean, colors, startingLife: life, timeLimitMin: timeLimit });
  };

  const pair = <T,>(prev: [T, T], i: 0 | 1, value: T): [T, T] => (i === 0 ? [value, prev[1]] : [prev[0], value]);

  return (
    <main className="page">
      <header className="bar">
        <button className="btn ghost" onClick={onBack} aria-label="Zurück">
          ‹ Zurück
        </button>
        <h2>Neues Match</h2>
      </header>

      <form className="stack" onSubmit={submit}>
        {([0, 1] as const).map((i) => (
          <div key={i} className="player-setup">
            <label className="field">
              <span>Spieler {i + 1}</span>
              <input
                value={names[i]}
                onChange={(e) => setNames((prev) => pair(prev, i, e.target.value))}
                placeholder={`Spieler ${i + 1}`}
                maxLength={24}
                autoComplete="off"
                enterKeyHint="next"
              />
            </label>
            <div className="swatches" role="radiogroup" aria-label={`Farbe für Spieler ${i + 1}`}>
              {PLAYER_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="radio"
                  aria-checked={colors[i] === c.key}
                  aria-label={c.label}
                  title={c.label}
                  className={colors[i] === c.key ? 'on' : ''}
                  style={{ background: c.value }}
                  onClick={() => setColors((prev) => pair(prev, i, c.key))}
                />
              ))}
            </div>
          </div>
        ))}
        {duplicate && <p className="warn">Bitte zwei verschiedene Namen eingeben.</p>}

        <fieldset className="field">
          <legend>Startleben</legend>
          <div className="segmented">
            {LIFE_OPTIONS.map((v) => (
              <button key={v} type="button" className={v === life ? 'on' : ''} aria-pressed={v === life} onClick={() => setLife(v)}>
                {v}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>Zeitlimit fürs Match</legend>
          <div className="segmented">
            {TIME_OPTIONS.map((v) => (
              <button
                key={v ?? 'aus'}
                type="button"
                className={v === timeLimit ? 'on' : ''}
                aria-pressed={v === timeLimit}
                onClick={() => setTimeLimit(v)}
              >
                {v === null ? 'Aus' : `${v} min`}
              </button>
            ))}
          </div>
        </fieldset>

        <p className="muted small">Best-of-3 · ein gemeinsames Handy in der Tischmitte</p>

        <button type="submit" className="btn primary big" disabled={duplicate}>
          Weiter zum W20-Wurf
        </button>
      </form>
    </main>
  );
}
