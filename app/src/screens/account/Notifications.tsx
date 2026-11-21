import { useEffect, useState } from 'react';
import { api, errorText } from '../../api/client';
import {
  type NotificationSettings,
  type PushState,
  disablePush,
  enablePush,
  pushState,
} from '../../api/push';

/** Profil: Push auf diesem Gerät an/aus, Ereignisse einzeln schalten, Test (AP-8, F-17). */
export function Notifications() {
  const [state, setState] = useState<PushState | null>(null);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void pushState().then(setState);
    api<NotificationSettings>('/me/notifications')
      .then(setSettings)
      .catch(() => undefined);
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
      setState(await pushState());
    }
  };

  return (
    <section className="stack" aria-label="Benachrichtigungen">
      <h3>Benachrichtigungen</h3>
      {state === 'ios-browser' && (
        <p className="muted small">
          Auf dem iPhone gibt es Push nur in der installierten App: in Safari „Teilen“ → „Zum Home-Bildschirm“, dann die
          App von dort öffnen.
        </p>
      )}
      {state === 'unsupported' && <p className="muted small">Dieser Browser kann keine Push-Nachrichten.</p>}
      {state === 'denied' && (
        <p className="warn small">Benachrichtigungen sind für TopStack blockiert. Erlaube sie in den Einstellungen des Browsers.</p>
      )}
      {state === 'off' && (
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => void run(async () => setSettings(await enablePush()))}
        >
          Push auf diesem Gerät aktivieren
        </button>
      )}
      {state === 'on' && (
        <div className="stack">
          <p className="ok small" data-testid="push-on">
            Push ist auf diesem Gerät aktiv{settings ? ` · ${settings.devices} Gerät${settings.devices === 1 ? '' : 'e'} insgesamt` : ''}.
          </p>
          <div className="row">
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const r = await api<{ sent: number }>('/push/test', { method: 'POST' });
                  setMessage(r.sent ? 'Testnachricht ist unterwegs.' : 'Kein Gerät mit Push gefunden.');
                })
              }
            >
              Test senden
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => void run(disablePush)}>
              Auf diesem Gerät aus
            </button>
          </div>
        </div>
      )}
      {settings && (
        <ul className="pref-list">
          {settings.events.map((e) => (
            <li key={e.event}>
              <label>
                <input
                  type="checkbox"
                  checked={e.enabled}
                  disabled={busy}
                  onChange={(ev) =>
                    void run(async () =>
                      setSettings(
                        await api<NotificationSettings>(`/me/notifications/${e.event}`, {
                          method: 'PUT',
                          body: { enabled: ev.target.checked },
                        }),
                      ),
                    )
                  }
                />{' '}
                {e.label}
              </label>
            </li>
          ))}
        </ul>
      )}
      {message && <p className="ok small">{message}</p>}
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
