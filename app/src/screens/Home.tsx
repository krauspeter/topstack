import { useEffect, useState } from 'react';
import { BUILD, buildLabel } from '../build';
import { markVersionSeen, pendingWhatsNew, seenAtStartup } from '../whatsNew';
import { type Account, reauthenticate } from '../store/useAccount';
import { TournamentCard, useHomeCards } from './HomeTournament';
import { ResetAppButton } from '../UpdateBanner';

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
  /** Anmeldestand neu abfragen (Knopf „Erneut versuchen“ im Offline-Hinweis). */
  onRetry(): void;
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
  onRetry,
}: Props) {
  const me = account.status === 'signed-in' ? account.me : null;
  const { cards, reload } = useHomeCards(me);
  const inGroup = me !== null && me.groups.length > 0;
  // Gold (ADR-0011): im laufenden Turnier gehört es der Karte, sonst dem freien Match
  const matchPrimary = !cards.some((c) => c.hot || c.primary);

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
          <TournamentCard key={c.id} card={c} onOpen={onOpenTournament} onChanged={reload} />
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

        <Footer account={account} onLogin={onLogin} onProfile={onProfile} onFeedback={onFeedback} onRetry={onRetry} />
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

      <Footer account={account} onLogin={onLogin} onProfile={onProfile} onFeedback={onFeedback} onRetry={onRetry} />
      <WhatsNew />
    </main>
  );
}

function Footer({
  account,
  onLogin,
  onProfile,
  onFeedback,
  onRetry,
}: Pick<Props, 'account' | 'onLogin' | 'onProfile' | 'onFeedback' | 'onRetry'>) {
  return (
    <footer className="stack">
        {account.status === 'offline' && <OfflineNote reason={account.reason} onRetry={onRetry} />}
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

/**
 * Server nicht erreichbar: sagen, warum Konto, Turniere und Rangliste fehlen. Auf Staging ist
 * oft nur die Anmeldung bei Cloudflare Access abgelaufen; dann führt der Knopf dorthin.
 */
function OfflineNote({ reason, onRetry }: { reason: 'network' | 'access'; onRetry(): void }) {
  const [busy, setBusy] = useState(false);
  if (reason === 'access') {
    return (
      <div className="offline-note" role="status">
        <p>Anmeldung bei Cloudflare abgelaufen. Nach der Anmeldung sind Konto und Turniere wieder da; der Life-Tracker geht auch so.</p>
        <button className="btn small" onClick={() => reauthenticate(window.location.pathname)}>
          Bei Cloudflare anmelden
        </button>
        <ResetAppButton className="btn small ghost" />
      </div>
    );
  }
  return (
    <div className="offline-note" role="status">
      <p>Server gerade nicht erreichbar. Freies Match und Draftplätze gehen trotzdem.</p>
      <button
        className="btn small"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          onRetry();
          setTimeout(() => setBusy(false), 1500);
        }}
      >
        Erneut versuchen
      </button>
    </div>
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
