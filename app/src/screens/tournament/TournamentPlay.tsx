import { type CSSProperties, useEffect, useState } from 'react';
import { ApiError, api, errorText } from '../../api/client';
import { deviceId } from '../../store/useMatch';
import type { MatchInfo, NextOpponent, Standing, Tournament, TrackerInfo } from '../../api/types';
import type { GameEvent } from '../../domain/lifeEvents';
import type { MatchConfig } from '../../domain/match';
import { type ColorChoice, normalizeColors } from '../../domain/colors';
import { choiceSurface } from '../../theme';
import { ManaPips } from '../ManaPips';
import { configFromTracker, defaultSide, fromApi } from '../../domain/remote';
import { bestOf, matchResults } from '../../domain/activeGroup';


interface Props {
  t: Tournament;
  busy: boolean;
  /** Starter oder Admin: bestätigt für Gäste und Spieler ohne Konto mit (wie bei den Farben). */
  helper: boolean;
  can(action: Tournament['actions'][number]): boolean;
  /** Startet die nächste Runde; Warnungen fragt die Turnierseite ab. */
  onNextRound(): void;
  onAct(path: string, method?: 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<void>;
  /** Life-Tracker für ein Turnier-Match öffnen; `false`, wenn noch ein freies Match läuft. */
  onPlay(config: MatchConfig, events: GameEvent[]): boolean;
}

const score = (m: MatchInfo) =>
  m.games_drawn ? `${m.games_a}:${m.games_b} (+${m.games_drawn})` : `${m.games_a}:${m.games_b}`;

/** Turnier spielen: Runden, Ergebnisse, Tabelle, Abschluss (UC-08 bis UC-17). */
export function TournamentPlay({ t, busy, helper, can, onNextRound, onAct, onPlay }: Props) {
  const [editing, setEditing] = useState<MatchInfo | null>(null);
  const [playing_, setPlaying] = useState<MatchInfo | null>(null);
  const [showPlan, setShowPlan] = useState(false);

  const current = t.rounds.find((r) => r.number === t.current_round) ?? null;
  const all = t.rounds.flatMap((r) => r.matches);
  const pulled = t.rounds.filter((r) => r.status === 'planned').flatMap((r) => r.matches.filter((m) => m.status !== 'scheduled'));
  const leftovers = t.rounds
    .filter((r) => r.status === 'finished')
    .flatMap((r) => r.matches.filter((m) => m.status !== 'finished'));
  const suggestion = all.find((m) => m.id === t.suggestion) ?? null;
  const openTotal = all.filter((m) => m.status !== 'finished').length;
  const finished = t.status === 'finished';
  const needsRoll = t.standings.some((s) => s.needs_roll && s.roll === null);
  const playing = t.status === 'running' || t.status === 'paused';
  const proxies = helper
    ? t.entries.filter((e) => e.status === 'accepted' && (e.kind === 'guest' || e.kind === 'reserved'))
    : [];

  return (
    <>
      {finished && <Ceremony standings={t.standings} entries={t.entries} />}

      {t.status === 'paused' && (
        <section className="card">
          <h2>Pause</h2>
          <p className="muted">Ergebnisse lassen sich nachtragen. Weiter geht es mit „Fortsetzen“.</p>
          {can('resume') && (
            <button className="btn primary big" onClick={() => void onAct('/resume')}>
              Fortsetzen
            </button>
          )}
        </section>
      )}

      {t.cancel_vote && playing && (
        <section className="card" data-testid="cancel-vote">
          <h2>Abbruch beantragt</h2>
          <p>
            {t.cancel_vote.requested_by} möchte das Turnier abbrechen. {t.cancel_vote.confirmed} von{' '}
            {t.cancel_vote.participants} haben bestätigt, nötig sind {t.cancel_vote.required}.
          </p>
          {can('vote_cancel') &&
            (t.cancel_vote.i_voted ? (
              <button className="btn big" onClick={() => void onAct('/cancel-request/vote', 'DELETE')}>
                Bestätigung zurücknehmen
              </button>
            ) : (
              <button className="btn danger big" onClick={() => void onAct('/cancel-request/vote', 'PUT')}>
                Abbruch bestätigen
              </button>
            ))}
          {proxies.length > 0 && (
            <div className="stack">
              <p className="muted small">Für Spieler ohne eigenes Handy-Konto bestätigen:</p>
              <div className="chips-select" role="group" aria-label="Bestätigen für">
                {proxies.map((e) => {
                  const on = t.cancel_vote?.voters.includes(e.player_id) ?? false;
                  return (
                    <button
                      key={e.player_id}
                      type="button"
                      className={on ? 'chip on' : 'chip'}
                      aria-pressed={on}
                      disabled={busy}
                      onClick={() => void onAct(`/cancel-request/votes/${e.player_id}`, on ? 'DELETE' : 'PUT')}
                    >
                      {e.display_name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {can('request_cancel') && (
            <button className="btn" onClick={() => void onAct('/cancel-request', 'DELETE')}>
              Antrag zurückziehen
            </button>
          )}
        </section>
      )}

      {current && playing && (
        <section className="stack" aria-label={`Runde ${current.number}`}>
          <h3>
            Runde {current.number} von {t.rounds.length}
          </h3>
          {t.next_opponent && <PauseCard next={t.next_opponent} />}
          <MatchList matches={[...current.matches, ...pulled, ...leftovers]} onEdit={setEditing} onPlay={setPlaying} />
          {current.bye && <p className="muted small">Pause: {current.bye}</p>}

          {suggestion && suggestion.status === 'scheduled' && (
            <div className="card left" data-testid="suggestion">
              <p>
                Frei: <strong>{suggestion.player_a}</strong> gegen <strong>{suggestion.player_b}</strong> aus einer späteren
                Runde. Jetzt vorziehen?
              </p>
              {suggestion.can_report && (
                <button className="btn big" onClick={() => void onAct(`/matches/${suggestion.id}/start`)}>
                  Match vorziehen
                </button>
              )}
            </div>
          )}

          {can('next_round') && t.rounds_left > 0 && (
            <button className={t.open_in_current ? 'btn big' : 'btn primary big'} onClick={onNextRound}>
              Runde {current.number + 1} starten
            </button>
          )}
          {can('finish') && t.rounds_left === 0 && openTotal === 0 && !needsRoll && (
            <button className="btn primary big" onClick={() => void onAct('/finish')}>
              Turnier abschließen
            </button>
          )}
          {t.rounds_left === 0 && openTotal > 0 && (
            <p className="muted small">Letzte Runde: noch {openTotal} Matches offen, dann kann das Turnier abgeschlossen werden.</p>
          )}
          {needsRoll && openTotal === 0 && (
            <div className="card">
              <p>Gleichstand nach allen Tiebreakern. Ein W20 entscheidet.</p>
              <button className="btn primary big" onClick={() => void onAct('/tiebreak-roll')}>
                W20 würfeln
              </button>
            </div>
          )}
          {can('pause') && (
            <button className="btn" onClick={() => void onAct('/pause')}>
              Pausieren
            </button>
          )}
        </section>
      )}

      {t.standings.length > 0 && <StandingsTable standings={t.standings} finished={finished} />}

      {t.rounds.length > 0 && (
        <section className="stack">
          <button className="btn" onClick={() => setShowPlan((v) => !v)} aria-expanded={showPlan}>
            {showPlan ? 'Spielplan ausblenden' : 'Ganzer Spielplan'}
          </button>
          {showPlan &&
            t.rounds.map((r) => (
              <div key={r.number} className="stack">
                <h3 className="small">
                  Runde {r.number}
                  {r.bye && <span className="muted"> · Pause: {r.bye}</span>}
                </h3>
                <MatchList matches={r.matches} onEdit={playing ? setEditing : undefined} later={r.status === 'planned'} />
              </div>
            ))}
        </section>
      )}

      {playing_ && (
        <PlaySheet tournamentId={t.id} match={playing_} onPlay={onPlay} onClose={() => setPlaying(null)} />
      )}

      {editing && (
        <ResultSheet
          gamesToWin={t.rules?.games_to_win ?? 2}
          match={editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async (a, b) => {
            const m = editing;
            setEditing(null);
            await onAct(`/matches/${m.id}/result`, 'PUT', {
              games_a: a,
              games_b: b,
              games_drawn: 0,
              ...(m.status === 'finished' ? { version: m.version } : {}),
            });
          }}
        />
      )}
    </>
  );
}

/** Pause-Ansicht (AP-7): wer frei ist, sieht den nächsten Gegner und die eigene Bilanz. */
function PauseCard({ next }: { next: NextOpponent }) {
  const played = next.wins + next.draws + next.losses;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return (
    <div className="card left" data-testid="pause-card">
      <h3>Du hast gerade frei</h3>
      <p>
        Nächster Gegner: <strong>{next.display_name}</strong> <span className="muted">(Runde {next.round})</span>
      </p>
      <p className="muted small">
        {played === 0
          ? `Ihr habt in dieser Gruppe noch nicht gegeneinander gespielt.`
          : `Deine Bilanz gegen ${next.display_name}: ${plural(next.wins, 'Sieg', 'Siege')}, ${plural(next.draws, 'Unentschieden', 'Unentschieden')}, ${plural(next.losses, 'Niederlage', 'Niederlagen')}.`}
      </p>
    </div>
  );
}

function MatchList({
  matches,
  onEdit,
  onPlay,
  later = false,
}: {
  matches: MatchInfo[];
  onEdit?: (m: MatchInfo) => void;
  onPlay?: (m: MatchInfo) => void;
  /** Runde ist noch nicht gestartet: offene Matches erst vorziehen. */
  later?: boolean;
}) {
  return (
    <ul className="match-list">
      {matches.map((m) => {
        const editable = onEdit && m.can_report && !(later && m.status === 'scheduled');
        return (
          <li key={m.id} className={m.mine ? 'mine' : undefined} data-testid="match">
            <span className="match-names">
              <strong>{m.player_a}</strong> <span className="muted">gegen</span> <strong>{m.player_b}</strong>
            </span>
            <span className="match-score">
              {m.status === 'finished' ? (
                score(m)
              ) : m.status === 'running' && typeof m.life_a === 'number' && typeof m.life_b === 'number' ? (
                <span className="live-life" data-testid="live-life" title={`Spiel ${m.game_no ?? 1}, Lebenspunkte`}>
                  {m.life_a} : {m.life_b}
                  <small>
                    Spiel {m.game_no} · {m.games_a}:{m.games_b}
                  </small>
                </span>
              ) : m.status === 'running' ? (
                'läuft'
              ) : (
                '–'
              )}
            </span>
            {editable && (
              <span className="match-actions">
                {onPlay && m.status !== 'finished' && (
                  <button className="btn primary" onClick={() => onPlay(m)}>
                    {m.status === 'running' ? 'Tracker' : 'Spielen'}
                  </button>
                )}
                <button className="btn" onClick={() => onEdit(m)}>
                  {m.status === 'finished' ? 'Ändern' : 'Ergebnis'}
                </button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Match mit dem Life-Tracker spielen (UC-10, UC-11): Modus wählen, im Modus „jeder sein
 * Handy“ wählen, wen dieses Handy zählt. Läuft das Match schon, koppelt das Handy dazu.
 */
function PlaySheet({
  tournamentId,
  match,
  onPlay,
  onClose,
}: {
  tournamentId: string;
  match: MatchInfo;
  onPlay(config: MatchConfig, events: GameEvent[]): boolean;
  onClose(): void;
}) {
  const [info, setInfo] = useState<TrackerInfo | null>(null);
  const [step, setStep] = useState<'load' | 'mode' | 'side'>('load');
  const [error, setError] = useState<string | null>(null);
  /** Für diesen Spieler zählt schon ein anderes Handy: übernehmen? */
  const [taken, setTaken] = useState<string | null>(null);
  const base = `/tournaments/${tournamentId}/matches/${match.id}/tracker`;

  const launch = (i: TrackerInfo, side: string | null) => {
    if (!onPlay(configFromTracker(i, side), i.events.map(fromApi))) {
      setError('Auf diesem Handy läuft noch ein freies Match. Beende es zuerst.');
    }
  };

  /** Modus „dual“: erst beim Server den Platz belegen, dann öffnen (Warteraum, 21.11.2026). */
  const open = async (i: TrackerInfo, side: string | null, force = false) => {
    if (i.match.tracker_mode !== 'dual' || side === null) return launch(i, side);
    setError(null);
    try {
      const seated = await api<TrackerInfo>(`${base}/seats/${side}`, {
        method: 'PUT',
        body: { device_id: deviceId(), force },
      });
      setTaken(null);
      launch(seated, side);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && !force) setTaken(side);
      else setError(errorText(err));
    }
  };

  const proceed = (i: TrackerInfo) => {
    setInfo(i);
    if (i.match.tracker_mode === 'dual' && defaultSide(i) === null) setStep('side');
    else void open(i, defaultSide(i));
  };


  const choose = async (mode: 'shared' | 'dual') => {
    setError(null);
    try {
      proceed(await api<TrackerInfo>(base, { method: 'POST', body: { mode } }));
    } catch (err) {
      setError(errorText(err));
    }
  };

  useEffect(() => {
    let active = true;
    api<TrackerInfo>(base)
      .then((i) => {
        if (!active) return;
        setInfo(i);
        // Noch kein Spiel: Modus wählen; sonst gleich dazukoppeln
        if (i.events.length === 0) setStep('mode');
        else proceed(i);
      })
      .catch((err: unknown) => active && setError(errorText(err)));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur beim Öffnen laden
  }, [base]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Match spielen">
      <div className="sheet">
        <h2>
          {match.player_a} <span className="muted">gegen</span> {match.player_b}
        </h2>
        {step === 'load' && !error && <p className="muted">Lade Match …</p>}
        {step === 'mode' && (
          <>
            <p className="muted small">Wie zählt ihr die Lebenspunkte?</p>
            <button className="btn primary big" onClick={() => void choose('shared')}>
              Ein Handy für beide
            </button>
            <button className="btn big" onClick={() => void choose('dual')}>
              Jeder sein eigenes Handy
            </button>
          </>
        )}
        {step === 'side' && info && (
          <>
            <p className="muted small">Für wen zählt dieses Handy?</p>
            {[info.player_a, info.player_b].map((p) => (
              <button key={p.id} className="btn big" onClick={() => void open(info, p.id)}>
                {p.display_name}
              </button>
            ))}
          </>
        )}
        {taken && info && (
          <div className="stack" data-testid="seat-taken">
            <p className="warn">
              Für {[info.player_a, info.player_b].find((p) => p.id === taken)?.display_name} zählt schon ein anderes Handy.
            </p>
            <button className="btn danger big" onClick={() => void open(info, taken, true)}>
              Auf dieses Handy übernehmen
            </button>
          </div>
        )}
        {error && (
          <p className="warn" role="alert">
            {error}
          </p>
        )}
        <button className="btn" onClick={onClose}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}

/** Ergebnis wählen und bestätigen (UC-12); Korrektur bis Turnierende (UC-14). */
function ResultSheet({
  match,
  gamesToWin,
  busy,
  onClose,
  onSave,
}: {
  match: MatchInfo;
  /** Nötige Spielsiege des Turniers (AP-3), 2 = Best-of-3. */
  gamesToWin: number;
  busy: boolean;
  onClose(): void;
  onSave(a: number, b: number): Promise<void>;
}) {
  const initial = match.status === 'finished' ? `${match.games_a}:${match.games_b}` : null;
  const [picked, setPicked] = useState<string | null>(initial);
  const verdict = (a: number, b: number) =>
    a > b ? `${match.player_a} gewinnt` : b > a ? `${match.player_b} gewinnt` : 'Unentschieden';

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Ergebnis eintragen">
      <div className="sheet">
        <h2>
          {match.player_a} <span className="muted">gegen</span> {match.player_b}
        </h2>
        <p className="muted small">
          Gewonnene Spiele ({bestOf(gamesToWin)}).{gamesToWin > 1 && ' Nach Zeitablauf geht auch ein offener Stand wie 1:0.'}
        </p>
        <div className="result-grid" role="group" aria-label="Ergebnis">
          {matchResults(gamesToWin).map(([a, b]) => {
            const key = `${a}:${b}`;
            return (
              <button
                key={key}
                type="button"
                className={picked === key ? 'chip on' : 'chip'}
                aria-pressed={picked === key}
                onClick={() => setPicked(key)}
              >
                {key}
              </button>
            );
          })}
        </div>
        {picked && <p data-testid="verdict">{verdict(...(picked.split(':').map(Number) as [number, number]))}</p>}
        <button
          className="btn primary big"
          disabled={!picked || busy || picked === initial}
          onClick={() => {
            if (!picked) return;
            const [a, b] = picked.split(':').map(Number);
            void onSave(a, b);
          }}
        >
          {match.status === 'finished' ? 'Korrektur speichern' : 'Ergebnis bestätigen'}
        </button>
        <button className="btn big" onClick={onClose}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}

function StandingsTable({ standings, finished }: { standings: Standing[]; finished: boolean }) {
  return (
    <section className="stack">
      <h3>{finished ? 'Endstand' : 'Tabelle'}</h3>
      <div className="table-scroll">
        <table className="games standings" aria-label="Turniertabelle">
          <thead>
            <tr>
              <th>#</th>
              <th className="left">Spieler</th>
              <th title="Siege-Unentschieden-Niederlagen">S-U-N</th>
              <th title="Matchpunkte">Pkt</th>
              <th title="Spiele gewonnen:verloren">Spiele</th>
              {finished && <th title="Ranglistenpunkte">RL</th>}
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <tr key={s.player_id}>
                <td>{s.rank}</td>
                <td className="left">
                  {s.display_name}
                  {s.roll !== null && <span className="muted small"> · W20: {s.roll}</span>}
                </td>
                <td>
                  {s.wins}-{s.draws}-{s.losses}
                </td>
                <td>
                  <strong>{s.match_points}</strong>
                </td>
                <td>
                  {s.games_won}:{s.games_lost}
                </td>
                {finished && <td>{s.ranking_points ?? '–'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Konfetti-Stücke: feste Positionen, damit die Darstellung bei jedem Rendern gleich bleibt. */
const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: ((i * 7) % 10) * 0.08,
  drift: ((i * 13) % 9) - 4,
  turn: (i * 47) % 360,
}));

/**
 * Siegerehrung (UC-17): Podest mit 2. links, 1. in der Mitte, 3. rechts. Die Stufen wachsen
 * nacheinander (3., 2., 1.), danach fällt Konfetti in den Deckfarben des Siegers. Mit
 * „Bewegung reduzieren“ des Systems steht alles sofort still da.
 */
function Ceremony({ standings, entries }: { standings: Standing[]; entries: Tournament['entries'] }) {
  const place = (s: Standing) => s.final_place ?? s.rank;
  const podium = standings.filter((s) => place(s) <= 3).sort((a, b) => place(a) - place(b));
  const colorsOf = (id: string) => entries.find((e) => e.player_id === id)?.colors ?? null;
  const winnerColors = podium[0] ? normalizeColors(colorsOf(podium[0].player_id) ?? '') : '';
  const palette =
    winnerColors === ''
      ? ['var(--gold)']
      : [...winnerColors].map((c) => choiceSurface(c as ColorChoice).value);
  return (
    <section className="card trophy" data-testid="ceremony">
      <div className="confetti" aria-hidden="true">
        {CONFETTI.map((c, i) => (
          <i
            key={i}
            style={
              {
                left: `${c.left}%`,
                background: palette[i % palette.length],
                animationDelay: `${1.4 + c.delay}s`,
                '--drift': `${c.drift * 12}px`,
                '--turn': `${c.turn}deg`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <svg className="cup" viewBox="0 0 64 64" aria-hidden="true">
        <path d="M18 8h28v10a14 14 0 0 1-28 0zM18 12H8a10 10 0 0 0 10 12M46 12h10a10 10 0 0 1-10 12M28 32h8v12h-8zM20 50h24v6H20z" />
      </svg>
      <h2>Siegerehrung</h2>
      <ol className="podium">
        {podium.map((s) => {
          const colors = colorsOf(s.player_id);
          return (
            <li key={s.player_id} className={`podium-step place-${place(s)}`}>
              <div className="step-name">
                {place(s) === 1 && (
                  <svg className="crown" viewBox="0 0 24 16" aria-hidden="true">
                    <path d="M2 14 L4 4 L9 9 L12 2 L15 9 L20 4 L22 14 Z" />
                  </svg>
                )}
                <strong>{s.display_name}</strong>
                {colors !== null && <ManaPips colors={colors} />}
                <span className="muted small">
                  {s.match_points} Pkt{s.ranking_points !== null ? ` · +${s.ranking_points}` : ''}
                </span>
              </div>
              <div className="step-block">
                <span>{place(s)}.</span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
