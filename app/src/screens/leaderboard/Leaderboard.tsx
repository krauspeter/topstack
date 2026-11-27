import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { api, errorText } from '../../api/client';
import type { Leaderboard as Board, Me, PlayerStats, SeasonInfo, WinRecord } from '../../api/types';
import { describeColors } from '../../domain/colors';
import { useActiveGroup } from '../../store/activeGroup';
import { GroupSwitcher } from '../GroupSwitcher';
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
  const [group, selectGroup] = useActiveGroup(me.groups);
  const groupId = group?.id ?? '';
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
        <GroupSwitcher groups={me.groups} active={group} onSelect={selectGroup} />
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

type StatsView = 'opponents' | 'with' | 'vs';

const VIEWS: { id: StatsView; label: string }[] = [
  { id: 'opponents', label: 'Gegner' },
  { id: 'with', label: 'Meine Farben' },
  { id: 'vs', label: 'Gegen Farben' },
];

const VIEW_KEY = 'topstack.statsView';

/** Zuletzt gewählte Ansicht, damit sie beim nächsten Öffnen wieder da ist. */
function loadView(): StatsView {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return VIEWS.some((x) => x.id === v) ? (v as StatsView) : 'opponents';
  } catch {
    return 'opponents';
  }
}

function saveView(v: StatsView) {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    // ohne Speicher gilt die Auswahl nur bis zum Schließen
  }
}

const record = (r: WinRecord) => `${r.wins}-${r.draws}-${r.losses}`;
/** Siegquote wie auf dem Server: Unentschieden zählen als nicht gewonnen. */
const winRate = (r: WinRecord) => {
  const n = r.wins + r.draws + r.losses;
  return n ? Math.round((1000 * r.wins) / n) / 10 : 0;
};
/** „C“ steht für farblos und wird als C-Symbol gezeigt. */
const Pips = ({ k }: { k: string }) => <ManaPips colors={k === 'C' ? '' : k} />;
const colorName = (k: string) => describeColors(k === 'C' ? '' : k);

/** Eine Zeile mit Name links und Zahlen in festen, rechtsbündigen Spalten. */
function RecordRow({ label, r, rate, aria }: { label: ReactNode; r: WinRecord; rate: number; aria: string }) {
  return (
    <li aria-label={aria}>
      <span className="name">{label}</span>
      <span className="num">{record(r)}</span>
      <span className="num muted">{pct(rate)}</span>
    </li>
  );
}

function StatsCard({ stats: s, onClose }: { stats: PlayerStats; onClose(): void }) {
  const [view, setView] = useState<StatsView>(loadView);
  const placesText = Object.entries(s.places)
    .map(([place, n]) => `${n}× Platz ${place}`)
    .join(', ');
  const choose = (v: StatsView) => {
    setView(v);
    saveView(v);
  };
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
        <dt>Plätze</dt>
        <dd>{placesText || '–'}</dd>
        {s.tournaments > 0 && (
          <>
            <dt>Ø Platz</dt>
            <dd>{num(s.avg_place)}</dd>
          </>
        )}
        <dt>Matches</dt>
        <dd>
          {record(s.matches)} · {pct(s.match_win_rate)}
        </dd>
        <dt>Spiele</dt>
        <dd>
          {s.games_won}:{s.games_lost} · {pct(s.game_win_rate)}
        </dd>
        <dt>Farben</dt>
        <dd className="color-stats">
          {s.combos.length === 0
            ? '–'
            : s.combos.slice(0, 3).map((c) => (
                <span key={c.key}>
                  <Pips k={c.key} /> {c.count}×
                </span>
              ))}
        </dd>
      </dl>

      <div className="chips-select" role="group" aria-label="Bilanz">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={view === v.id ? 'chip on' : 'chip'}
            aria-pressed={view === v.id}
            onClick={() => choose(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>
      <p className="muted small">
        {view === 'opponents' && 'Siege-Unentschieden-Niederlagen gegen jeden Spieler'}
        {view === 'with' && 'Mit welchen Farben du am besten warst'}
        {view === 'vs' && 'Gegen welche Farben du am häufigsten verloren hast'}
      </p>
      <ul className="records" data-testid="records">
        {view === 'opponents' &&
          s.opponents.map((o) => (
            <RecordRow key={o.player_id} label={o.display_name} r={o} rate={winRate(o)} aria={o.display_name} />
          ))}
        {view === 'with' &&
          s.with_colors.map((c) => <RecordRow key={c.key} label={<Pips k={c.key} />} r={c} rate={c.win_rate} aria={colorName(c.key)} />)}
        {view === 'vs' &&
          s.vs_colors.map((c) => <RecordRow key={c.key} label={<Pips k={c.key} />} r={c} rate={c.win_rate} aria={colorName(c.key)} />)}
      </ul>
      {((view === 'opponents' && s.opponents.length === 0) ||
        (view === 'with' && s.with_colors.length === 0) ||
        (view === 'vs' && s.vs_colors.length === 0)) && (
        <p className="muted" data-testid="records-empty">
          {view === 'opponents' ? 'Noch keine Matches.' : 'Noch keine Farben gemeldet.'}
        </p>
      )}
    </section>
  );
}
