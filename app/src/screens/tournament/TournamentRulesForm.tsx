import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { GroupDetail, TournamentRules } from '../../api/types';
import { bestOf } from '../../domain/activeGroup';

/** Was der Turnierstarter für ein Turnier abweichend einstellen darf (Phase 5, AP-3). */
export type RuleDraft = Omit<TournamentRules, 'custom'>;

const KEYS: (keyof RuleDraft)[] = [
  'games_to_win',
  'starting_life',
  'match_time_limit_min',
  'match_points_win',
  'match_points_draw',
  'match_points_loss',
];

/** Nur die Werte, die von den Gruppenregeln abweichen; leer = Gruppenstandard. */
export function changedRules(group: RuleDraft, draft: RuleDraft): Partial<RuleDraft> {
  return Object.fromEntries(KEYS.filter((k) => draft[k] !== group[k]).map((k) => [k, draft[k]])) as Partial<RuleDraft>;
}

/** Kurztext der Abweichungen, z. B. „Best-of-1 · 30 Leben“. */
export function customRulesText(rules: TournamentRules): string {
  const parts: string[] = [];
  const c = new Set(rules.custom);
  if (c.has('games_to_win')) parts.push(bestOf(rules.games_to_win));
  if (c.has('starting_life')) parts.push(`${rules.starting_life} Leben`);
  if (c.has('match_time_limit_min'))
    parts.push(rules.match_time_limit_min ? `Zeitlimit ${rules.match_time_limit_min} min` : 'ohne Zeitlimit');
  if (c.has('match_points_win') || c.has('match_points_draw') || c.has('match_points_loss'))
    parts.push(`Punkte ${rules.match_points_win}/${rules.match_points_draw}/${rules.match_points_loss}`);
  return parts.join(' · ');
}

/** Aufklappbarer Bereich im Start-Formular, vorbelegt mit den Regeln der Gruppe. */
export function TournamentRulesForm({ groupId, onChange }: { groupId: string; onChange(changes: Partial<RuleDraft>): void }) {
  const [group, setGroup] = useState<RuleDraft | null>(null);
  const [draft, setDraft] = useState<RuleDraft | null>(null);

  useEffect(() => {
    let active = true;
    api<GroupDetail>(`/groups/${groupId}`)
      .then((g) => {
        if (!active) return;
        const r: RuleDraft = {
          games_to_win: g.rules.games_to_win,
          starting_life: g.rules.starting_life,
          match_time_limit_min: g.rules.match_time_limit_min,
          match_points_win: g.rules.match_points_win,
          match_points_draw: g.rules.match_points_draw,
          match_points_loss: g.rules.match_points_loss,
        };
        setGroup(r);
        setDraft(r);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [groupId]);

  if (!group || !draft) return null;

  const set = <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    onChange(changedRules(group, next));
  };
  const int = (v: string, fallback: number) => (Number.isFinite(Number.parseInt(v, 10)) ? Number.parseInt(v, 10) : fallback);

  return (
    <details className="card stack">
      <summary>Regeln für dieses Turnier anpassen</summary>
      <p className="muted small">Vorbelegt mit den Regeln der Gruppe. Änderungen gelten nur für dieses Turnier.</p>
      <label className="field">
        <span>Matchformat</span>
        <select value={draft.games_to_win} onChange={(e) => set('games_to_win', int(e.target.value, 2))}>
          {[1, 2, 3].map((n) => (
            <option key={n} value={n}>
              {bestOf(n)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Startleben</span>
        <input type="number" min={1} max={100} value={draft.starting_life} onChange={(e) => set('starting_life', int(e.target.value, group.starting_life))} />
      </label>
      <label className="field">
        <span>Zeitlimit pro Match in Minuten (leer = aus)</span>
        <input
          type="number"
          min={5}
          max={180}
          value={draft.match_time_limit_min ?? ''}
          onChange={(e) => set('match_time_limit_min', e.target.value === '' ? null : int(e.target.value, 50))}
        />
      </label>
      <div className="nav-pair">
        {(
          [
            ['match_points_win', 'Punkte Sieg'],
            ['match_points_draw', 'Unentschieden'],
            ['match_points_loss', 'Niederlage'],
          ] as const
        ).map(([key, label]) => (
          <label className="field" key={key}>
            <span>{label}</span>
            <input type="number" min={0} max={10} value={draft[key]} onChange={(e) => set(key, int(e.target.value, 0))} />
          </label>
        ))}
      </div>
    </details>
  );
}
