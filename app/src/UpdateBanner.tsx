import { useState } from 'react';
import { resetApp, useAppUpdate, useMatchActive } from './store/appUpdate';

/**
 * Hinweis „Neue Version da“ (Phase 5, AP-14, ADR-0021). Während eines laufenden Matches bleibt
 * er verborgen und erscheint erst danach (N-06).
 */
export function UpdateBanner() {
  const { state, reload } = useAppUpdate();
  const suppressed = useMatchActive();
  const [busy, setBusy] = useState(false);
  if (suppressed || state.status === 'current') return null;
  return (
    <div className="update-banner" role="status" data-testid="update-banner">
      {state.status === 'available' ? (
        <>
          <p>Neue Version da (Update #{state.server}).</p>
          <button className="btn small" onClick={reload}>
            Jetzt laden
          </button>
        </>
      ) : (
        <>
          <p>Die neue Version (Update #{state.server}) kommt nicht an. Zurücksetzen holt sie frisch, deine Spielstände bleiben.</p>
          <button
            className="btn small"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void resetApp();
            }}
          >
            App zurücksetzen
          </button>
        </>
      )}
    </div>
  );
}

/** Notausgang für das Profil und den Offline-Hinweis. */
export function ResetAppButton({ className = 'btn' }: { className?: string }) {
  const [confirm, setConfirm] = useState(false);
  if (!confirm) {
    return (
      <button className={className} onClick={() => setConfirm(true)}>
        App zurücksetzen
      </button>
    );
  }
  return (
    <div className="stack">
      <p className="small">
        Lädt die App frisch vom Server, falls sie auf einem alten Stand hängt. Spielstände und Anmeldung bleiben erhalten.
      </p>
      <button className="btn primary" onClick={() => void resetApp()}>
        Jetzt zurücksetzen
      </button>
      <button className="btn ghost" onClick={() => setConfirm(false)}>
        Abbrechen
      </button>
    </div>
  );
}
