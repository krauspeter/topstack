import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useLive } from '../api/live';
import type { Me, Tournament, TournamentSummary } from '../api/types';
import { type HomeCard, homeCard, localToday, showOnHome } from '../domain/homeCard';

/**
 * Laufende Turniere, in denen ich eingetragen bin, als Karte auf der Startseite (Vorschlag A,
 * eingeschoben in Phase 4 am 24.11.2026). Daten aus den bestehenden Endpunkten; aktualisiert
 * sich live über den WebSocket und beim Zurückkehren in die App.
 */
export function useHomeCards(me: Me | null): HomeCard[] {
  const [cards, setCards] = useState<HomeCard[]>([]);

  const load = useCallback(async () => {
    if (!me || me.groups.length === 0) {
      setCards([]);
      return;
    }
    try {
      const today = localToday();
      const lists = await Promise.all(me.groups.map((g) => api<TournamentSummary[]>(`/groups/${g.id}/tournaments`)));
      const ids = lists.flat().filter((t) => showOnHome(t.status, t.held_on, today)).map((t) => t.id);
      const details = await Promise.all(ids.map((id) => api<Tournament>(`/tournaments/${id}`)));
      const found = details.map(homeCard).filter((c): c is HomeCard => c !== null);
      // Laufendes vor beendetem, höchstens zwei Karten
      found.sort((a, b) => Number(a.state.kind === 'finished') - Number(b.state.kind === 'finished'));
      setCards(found.slice(0, 2));
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

  return cards;
}

interface CardProps {
  card: HomeCard;
  onOpen(id: string): void;
}

function scoreText(mine: number, theirs: number): string {
  if (mine > theirs) return `du führst ${mine}:${theirs}`;
  if (mine < theirs) return `du liegst ${mine}:${theirs} hinten`;
  return `${mine}:${theirs}`;
}

export function TournamentCard({ card, onOpen }: CardProps) {
  const s = card.state;
  const open = () => onOpen(card.id);
  let label: string;
  let title: string;
  let text: string | null = null;
  let action: string;
  let extra: ReactNode = null;

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
      title = 'Dein Match ist fertig';
      text = s.canNextRound
        ? 'Alle Matches dieser Runde sind fertig.'
        : `Noch ${s.openMatches} ${s.openMatches === 1 ? 'Match' : 'Matches'} in dieser Runde offen.`;
      action = s.canNextRound ? 'Nächste Runde starten' : 'Zum Turnier';
      break;
    case 'bye':
      [label, title, action] = ['PAUSE', 'Du hast gerade frei', 'Live-Ansicht öffnen'];
      extra = (
        <>
          {s.next && (
            <p className="tc-text muted">
              Nächster Gegner: {s.next.display_name} (Runde {s.next.round}) · eure Bilanz {s.next.wins}-{s.next.draws}-
              {s.next.losses}
            </p>
          )}
          {s.live.length > 0 && <p className="tc-text small">Live: {s.live.join(' · ')}</p>}
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
  return (
    <section className={card.primary ? 'tournament-card hot' : 'tournament-card'} aria-label={`Turnier ${card.setCode}`}>
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
      <button className={card.primary ? 'btn primary big' : s.kind === 'bye' ? 'btn big gold-outline' : 'btn big'} onClick={open}>
        {action}
      </button>
      {action !== 'Zum Turnier' && (
        <button className="btn ghost small" onClick={open}>
          Zum Turnier: Tabelle und Spielplan ›
        </button>
      )}
    </section>
  );
}
