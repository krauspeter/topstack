import { type FormEvent, useEffect, useState } from 'react';
import { api, errorText } from '../../api/client';
import type { GuestInfo, GuestJoined } from '../../api/types';

/** Gast scannt den QR-Code und meldet sich mit Namen an (UC-05), ohne Konto. */
export function GuestJoin({ token, onDone }: { token: string; onDone(): void }) {
  const [info, setInfo] = useState<GuestInfo | null>(null);
  const [name, setName] = useState('');
  const [joined, setJoined] = useState<GuestJoined | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<GuestInfo>(`/guest/${encodeURIComponent(token)}`)
      .then((data) => active && setInfo(data))
      .catch((err: unknown) => active && setError(errorText(err)));
    return () => {
      active = false;
    };
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setJoined(await api<GuestJoined>(`/guest/${encodeURIComponent(token)}`, { method: 'POST', body: { display_name: name.trim() } }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (joined) {
    return (
      <main className="page center">
        <section className="card" role="status">
          <h2>Du bist dabei, {joined.display_name}!</h2>
          <p>Die Plätze lost der Turnierstarter aus. Deine Farben trägt er nach dem Deckbau für dich ein.</p>
          {joined.claim_url && (
            <div className="stack">
              <p className="small">
                Willst du öfter mitspielen? Mit einem Profil bleiben deine Ergebnisse von heute erhalten und du stehst in der Rangliste.
              </p>
              <a className="btn primary" href={new URL(joined.claim_url).pathname}>
                Profil anlegen
              </a>
              <p className="muted small">Der Link gilt 30 Tage. Du kannst auch später über das Turnier fragen.</p>
            </div>
          )}
          <button className="btn" onClick={onDone}>
            Zum Life-Tracker
          </button>
        </section>
      </main>
    );
  }

  if (!info) {
    return (
      <main className="page center">
        {error ? (
          <section className="card" role="alert">
            <h2>Link ungültig</h2>
            <p>Der QR-Code ist abgelaufen oder falsch. Bitte den Turnierstarter um einen neuen.</p>
          </section>
        ) : (
          <p className="muted">Lade Turnier …</p>
        )}
      </main>
    );
  }

  return (
    <main className="page center">
      <section className="card">
        <h2>
          Draft {info.set_code} · {info.group_name}
        </h2>
        {info.open ? (
          <form className="stack" onSubmit={submit}>
            <label className="field">
              <span>Dein Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} autoComplete="given-name" />
            </label>
            <button type="submit" className="btn primary big" disabled={busy || !name.trim()}>
              Als Gast mitspielen
            </button>
          </form>
        ) : (
          <p>Die Anmeldung ist schon geschlossen.</p>
        )}
        {error && (
          <p className="warn" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
