import { useEffect, useState } from 'react';
import { api, errorText } from '../../api/client';
import type { H2HDuel, H2HTable } from '../../api/types';
import { eloText } from '../../domain/elo';
import { type Rival, recordText, rivals } from '../../domain/rivals';
import { Avatar } from '../../Avatar';

/** Meine Bilanz gegen jeden Gegner (Phase 5, AP-6, Entwurf B). */
export function RivalList({ groupId, me, onOpen }: { groupId: string; me: string; onOpen(id: string): void }) {
  const [list, setList] = useState<Rival[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<H2HTable>(`/groups/${groupId}/head-to-head`)
      .then((t) => active && setList(rivals(me, t.players, t.pairs)))
      .catch((err: unknown) => active && setError(errorText(err)));
    return () => {
      active = false;
    };
  }, [groupId, me]);

  if (error) return <p className="warn">{error}</p>;
  if (!list) return <div className="skeleton" style={{ height: 180 }} aria-label="Lade Duelle" />;
  if (list.length === 0) return <p className="muted">Noch keine anderen Spieler in der Gruppe.</p>;
  return (
    <ul className="rivals" aria-label="Deine Bilanz gegen jeden Gegner">
      {list.map((r) => (
        <li key={r.id} className={r.nemesis ? 'nemesis' : ''}>
          <button type="button" onClick={() => onOpen(r.id)} aria-label={`Duell gegen ${r.name}: ${recordText(r)}`}>
            <Avatar avatar={r.avatar} name={r.name} size={36} />
            <span className="who">
              {r.name}
              <small>{r.played === 0 ? 'noch nie gespielt' : r.played === 1 ? '1 Match' : `${r.played} Matches`}</small>
            </span>
            <span className={r.played === 0 ? 'score muted' : 'score'}>{r.played === 0 ? '–' : recordText(r)}</span>
            {r.played > 0 && <Split wins={r.wins} draws={r.draws} losses={r.losses} />}
            {r.nemesis && <span className="tag">Angstgegner</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Split({ wins, draws, losses, big = false }: { wins: number; draws: number; losses: number; big?: boolean }) {
  return (
    <span className={big ? 'split big' : 'split'} aria-hidden="true">
      {wins > 0 && <i className="w" style={{ flex: wins }} />}
      {draws > 0 && <i className="d" style={{ flex: draws }} />}
      {losses > 0 && <i className="l" style={{ flex: losses }} />}
    </span>
  );
}

/** Direktvergleich als Anzeigetafel mit allen Begegnungen. */
export function Duel({ groupId, me, opponent, onClose }: { groupId: string; me: string; opponent: string; onClose(): void }) {
  const [d, setD] = useState<H2HDuel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setD(null);
    api<H2HDuel>(`/groups/${groupId}/head-to-head/${me}/${opponent}`)
      .then((x) => active && setD(x))
      .catch((err: unknown) => active && setError(errorText(err)));
    return () => {
      active = false;
    };
  }, [groupId, me, opponent]);

  return (
    <section className="card left duel" aria-label="Duell" data-testid="duel">
      <div className="group-head">
        <h3>Duell</h3>
        <button className="btn ghost" onClick={onClose} aria-label="Duell schließen">
          ✕
        </button>
      </div>
      {error && <p className="warn">{error}</p>}
      {!d && !error && <div className="skeleton" style={{ height: 140 }} />}
      {d && (
        <>
          <div className="duel-board">
            <div>
              <Avatar avatar={d.player.avatar} name={d.player.display_name} size={56} />
              <b className="me">{d.wins}</b>
              <small>
                {d.player.display_name}
                <br />
                Elo {eloText(d.elo)}
              </small>
            </div>
            <span className="colon">:</span>
            <div>
              <Avatar avatar={d.opponent.avatar} name={d.opponent.display_name} size={56} />
              <b>{d.losses}</b>
              <small>
                {d.opponent.display_name}
                <br />
                Elo {eloText(d.opponent_elo)}
              </small>
            </div>
          </div>
          {d.wins + d.draws + d.losses === 0 ? (
            <p className="muted small">Ihr habt noch nie gegeneinander gespielt.</p>
          ) : (
            <>
              <Split wins={d.wins} draws={d.draws} losses={d.losses} big />
              <p className="duel-legend muted small">
                <span>{d.wins === 1 ? '1 Sieg' : `${d.wins} Siege`}</span>
                <span>{d.draws === 1 ? '1 Unentschieden' : `${d.draws} Unentschieden`}</span>
                <span>{d.losses === 1 ? '1 Niederlage' : `${d.losses} Niederlagen`}</span>
              </p>
              <p className="muted small">
                Spiele {d.games_won}:{d.games_lost}
                {d.imported > 0 && ` · ${d.imported} ${d.imported === 1 ? 'Match' : 'Matches'} aus Altdaten`}
              </p>
              <h4>Begegnungen</h4>
              <ul className="meetings" aria-label="Begegnungen">
                {d.meetings.map((m, i) => (
                  <li key={`${m.played_on}-${i}`}>
                    <span className="muted">{new Date(m.played_on).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                    <span>
                      {m.set_code}
                      {m.imported && <span className="badge small">Altdaten</span>}
                    </span>
                    <span className={m.games_won > m.games_lost ? 'res elo-up' : m.games_won < m.games_lost ? 'res elo-down' : 'res muted'}>
                      {m.games_won}:{m.games_lost}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
