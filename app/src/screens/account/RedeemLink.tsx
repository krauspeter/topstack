import { useEffect, useRef, useState } from 'react';
import { ApiError, api, errorText } from '../../api/client';
import { createPasskey, passkeysSupported } from '../../api/passkeys';
import type { Me } from '../../api/types';

interface Props {
  token: string;
  invitation: string | null;
  onSignedIn(me: Me): void;
  onDone(): void;
  onNewLink(): void;
}

type State =
  | { step: 'checking' }
  | { step: 'offer-passkey'; me: Me }
  | { step: 'failed'; message: string; expired: boolean };

/** Löst den Magic-Link aus der Mail ein (/anmelden?token=…&einladung=…). */
export function RedeemLink({ token, invitation, onSignedIn, onDone, onNewLink }: Props) {
  const [state, setState] = useState<State>({ step: 'checking' });
  const [busy, setBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Der Link ist nur einmal gültig: auch im StrictMode nur ein Aufruf
    if (started.current) return;
    started.current = true;
    api<Me>('/auth/magic-link/verify', { method: 'POST', body: { token, invitation } })
      .then((me) => {
        onSignedIn(me);
        if (!me.has_passkey && passkeysSupported()) setState({ step: 'offer-passkey', me });
        else onDone();
      })
      .catch((err: unknown) => {
        const expired = err instanceof ApiError && err.status === 410;
        setState({
          step: 'failed',
          expired,
          message: expired ? 'Der Link ist abgelaufen oder wurde schon benutzt.' : errorText(err),
        });
      });
  }, [token, invitation, onSignedIn, onDone]);

  if (state.step === 'checking') {
    return <main className="page center muted">Melde dich an …</main>;
  }

  if (state.step === 'failed') {
    return (
      <main className="page center">
        <section className="card" role="alert">
          <h2>Anmeldung hat nicht geklappt</h2>
          <p>{state.message}</p>
          {state.expired && (
            <button className="btn primary big" onClick={onNewLink}>
              Neuen Link anfordern
            </button>
          )}
          <button className="btn" onClick={onDone}>
            Zur Startseite
          </button>
        </section>
      </main>
    );
  }

  const add = async () => {
    setBusy(true);
    setPasskeyError(null);
    try {
      await createPasskey();
      onSignedIn({ ...state.me, has_passkey: true });
      onDone();
    } catch (err) {
      setPasskeyError(err instanceof DOMException ? 'Abgebrochen. Du kannst den Passkey später im Profil anlegen.' : errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page center">
      <section className="card">
        <h2>Hallo {state.me.display_name}!</h2>
        <p>Du bist angemeldet. Mit einem Passkey meldest du dich künftig ohne E-Mail an, per Fingerabdruck oder Gesicht.</p>
        <button className="btn primary big" onClick={add} disabled={busy}>
          Passkey anlegen
        </button>
        <button className="btn" onClick={onDone} disabled={busy}>
          Später
        </button>
        {passkeyError && (
          <p className="warn" role="alert">
            {passkeyError}
          </p>
        )}
      </section>
    </main>
  );
}
