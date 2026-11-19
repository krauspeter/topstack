import { type FormEvent, useState } from 'react';
import { api, errorText } from '../../api/client';
import { loginWithPasskey, passkeysSupported } from '../../api/passkeys';
import type { Me } from '../../api/types';

interface Props {
  /** Einladungs-Token, wenn die Anmeldung von einer Einladung kommt. */
  invitation?: string;
  title?: string;
  onSignedIn(me: Me): void;
  onBack(): void;
}

/** E-Mail für den Magic-Link eingeben oder mit Passkey anmelden. */
export function Login({ invitation, title = 'Anmelden', onSignedIn, onBack }: Props) {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/magic-link', { method: 'POST', body: { email: email.trim(), invitation } });
      setSentTo(email.trim());
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const passkey = async () => {
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await loginWithPasskey());
    } catch (err) {
      setError(err instanceof DOMException ? 'Anmeldung mit Passkey abgebrochen.' : errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <header className="bar">
        <button className="btn ghost" onClick={onBack} aria-label="Zurück">
          ‹ Zurück
        </button>
        <h2>{title}</h2>
      </header>

      {sentTo ? (
        <section className="card" role="status">
          <h2>Schau in dein Postfach</h2>
          <p>
            Wenn zu <strong>{sentTo}</strong> ein Konto oder eine gültige Einladung gehört, kommt gleich eine Mail mit
            deinem Anmeldelink. Er gilt 15 Minuten.
          </p>
          <button className="btn" onClick={() => setSentTo(null)}>
            Andere Adresse eingeben
          </button>
        </section>
      ) : (
        <form className="stack" onSubmit={submit}>
          <label className="field">
            <span>E-Mail-Adresse</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              inputMode="email"
              enterKeyHint="send"
            />
          </label>
          <button type="submit" className="btn primary big" disabled={busy || !email.trim()}>
            Anmeldelink schicken
          </button>
        </form>
      )}

      {!invitation && passkeysSupported() && (
        <button className="btn big" onClick={passkey} disabled={busy}>
          Mit Passkey anmelden
        </button>
      )}

      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      <p className="muted small">TopStack gibt es nur auf Einladung. Ohne Konto bekommst du den Link über deine Gruppe.</p>
    </main>
  );
}
