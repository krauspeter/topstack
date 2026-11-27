import { type FormEvent, useEffect, useState } from 'react';
import { api, errorText } from '../../api/client';
import type { Me, Tournament, TournamentSummary } from '../../api/types';
import { useActiveGroup } from '../../store/activeGroup';
import { GroupSwitcher } from '../GroupSwitcher';
import { type RuleDraft, TournamentRulesForm } from './TournamentRulesForm';

interface Props {
  me: Me;
  onOpen(id: string): void;
  onBack(): void;
}

const STATUS: Record<TournamentSummary['status'], string> = {
  setup: 'Anmeldung',
  seated: 'Plätze ausgelost',
  drafting: 'Draft läuft',
  running: 'läuft',
  paused: 'pausiert',
  finished: 'beendet',
  cancelled: 'abgebrochen',
};

const isOpen = (t: TournamentSummary) => t.status !== 'finished' && t.status !== 'cancelled';

/** Turniere der Gruppe; ohne offenes Turnier kann jedes Mitglied eines starten (UC-03). */
export function TournamentHome({ me, onOpen, onBack }: Props) {
  const [group, selectGroup] = useActiveGroup(me.groups);
  const [list, setList] = useState<TournamentSummary[] | null>(null);
  const [setCode, setSetCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<Partial<RuleDraft>>({});
  const gid = group?.id;

  useEffect(() => {
    if (!gid) return;
    let active = true;
    setList(null);
    setError(null);
    setRules({});
    api<TournamentSummary[]>(`/groups/${gid}/tournaments`)
      .then((rows) => active && setList(rows))
      .catch((err: unknown) => active && setError(errorText(err)));
    return () => {
      active = false;
    };
  }, [gid]);

  if (!group) {
    return (
      <main className="page center">
        <section className="card">
          <h2>Noch keine Gruppe</h2>
          <p>Für Turniere brauchst du eine Gruppe. Lass dich einladen oder leg im Profil eine an.</p>
          <button className="btn" onClick={onBack}>
            Zur Startseite
          </button>
        </section>
      </main>
    );
  }

  const open = list?.find(isOpen);
  // Zuschauer und archivierte Gruppen starten keine Turniere (ADR-0018)
  const canStart = group.role !== 'viewer' && !group.archived;

  const start = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = Object.keys(rules).length > 0 ? { set_code: setCode.trim(), rules } : { set_code: setCode.trim() };
      const t = await api<Tournament>(`/groups/${group.id}/tournaments`, { method: 'POST', body });
      onOpen(t.id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <header className="title-bar">
        <button className="btn ghost" onClick={onBack} aria-label="Zurück">
          ‹ Zurück
        </button>
        <div className="title">
          <h2>Turniere</h2>
          <span className="muted small">{group.name}</span>
        </div>
      </header>

      <GroupSwitcher groups={me.groups} active={group} onSelect={selectGroup} />
      {group.archived && <p className="muted small">Diese Gruppe ist archiviert und nur noch lesbar.</p>}

      {list === null && !error && <p className="muted">Lade Turniere …</p>}

      {open ? (
        <section className="card">
          <h2>Offenes Turnier: {open.set_code}</h2>
          <p className="muted">
            {STATUS[open.status]} · {open.players} Spieler
          </p>
          <button className="btn primary big" onClick={() => onOpen(open.id)}>
            Zum Turnier
          </button>
        </section>
      ) : (
        list !== null &&
        canStart && (
          <form className="stack" onSubmit={start}>
            <label className="field">
              <span>Name des Drafts, z. B. Mirrodin oder DSK</span>
              <input
                value={setCode}
                onChange={(e) => setSetCode(e.target.value)}
                required
                minLength={2}
                maxLength={20}
                autoComplete="off"
                enterKeyHint="go"
              />
              <small className="muted">{setCode.trim().length}/20 Zeichen</small>
            </label>
            <TournamentRulesForm key={group.id} groupId={group.id} onChange={setRules} />
            <button type="submit" className="btn primary big" disabled={busy || setCode.trim().length < 2}>
              Draft-Turnier starten
            </button>
          </form>
        )
      )}

      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}

      {list && list.some((t) => !isOpen(t)) && (
        <section className="stack">
          <h3>Frühere Turniere</h3>
          <ul className="group-list">
            {list
              .filter((t) => !isOpen(t))
              .map((t) => (
                <li key={t.id}>
                  <button className="btn ghost row-btn" onClick={() => onOpen(t.id)}>
                    <strong>{t.set_code}</strong>
                    <span className="muted small">
                      {new Date(t.held_on).toLocaleDateString('de-DE')} · {t.players} Spieler · {STATUS[t.status]}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}
    </main>
  );
}
