import { useEffect, useMemo, useState } from 'react';
import { api, errorText } from '../../api/client';
import type { Leaderboard as Board, Me, PlayerStats, SeasonInfo } from '../../api/types';
import { ManaPips } from '../ManaPips';

interface Props {
  me: Me;
  onBack(): void;
}

/** Filter als Query-String: Saison und Zeitraum (TC-71). */
export function filterQuery(season: string, from: string, to: string): string {
  const q = new URLSearchParams();
  if (season) q.set('season', season);
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  const s = q.toString();
  return s ? `?${s}` : '';
}

const pct = (n: number) => `${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;
const num = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 });

/** Rangliste der Gruppe mit Filter und Spielerstatistik (F-18, F-22, AP-9). */
export function Leaderboard({ me, onBack }: Props) {
  const [groupId, setGroupId] = useState(me.groups[0]?.id ?? '');
  const [seasons, setSeasons] = useState<SeasonInfo[]>([]);
  const [season, setSeason] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [board, setBoard] = useState<Board | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = useMemo(() => filterQuery(season, from, to), [season, from, to]);

  useEffect(() => {
    if (!groupId) return;
    api<SeasonInfo[]>(`/groups/${groupId}/seasons`)
      .then(setSeasons)
      .catch(() => setSeasons([]));
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return;
    let active = true;
    setError(null);
    api<Board>(`/groups/${groupId}/leaderboard${query}`)
      .then((b) => active && setBoard(b))
      .catch((err: unknown) => active && setError(errorText(err)));
    return () => {
      active = false;
    };
  }, [groupId, query]);

  useEffect(() => {
    if (!groupId || !selected) return setStats(null);
    let active = true;
    api<PlayerStats>(`/groups/${groupId}/players/${selected}/stats${query}`)
      .then((s) => active && setStats(s))
      .catch((err: unknown) => active && setError(errorText(err)));
    return () => {
      active = false;
    };
  }, [groupId, selected, query]);

  const myPlayer = me.groups.find((g) => g.id === groupId)?.player_id ?? null;

  return (
    <main className="page">
      <header className="title-bar">
        <button className="btn ghost" onClick={onBack}>
          ‹ Zurück
        </button>
        <h2>Rangliste</h2>
      </header>

      <section className="stack" aria-label="Filter">
        {me.groups.length > 1 && (
          <label className="field">
            <span className="muted small">Gruppe</span>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              {me.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="chips-select" role="group" aria-label="Saison">
          <button type="button" className={season === '' ? 'chip on' : 'chip'} aria-pressed={season === ''} onClick={() => setSeason('')}>
            Gesamt
          </button>
          {seasons.map((s) => (
            <button
              key={s.id}
              type="button"
              className={season === s.id ? 'chip on' : 'chip'}
              aria-pressed={season === s.id}
              onClick={() => setSeason(s.id)}
            >
              {s.name}
              {s.current ? ' · aktuell' : ''}
            </button>
          ))}
        </div>
        <div className="row date-range">
          <label className="field">
            <span className="muted small">Von</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Von" />
          </label>
          <label className="field">
            <span className="muted small">Bis</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Bis" />
          </label>
        </div>
        {(from || to) && (
          <button
            className="btn ghost"
            onClick={() => {
              setFrom('');
              setTo('');
            }}
          >
            Zeitraum zurücksetzen
          </button>
        )}
      </section>

      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}

      {board && board.rows.length === 0 && (
        <p className="muted" data-testid="empty">
          Noch keine abgeschlossenen Turniere{query ? ' in diesem Zeitraum' : ''}.
        </p>
      )}

      {board && board.rows.length > 0 && (
        <section className="stack">
          <p className="muted small">
            {board.tournaments} {board.tournaments === 1 ? 'Turnier' : 'Turniere'} · Tippen für die Statistik
          </p>
          <div className="table-scroll">
            <table className="games standings leaderboard" aria-label="Rangliste">
              <thead>
                <tr>
                  <th>#</th>
                  <th className="left">Spieler</th>
                  <th title="Ranglistenpunkte">Pkt</th>
                  <th title="Turniere">T</th>
                  <th title="Turniersiege">🏆</th>
                  <th title="Summe der Matchpunkte">MP</th>
                  <th title="Matchpunkte pro Turnier">Ø</th>
                </tr>
              </thead>
              <tbody>
                {board.rows.map((r) => (
                  <tr
                    key={r.player_id}
                    className={[r.player_id === myPlayer ? 'mine' : '', r.player_id === selected ? 'selected' : ''].join(' ')}
                    onClick={() => setSelected(r.player_id === selected ? null : r.player_id)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setSelected(r.player_id)}
                    aria-label={`Statistik von ${r.display_name}`}
                  >
                    <td>{r.rank}</td>
                    <td className="left">{r.display_name}</td>
                    <td>
                      <strong>{r.ranking_points}</strong>
                    </td>
                    <td>{r.tournaments}</td>
                    <td>{r.wins}</td>
                    <td>{r.match_points}</td>
                    <td>{num(r.avg_match_points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {stats && selected && <StatsCard stats={stats} onClose={() => setSelected(null)} />}
    </main>
  );
}

function StatsCard({ stats: s, onClose }: { stats: PlayerStats; onClose(): void }) {
  const placesText = Object.entries(s.places)
    .map(([place, n]) => `${n}× Platz ${place}`)
    .join(', ');
  return (
    <section className="card left" data-testid="player-stats" aria-label={`Statistik von ${s.display_name}`}>
      <div className="group-head">
        <h3>{s.display_name}</h3>
        <button className="btn ghost" onClick={onClose} aria-label="Statistik schließen">
          ✕
        </button>
      </div>
      <dl className="stats">
        <dt>Turniere</dt>
        <dd>
          {s.tournaments} · {s.tournament_wins} {s.tournament_wins === 1 ? 'Sieg' : 'Siege'}
        </dd>
        <dt>Platzierungen</dt>
        <dd>
          {placesText || '–'}
          {s.tournaments > 0 && <span className="muted"> · Ø {num(s.avg_place)}</span>}
        </dd>
        <dt>Matches</dt>
        <dd>
          {s.matches.wins}-{s.matches.draws}-{s.matches.losses} · {pct(s.match_win_rate)} gewonnen
        </dd>
        <dt>Spiele</dt>
        <dd>
          {s.games_won}:{s.games_lost} · {pct(s.game_win_rate)} gewonnen
        </dd>
        <dt>Farben</dt>
        <dd className="color-stats">
          {s.combos.length === 0
            ? '–'
            : s.combos.slice(0, 3).map((c) => (
                <span key={c.key}>
                  <ManaPips colors={c.key === 'C' ? '' : c.key} /> {c.count}×
                </span>
              ))}
        </dd>
      </dl>
      {s.opponents.length > 0 && (
        <>
          <h4>Gegen</h4>
          <ul className="opponents">
            {s.opponents.map((o) => (
              <li key={o.player_id}>
                <span>{o.display_name}</span>
                <span className="muted">
                  {o.wins}-{o.draws}-{o.losses}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
