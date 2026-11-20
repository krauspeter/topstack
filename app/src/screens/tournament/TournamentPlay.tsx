import { useState } from 'react';
import type { MatchInfo, Standing, Tournament } from '../../api/types';

/** Ergebnisse eines Best-of-3, auch nach Zeitablauf; aus Sicht von Spieler A. */
const RESULTS: readonly [number, number][] = [
  [2, 0],
  [2, 1],
  [1, 0],
  [1, 1],
  [0, 1],
  [1, 2],
  [0, 2],
];

interface Props {
  t: Tournament;
  busy: boolean;
  /** Starter oder Admin: bestätigt für Gäste und Spieler ohne Konto mit (wie bei den Farben). */
  helper: boolean;
  can(action: Tournament['actions'][number]): boolean;
  /** Startet die nächste Runde; Warnungen fragt die Turnierseite ab. */
  onNextRound(): void;
  onAct(path: string, method?: 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<void>;
}

const score = (m: MatchInfo) =>
  m.games_drawn ? `${m.games_a}:${m.games_b} (+${m.games_drawn})` : `${m.games_a}:${m.games_b}`;

/** Turnier spielen: Runden, Ergebnisse, Tabelle, Abschluss (UC-08 bis UC-17). */
export function TournamentPlay({ t, busy, helper, can, onNextRound, onAct }: Props) {
  const [editing, setEditing] = useState<MatchInfo | null>(null);
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
      {finished && <Ceremony standings={t.standings} />}

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
          <MatchList matches={[...current.matches, ...pulled, ...leftovers]} onEdit={setEditing} />
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

      {editing && (
        <ResultSheet
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

function MatchList({
  matches,
  onEdit,
  later = false,
}: {
  matches: MatchInfo[];
  onEdit?: (m: MatchInfo) => void;
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
            <span className="match-score">{m.status === 'finished' ? score(m) : m.status === 'running' ? 'läuft' : '–'}</span>
            {editable && (
              <button className="btn" onClick={() => onEdit(m)}>
                {m.status === 'finished' ? 'Ändern' : 'Ergebnis'}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Ergebnis wählen und bestätigen (UC-12); Korrektur bis Turnierende (UC-14). */
function ResultSheet({
  match,
  busy,
  onClose,
  onSave,
}: {
  match: MatchInfo;
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
        <p className="muted small">Gewonnene Spiele (Best-of-3). Nach Zeitablauf geht auch 1:0 oder 1:1.</p>
        <div className="result-grid" role="group" aria-label="Ergebnis">
          {RESULTS.map(([a, b]) => {
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

/** Siegerehrung (UC-17): die ersten drei auf dem Podest. */
function Ceremony({ standings }: { standings: Standing[] }) {
  const podium = standings.filter((s) => (s.final_place ?? s.rank) <= 3);
  const medal = ['🥇', '🥈', '🥉'];
  return (
    <section className="card trophy" data-testid="ceremony">
      <svg className="cup" viewBox="0 0 64 64" aria-hidden="true">
        <path d="M18 8h28v10a14 14 0 0 1-28 0zM18 12H8a10 10 0 0 0 10 12M46 12h10a10 10 0 0 1-10 12M28 32h8v12h-8zM20 50h24v6H20z" />
      </svg>
      <h2>Siegerehrung</h2>
      <ol className="podium">
        {podium.map((s) => (
          <li key={s.player_id}>
            <span aria-hidden="true">{medal[(s.final_place ?? s.rank) - 1]}</span> <strong>{s.display_name}</strong>
            <span className="muted small"> · {s.match_points} Pkt</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
