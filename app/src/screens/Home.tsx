interface Props {
  onNewMatch(): void;
  onSeating(): void;
}

export function Home({ onNewMatch, onSeating }: Props) {
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

      <footer className="muted small">Läuft auch ohne Internet · Spielstand bleibt auf diesem Gerät gespeichert</footer>
    </main>
  );
}
