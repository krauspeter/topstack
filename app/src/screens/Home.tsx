import { useEffect, useState } from 'react';
import { BUILD, buildLabel } from '../build';
import { markVersionSeen, pendingWhatsNew, seenAtStartup } from '../whatsNew';
import type { Account } from '../store/useAccount';
import { TournamentCard, useHomeCards } from './HomeTournament';

interface Props {
  account: Account;
  onNewMatch(): void;
  onSeating(): void;
  onLogin(): void;
  onTournaments(): void;
  onLeaderboard(): void;
  onProfile(): void;
  onFeedback(): void;
  onOpenTournament(id: string): void;
}

export function Home({
  account,
  onNewMatch,
  onSeating,
  onLogin,
  onProfile,
  onTournaments,
  onLeaderboard,
  onFeedback,
  onOpenTournament,
}: Props) {
  const me = account.status === 'signed-in' ? account.me : null;
  const cards = useHomeCards(me);
  const inGroup = me !== null && me.groups.length > 0;
  // Gold gehört dem nächsten Schritt (ADR-0011): im Turnier der Knopf der Karte, sonst das freie Match
  const matchPrimary = !cards.some((c) => c.primary);

  if (cards.length > 0) {
    return (
      <main className="page home with-tournament">
        <header className="brand compact">
          <svg viewBox="0 0 64 64" aria-hidden="true" className="brand-mark">
            <rect x="14" y="22" width="36" height="26" rx="4" />
            <rect x="18" y="16" width="28" height="26" rx="4" />
            <rect x="22" y="10" width="20" height="26" rx="4" />
          </svg>
          <h1>TopStack</h1>
        </header>

        {cards.map((c) => (
          <TournamentCard key={c.id} card={c} onOpen={onOpenTournament} />
        ))}

        <nav className="stack">
          <button className={matchPrimary ? 'btn primary big' : 'btn big'} onClick={onNewMatch}>
            Freies Match
          </button>
          <div className="nav-pair">
            <button className="btn big" onClick={onLeaderboard}>
              Rangliste
            </button>
            <button className="btn big" onClick={onTournaments}>
              Turniere
            </button>
          </div>
        </nav>

        <Footer account={account} onLogin={onLogin} onProfile={onProfile} onFeedback={onFeedback} />
        <WhatsNew />
      </main>
    );
  }

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
          Freies Match
        </button>
        {inGroup && (
          <>
            <button className="btn big" onClick={onTournaments}>
              Turnier
            </button>
            <button className="btn big" onClick={onLeaderboard}>
              Rangliste
            </button>
          </>
        )}
        <button className="btn big" onClick={onSeating}>
          Draftplätze auslosen
        </button>
      </nav>

      <Footer account={account} onLogin={onLogin} onProfile={onProfile} onFeedback={onFeedback} />
      <WhatsNew />
    </main>
  );
}

function Footer({ account, onLogin, onProfile, onFeedback }: Pick<Props, 'account' | 'onLogin' | 'onProfile' | 'onFeedback'>) {
  return (
    <footer className="stack">
        {account.status === 'signed-in' && (
          <button className="btn ghost account" onClick={onProfile}>
            Angemeldet als <strong>{account.me.display_name}</strong> · Profil
          </button>
        )}
        {account.status === 'signed-in' && (
          <button className="btn ghost" onClick={onFeedback}>
            Feedback geben
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
  );
}

/** Nach einem Update auf eine neue Version einmal kurz zeigen, was neu ist (AP-4). */
function WhatsNew() {
  const [entries, setEntries] = useState(() => pendingWhatsNew(BUILD.version, seenAtStartup()));
  if (entries.length === 0) return null;
  const close = () => {
    markVersionSeen(BUILD.version);
    setEntries([]);
  };
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Was ist neu">
      <div className="sheet whats-new">
        <h2>Was ist neu in v{BUILD.version}</h2>
        <ul>
          {entries.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
        <button className="btn primary big" onClick={close}>
          Alles klar
        </button>
      </div>
    </div>
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
