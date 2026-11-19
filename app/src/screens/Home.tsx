import type { Account } from '../store/useAccount';

interface Props {
  account: Account;
  onNewMatch(): void;
  onSeating(): void;
  onLogin(): void;
  onProfile(): void;
}

export function Home({ account, onNewMatch, onSeating, onLogin, onProfile }: Props) {
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
        <button className="btn big" onClick={onSeating}>
          Draftplätze auslosen
        </button>
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
      </footer>
    </main>
  );
}
