import { type ChangeEvent, type FormEvent, useState } from 'react';
import { api, errorText } from '../../api/client';
import { BUILD } from '../../build';

/**
 * Feedback-Button (Phase 4, AP-5): Der Server legt daraus ein GitHub-Issue an. Im Issue steht
 * kein Name, nur eine anonyme Kennung; E-Mail-Adressen im Text entfernt der Server.
 */

type Category = 'bug' | 'wish' | 'other';

const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'bug', label: 'Fehler' },
  { id: 'wish', label: 'Wunsch' },
  { id: 'other', label: 'Sonstiges' },
];

/** Größere Seite eines Screenshots nach dem Verkleinern; reicht zum Erkennen, bleibt klein. */
const MAX_EDGE = 1600;

/** Bild verkleinern und als JPEG-Data-URL liefern (Handy-Screenshots haben oft mehrere MB). */
export async function shrinkImage(file: File, maxEdge = MAX_EDGE): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.8);
}

interface Props {
  onBack(): void;
}

export function Feedback({ onBack }: Props) {
  const [category, setCategory] = useState<Category>('bug');
  const [message, setMessage] = useState('');
  const [context, setContext] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setScreenshot(await shrinkImage(file));
    } catch {
      setError('Das Bild konnte nicht gelesen werden.');
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/feedback', {
        method: 'POST',
        body: {
          category,
          message,
          context: context.trim() || null,
          app_version: BUILD.version,
          build: BUILD.pr,
          screenshot,
        },
      });
      setSent(true);
    } catch (err) {
      // Text bleibt stehen, damit nichts verloren geht
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <main className="page center">
        <section className="card">
          <h2>Danke!</h2>
          <p>Dein Feedback ist angekommen und landet bei Peter als Aufgabe.</p>
          <button className="btn primary big" onClick={onBack}>
            Fertig
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="bar">
        <button className="btn ghost" onClick={onBack} aria-label="Zurück">
          ‹ Zurück
        </button>
        <h2>Feedback</h2>
      </header>

      <form className="stack" onSubmit={submit}>
        <div className="chips-select" role="group" aria-label="Art">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={category === c.id ? 'chip on' : 'chip'}
              aria-pressed={category === c.id}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <label className="field">
          <span>{category === 'bug' ? 'Was ist passiert?' : category === 'wish' ? 'Was wünschst du dir?' : 'Worum geht es?'}</span>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} minLength={3} maxLength={4000} required />
        </label>

        {category === 'bug' && (
          <label className="field">
            <span>Was hast du gerade gemacht? (optional)</span>
            <textarea value={context} onChange={(e) => setContext(e.target.value)} rows={3} maxLength={2000} />
          </label>
        )}

        <div className="field">
          <span>Screenshot (optional)</span>
          {screenshot ? (
            <div className="feedback-shot">
              <img src={screenshot} alt="Ausgewählter Screenshot" />
              <button type="button" className="btn ghost" onClick={() => setScreenshot(null)}>
                Entfernen
              </button>
            </div>
          ) : (
            <label className="btn">
              Bild auswählen
              <input type="file" accept="image/*" onChange={(e) => void pick(e)} hidden />
            </label>
          )}
        </div>

        <p className="muted small">
          Dein Feedback wird als Aufgabe im öffentlichen GitHub-Projekt von TopStack angelegt. Dort steht nicht dein Name,
          nur eine anonyme Kennung, dazu App-Version und Gerät. Bitte schreib keine E-Mail-Adressen oder andere persönlichen
          Daten hinein. Ein Screenshot bleibt auf dem Heimserver und erscheint nicht öffentlich.
        </p>

        {error && (
          <p className="warn" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn primary big" disabled={busy || message.trim().length < 3}>
          {busy ? 'Wird gesendet …' : 'Feedback senden'}
        </button>
      </form>
    </main>
  );
}
