import type { EloPoint, LeaderboardRow, PlayerStats } from '../../api/types';
import { START, deltaText, direction, eloText, sparkPath, stakes } from '../../domain/elo';

/** Rangliste nach Elo mit Mini-Kurve je Spieler (Phase 5, AP-5, Entwurf B). */
export function EloLadder({
  rows,
  myPlayer,
  selected,
  onSelect,
}: {
  rows: readonly LeaderboardRow[];
  myPlayer: string | null;
  selected: string | null;
  onSelect(id: string | null): void;
}) {
  const sorted = [...rows].sort((a, b) => (b.elo ?? START) - (a.elo ?? START) || a.display_name.localeCompare(b.display_name));
  return (
    <ol className="elo-ladder" aria-label="Rangliste nach Elo">
      {sorted.map((r, i) => {
        const trend = r.elo_trend ?? [];
        const matches = r.elo_matches ?? 0;
        const classes = [r.player_id === myPlayer ? 'mine' : '', r.player_id === selected ? 'selected' : ''].join(' ');
        return (
          <li key={r.player_id} className={classes}>
            <button
              type="button"
              onClick={() => onSelect(r.player_id === selected ? null : r.player_id)}
              aria-label={`Platz ${i + 1}: ${r.display_name}, Elo ${eloText(r.elo ?? START)}. Statistik öffnen`}
            >
              <span className="rank">{i + 1}</span>
              <span className="who">
                {r.display_name}
                <small>
                  {matches === 1 ? '1 Match' : `${matches} Matches`}
                  {matches < 10 && ' · noch neu'}
                </small>
              </span>
              <svg className={`elo-spark ${direction(trend)}`} viewBox="0 0 64 22" aria-hidden="true">
                <path d={sparkPath(trend)} />
              </svg>
              <span className="value">{eloText(r.elo ?? START)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Elo eines Spielers; bei anderen Spielern der Vergleich mit mir und was ein Match brächte. */
export function EloDuel({ stats, me }: { stats: PlayerStats; me: LeaderboardRow | null }) {
  const elo = stats.elo ?? START;
  if (me === null || me.player_id === stats.player_id) {
    return (
      <div className="elo-duel" data-testid="elo-duel">
        <div className="solo">
          <span className="big me">{eloText(elo)}</span>
          <small>
            Elo in der Gruppe · {stats.elo_matches ?? 0} Matches
            {stats.elo_global != null && ` · global ${eloText(stats.elo_global)}`}
          </small>
        </div>
      </div>
    );
  }
  const mine = me.elo ?? START;
  const s = stakes(mine, me.elo_matches ?? 0, elo);
  return (
    <>
      <div className="elo-duel" data-testid="elo-duel">
        <div>
          <span className="big me">{eloText(mine)}</span>
          <small>Du</small>
        </div>
        <span className="muted small">gegen</span>
        <div>
          <span className="big">{eloText(elo)}</span>
          <small>{stats.display_name}</small>
        </div>
      </div>
      <p className="muted small">
        Ein Sieg gegen {stats.display_name} bringt dir {deltaText(s.win)}, eine Niederlage kostet {deltaText(-s.loss)}.
      </p>
    </>
  );
}

/** Die letzten Matches mit ihrer Elo-Änderung, neueste zuerst. */
export function EloSteps({ history, limit = 5 }: { history: readonly EloPoint[]; limit?: number }) {
  const last = history.slice(-limit).reverse();
  if (last.length === 0) return <p className="muted small">Noch keine Matches, die für Elo zählen.</p>;
  const max = Math.max(...last.map((p) => Math.abs(p.delta)), 1);
  return (
    <ul className="elo-steps" aria-label="Letzte Matches mit Elo-Änderung">
      {last.map((p, i) => (
        <li key={`${p.played_on}-${i}`}>
          <span className="muted">{new Date(p.played_on).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>
          <span className="bar" aria-hidden="true">
            <i className={p.delta >= 0 ? 'up' : 'down'} style={{ width: `${(Math.abs(p.delta) / max) * 100}%` }} />
          </span>
          <span className={p.delta > 0.5 ? 'elo-up' : p.delta < -0.5 ? 'elo-down' : 'muted'}>
            {deltaText(p.delta)} · {p.opponent ?? '?'}
          </span>
        </li>
      ))}
    </ul>
  );
}
