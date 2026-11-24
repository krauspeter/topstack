import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { ApiError, api, errorText } from '../api/client';
import { useLive } from '../api/live';
import type { Me, Tournament, TournamentSummary } from '../api/types';
import { type HomeCard, type LiveLine, homeCard, showOnHome, sortCards } from '../domain/homeCard';

/**
 * Laufende Turniere, in denen ich eingetragen bin, als Karte auf der Startseite (Vorschlag A,
 * eingeschoben in Phase 4 am 24.11.2026). Daten aus den bestehenden Endpunkten; aktualisiert
 * sich live über den WebSocket und beim Zurückkehren in die App.
 */
export function useHomeCards(me: Me | null): { cards: HomeCard[]; reload(): void } {
  const [cards, setCards] = useState<HomeCard[]>([]);

  const load = useCallback(async () => {
    if (!me || me.groups.length === 0) {
      setCards([]);
      return;
    }
    try {
      const lists = await Promise.all(me.groups.map((g) => api<TournamentSummary[]>(`/groups/${g.id}/tournaments`)));
      const ids = lists.flat().filter((t) => showOnHome(t.status, t.finished_at)).map((t) => t.id);
      const details = await Promise.all(ids.map((id) => api<Tournament>(`/tournaments/${id}`)));
      setCards(sortCards(details.map(homeCard).filter((c): c is HomeCard => c !== null)));
    } catch {
      // offline oder Server weg: Startseite ohne Karte, der Rest funktioniert weiter
    }
  }, [me]);

  useEffect(() => {
    void load();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  // Live: je Karte ein Abo; jede Änderung lädt neu (gebündelt in useLive)
  useLive(cards[0]?.id ?? null, () => void load());
  useLive(cards[1]?.id ?? null, () => void load());

  return { cards, reload: () => void load() };
}

interface CardProps {
  card: HomeCard;
  onOpen(id: string): void;
  /** Nach einer Aktion auf der Karte neu laden (falls man auf der Startseite bleibt). */
  onChanged(): void;
}

function scoreText(mine: number, theirs: number): string {
  if (mine > theirs) return `du führst ${mine}:${theirs}`;
  if (mine < theirs) return `du liegst ${mine}:${theirs} hinten`;
  return `${mine}:${theirs}`;
}

function LiveList({ live }: { live: LiveLine[] }) {
  if (live.length === 0) return null;
  return (
    <ul className="tc-others" aria-label="Laufende Matches">
      {live.map((l) => (
        <li key={`${l.a}-${l.b}`}>
          <span>{l.a}</span>
          <strong>{l.lifeA !== null && l.lifeB !== null ? `${l.lifeA} : ${l.lifeB}` : '–'}</strong>
          <span>{l.b}</span>
        </li>
      ))}
    </ul>
  );
}

/** Kurze Rückfrage vor „Match vorziehen“ und „Nächste Runde starten“ direkt auf der Startseite. */
function useCardAction(card: HomeCard, onOpen: (id: string) => void, onChanged: () => void) {
  const [ask, setAsk] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = card.action;

  const post = async (path: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      await api<Tournament>(`/tournaments/${card.id}${path}`, { method: 'POST', body });
      setAsk(null);
      setWarning(null);
      onOpen(card.id);
    } catch (err) {
      const code = err instanceof ApiError ? err.extra.code : undefined;
      if (path === '/rounds/next' && (code === 'missing_colors' || code === 'open_matches')) {
        setWarning((err as ApiError).message);
      } else {
        setError(errorText(err));
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (a.kind === 'pull') void post(`/matches/${a.matchId}/start`);
    if (a.kind === 'next_round') void post('/rounds/next', { confirm: warning !== null });
  };

  const trigger = () => {
    if (a.kind === 'pull') setAsk(`Match gegen ${a.opponent} aus Runde ${a.round} jetzt vorziehen?`);
    else if (a.kind === 'next_round') setAsk(`Runde ${a.round} jetzt starten?`);
    else onOpen(card.id);
  };

  const dialog =
    ask !== null ? (
      <div className="overlay" role="dialog" aria-modal="true" aria-label="Bestätigen">
        <div className="sheet">
          <p>{warning ?? ask}</p>
          {error && (
            <p className="warn" role="alert">
              {error}
            </p>
          )}
          <button className="btn primary big" disabled={busy} onClick={confirm}>
            {warning ? 'Trotzdem starten' : a.kind === 'pull' ? 'Vorziehen' : 'Starten'}
          </button>
          <button
            className="btn big"
            onClick={() => {
              setAsk(null);
              setWarning(null);
              setError(null);
            }}
          >
            Zurück
          </button>
        </div>
      </div>
    ) : null;

  return { trigger, dialog };
}

export function TournamentCard({ card, onOpen, onChanged }: CardProps) {
  const s = card.state;
  const a = card.action;
  const open = () => onOpen(card.id);
  const { trigger, dialog } = useCardAction(card, onOpen, onChanged);
  let label: string;
  let title: string;
  let text: string | null = null;
  let action: string;
  let extra: ReactNode = null;

  // Aktion in Pause und nach dem eigenen Match
  const freeAction =
    a.kind === 'next_round'
      ? `Runde ${a.round} starten`
      : a.kind === 'pull'
        ? 'Match vorziehen'
        : a.kind === 'live'
          ? 'Live-Ansicht öffnen'
          : 'Zum Turnier';
  const pullHint =
    a.kind === 'pull' ? (
      <p className="tc-text">
        Dein Match gegen <strong>{a.opponent}</strong> aus Runde {a.round} kann vorgezogen werden.
      </p>
    ) : null;

  switch (s.kind) {
    case 'invited':
      [label, title, text, action] = ['EINLADUNG', 'Du bist eingeladen', `Turnier ${card.setCode}: sag zu, um mitzuspielen.`, 'Einladung ansehen'];
      break;
    case 'prep':
      [label, title, text, action] = ['TURNIER WIRD VORBEREITET', s.label, null, 'Zum Turnier'];
      break;
    case 'your_turn':
      [label, title, action] = ['TURNIER LÄUFT', 'Du bist dran', 'Match starten'];
      extra = (
        <p className="tc-text">
          Dein Match gegen <strong>{s.opponent}</strong> kann starten.
        </p>
      );
      break;
    case 'playing':
      [label, title, action] = ['DEIN MATCH LÄUFT', `Gegen ${s.opponent}`, 'Zum Match'];
      extra = (
        <div className="tc-live">
          <span className="muted">
            {s.gameNo ? `Spiel ${s.gameNo} · ` : ''}
            {scoreText(s.myGames, s.oppGames)}
          </span>
          {s.myLife !== null && s.oppLife !== null && (
            <strong className="tc-life" aria-label={`Lebenspunkte ${s.myLife} zu ${s.oppLife}`}>
              {s.myLife} : {s.oppLife}
            </strong>
          )}
        </div>
      );
      break;
    case 'done':
      label = 'TURNIER LÄUFT';
      title = a.kind === 'next_round' ? 'Runde fertig' : 'Dein Match ist fertig';
      text =
        a.kind === 'next_round' || s.openMatches === 0
          ? s.allPlayed
            ? 'Alle Matches sind gespielt. Abschließen im Turnier.'
            : 'Alle Matches dieser Runde sind fertig.'
          : `Noch ${s.openMatches} ${s.openMatches === 1 ? 'Match' : 'Matches'} in dieser Runde offen.`;
      action = freeAction;
      extra = (
        <>
          {pullHint}
          <LiveList live={s.live} />
        </>
      );
      break;
    case 'bye':
      [label, title, action] = ['PAUSE', 'Du hast gerade frei', freeAction];
      extra = (
        <>
          {pullHint ??
            (s.next && (
              <p className="tc-text muted">
                Nächster Gegner: {s.next.display_name} (Runde {s.next.round}) · eure Bilanz {s.next.wins}-{s.next.draws}-
                {s.next.losses}
              </p>
            ))}
          <LiveList live={s.live} />
        </>
      );
      break;
    case 'paused':
      [label, title, text, action] = ['TURNIER PAUSIERT', 'Turnier pausiert', 'Es geht an einem anderen Abend weiter.', 'Zum Turnier'];
      break;
    case 'finished':
      label = 'TURNIER BEENDET';
      title = s.place ? `Platz ${s.place}` : 'Turnier beendet';
      text = [s.points !== null ? `+${s.points} Ranglistenpunkte` : null, s.winner ? `Sieger: ${s.winner}` : null]
        .filter(Boolean)
        .join(' · ');
      action = 'Zur Siegerehrung';
      break;
  }

  const showStats = card.place !== null && s.kind !== 'finished';
  const head = [label, card.setCode, card.roundLabel].filter(Boolean).join(' · ');
  const isTrigger = a.kind === 'pull' || a.kind === 'next_round';
  return (
    <section className={card.hot ? 'tournament-card hot' : 'tournament-card'} aria-label={`Turnier ${card.setCode}`}>
      <div className="tc-head">
        <span className={s.kind === 'paused' || s.kind === 'finished' ? 'tc-dot off' : 'tc-dot'} aria-hidden="true" />
        <span>{head}</span>
      </div>
      <h2 className={card.primary ? 'tc-title gold' : 'tc-title'}>{title}</h2>
      {text && <p className="tc-text">{text}</p>}
      {extra}
      {showStats && (
        <dl className="tc-stats">
          <div>
            <dt>Dein Platz</dt>
            <dd>{card.place}.</dd>
          </div>
          <div>
            <dt>Punkte</dt>
            <dd>{card.matchPoints}</dd>
          </div>
          <div>
            <dt>Bilanz</dt>
            <dd>{card.record}</dd>
          </div>
        </dl>
      )}
      <button className={card.primary ? 'btn primary big' : 'btn big'} onClick={isTrigger ? trigger : open}>
        {action}
      </button>
      {action !== 'Zum Turnier' && (
        <button className="btn ghost small" onClick={open}>
          Zum Turnier: Tabelle und Spielplan ›
        </button>
      )}
      {dialog}
    </section>
  );
}
