import { useEffect, useState } from 'react';
import { api, errorText } from '../../api/client';
import type { InvitationAccepted, InvitationInfo, Me } from '../../api/types';
import type { Account } from '../../store/useAccount';
import { Login } from './Login';

interface Props {
  token: string;
  account: Account;
  onJoined(): void;
  onBack(): void;
  onSignedIn(me: Me): void;
}

/** Einladung in eine Gruppe annehmen (UC-02, /einladung/<token>). */
export function Invitation({ token, account, onJoined, onBack, onSignedIn }: Props) {
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api<InvitationInfo>(`/invitations/${encodeURIComponent(token)}`)
      .then((data) => active && setInfo(data))
      .catch((err: unknown) => active && setError(errorText(err)));
    return () => {
      active = false;
    };
  }, [token]);

  if (error && !info) {
    return (
      <main className="page center">
        <section className="card" role="alert">
          <h2>Einladung nicht gültig</h2>
          <p>{error}</p>
          <p className="muted small">Bitte lass dir von deiner Gruppe einen neuen Link schicken.</p>
          <button className="btn" onClick={onBack}>
            Zur Startseite
          </button>
        </section>
      </main>
    );
  }
  if (!info || account.status === 'loading') return <main className="page center muted">Lade Einladung …</main>;

  if (account.status !== 'signed-in') {
    return <Login invitation={token} title={`Einladung: ${info.group_name}`} onSignedIn={onSignedIn} onBack={onBack} />;
  }

  const member = account.me.groups.some((g) => g.name === info.group_name);
  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      await api<InvitationAccepted>(`/invitations/${encodeURIComponent(token)}/accept`, { method: 'POST' });
      onJoined();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page center">
      <section className="card">
        <h2>{info.group_name}</h2>
        <p>
          Du bist eingeladen, der Gruppe <strong>{info.group_name}</strong> beizutreten, angemeldet als{' '}
          <strong>{account.me.display_name}</strong>.
        </p>
        <button className="btn primary big" onClick={join} disabled={busy}>
          {member ? 'Du bist schon Mitglied – weiter' : 'Gruppe beitreten'}
        </button>
        <button className="btn" onClick={onBack} disabled={busy}>
          Nicht jetzt
        </button>
        {error && (
          <p className="warn" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
