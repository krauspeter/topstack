import { useEffect, useState } from 'react';
import { BUILD, buildLabel } from '../build';
import type { Account } from '../store/useAccount';

interface Props {
  account: Account;
  onNewMatch(): void;
  onSeating(): void;
  onLogin(): void;
  onTournaments(): void;
  onLeaderboard(): void;
  onProfile(): void;
}

export function Home({ account, onNewMatch, onLogin, onProfile, onTournaments, onLeaderboard }: Props) {
  return (
    <main className="page home">
      <header className="brand">
        <svg viewBox="0 0 64 64" aria-hidden="true" className="brand-mark">
          <rect x="14" y="22" width="36" height="26" rx="4" />
          <rect x="18" y="16" width="28" height="26" rx="4" />
          <rect x="22" y="10" width="20" height="26" rx="4" />
        </svg>
        <h1>TopStack</h1>
        <p className="muted">Life-Tracker für eure Draft-Abende</p>
      </header>

      <nav className="stack">
        <button className="btn primary big" onClick={onNewMatch}>
          Neues Match
        </button>
        {account.status === 'signed-in' && account.me.groups.length > 0 && (
          <>
            <button className="btn big" onClick={onTournaments}>
              Turnier
            </button>
            <button className="btn big" onClick={onLeaderboard}>
              Rangliste
            </button>
          </>
        )}
      </nav>

      <footer className="stack">
        {account.status === 'signed-in' && (
          <button className="btn ghost account" onClick={onProfile}>
            Angemeldet als <strong>{account.me.display_name}</strong> · Profil
          </button>
        )}
        {account.status === 'anonymous' && (
          <button className="btn ghost account" onClick={onLogin}>
            Anmelden
          </button>
        )}
        <p className="muted small">Läuft auch ohne Internet · Spielstand bleibt auf diesem Gerät gespeichert</p>
        <BuildLine />
      </footer>
    </main>
  );
}

/**
 * Welches Update läuft? App-Stand aus dem Build; weicht der Server ab (z. B. nur ein
 * Image aktualisiert), steht seine Nummer dahinter.
 */
function BuildLine() {
  const [server, setServer] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetch('/api/v1/health')
      .then((r) => (r.ok ? (r.json() as Promise<{ build?: { pr?: string; sha?: string } }>) : null))
      .then((h) => {
        if (!active || !h?.build) return;
        const pr = h.build.pr ?? '';
        const sha = (h.build.sha ?? '').slice(0, 7);
        if (pr ? pr !== BUILD.pr : sha && sha !== BUILD.sha) setServer(pr ? `#${pr}` : sha);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return (
    <p className="muted small build" data-testid="build">
      {buildLabel(BUILD)}
      {server && <span className="warn"> · Server {server}</span>}
    </p>
  );
}
