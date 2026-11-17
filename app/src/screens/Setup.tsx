import { type FormEvent, useState } from 'react';

const NAMES_KEY = 'topstack.lastNames';
const LIFE_OPTIONS = [20, 30, 40] as const;

function lastNames(): [string, string] {
  try {
    const raw = localStorage.getItem(NAMES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length === 2 && parsed.every((n) => typeof n === 'string')) {
      return [parsed[0], parsed[1]];
    }
  } catch {
    // ignorieren
  }
  return ['', ''];
}

interface Props {
  onStart(names: [string, string], startingLife: number): void;
  onBack(): void;
}

export function Setup({ onStart, onBack }: Props) {
  const [names, setNames] = useState<[string, string]>(lastNames);
  const [life, setLife] = useState<number>(20);

  const clean: [string, string] = [names[0].trim() || 'Spieler 1', names[1].trim() || 'Spieler 2'];
  const duplicate = clean[0].toLocaleLowerCase('de') === clean[1].toLocaleLowerCase('de');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (duplicate) return;
    try {
      localStorage.setItem(NAMES_KEY, JSON.stringify(names.map((n) => n.trim())));
    } catch {
      // ignorieren
    }
    onStart(clean, life);
  };

  const setName = (i: 0 | 1, value: string) =>
    setNames((prev) => (i === 0 ? [value, prev[1]] : [prev[0], value]));

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
          <label key={i} className="field">
            <span>Spieler {i + 1}</span>
            <input
              value={names[i]}
              onChange={(e) => setName(i, e.target.value)}
              placeholder={`Spieler ${i + 1}`}
              maxLength={24}
              autoComplete="off"
              enterKeyHint="next"
            />
          </label>
        ))}
        {duplicate && <p className="warn">Bitte zwei verschiedene Namen eingeben.</p>}

        <fieldset className="field">
          <legend>Startleben</legend>
          <div className="segmented">
            {LIFE_OPTIONS.map((v) => (
              <button
                key={v}
                type="button"
                className={v === life ? 'on' : ''}
                aria-pressed={v === life}
                onClick={() => setLife(v)}
              >
                {v}
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
