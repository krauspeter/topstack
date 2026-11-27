import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../api/client';
import type { GroupDetail, GroupMember, GroupRole, GroupRules, GroupRulesChanged, LeftGroup } from '../../api/types';
import { ROLE_LABEL, SEASON_LABEL, bestOf, fitInto } from '../../domain/activeGroup';
import { InviteLinks, MergePlayers } from './GroupLinks';
import { GroupMembers } from './GroupMembers';

interface Props {
  id: string;
  /** Nach Änderungen, die `/me` betreffen (Name, Bild, Archiv, Rolle): Profil neu laden. */
  onChanged(): void;
  /** Gruppe verlassen oder gelöscht: zurück ins Profil. */
  onGone(message: string): void;
  onBack(): void;
}

/** Bild im Browser auf 512 px verkleinern und als JPEG-Data-URL liefern (ADR-0018). */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitInto(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

function rulesText(r: Partial<GroupRules>): string[] {
  const lines: string[] = [];
  if (r.games_to_win !== undefined) lines.push(bestOf(r.games_to_win));
  if (r.starting_life !== undefined) lines.push(`${r.starting_life} Leben`);
  if (r.match_time_limit_min !== undefined)
    lines.push(r.match_time_limit_min ? `Zeitlimit ${r.match_time_limit_min} min` : 'ohne Zeitlimit');
  if (r.match_points_win !== undefined || r.match_points_draw !== undefined || r.match_points_loss !== undefined)
    lines.push(`Matchpunkte ${r.match_points_win ?? '–'}/${r.match_points_draw ?? '–'}/${r.match_points_loss ?? '–'}`);
  if (r.season_mode !== undefined)
    lines.push(
      r.season_mode === 'months' ? `Saison ${r.season_months ?? '?'} Monate` : `Saison: ${SEASON_LABEL[r.season_mode]}`,
    );
  return lines;
}

/** Gruppe verwalten (UC-01, Phase 5 AP-1): Name, Bild, Mitglieder und Rollen, Regeln, Archiv. */
export function GroupSettings({ id, onChanged, onGone, onBack }: Props) {
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<GroupMember[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'leave' | 'delete' | null>(null);
  const [imageVersion, setImageVersion] = useState(0);
  const [playersVersion, setPlayersVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      const g = await api<GroupDetail>(`/groups/${id}`);
      setGroup(g);
      setName(g.name);
      setMembers(g.can_view_profiles ? await api<GroupMember[]>(`/groups/${id}/members`) : null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<void>, ok?: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      if (ok) setMessage(ok);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  if (!group) {
    return (
      <main className="page center">
        {error ? (
          <section className="card">
            <h2>Gruppe nicht verfügbar</h2>
            <p className="warn">{error}</p>
            <button className="btn" onClick={onBack}>
              Zurück
            </button>
          </section>
        ) : (
          <p className="muted">Lade Gruppe …</p>
        )}
      </main>
    );
  }

  const editable = group.can_manage && !group.archived;

  const rename = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setGroup(await api<GroupDetail>(`/groups/${id}`, { method: 'PATCH', body: { name: name.trim() } }));
      onChanged();
    }, 'Name gespeichert.');
  };

  const upload = (file: File | undefined) => {
    if (!file) return;
    void run(async () => {
      const image = await shrink(file);
      setGroup(await api<GroupDetail>(`/groups/${id}/image`, { method: 'PUT', body: { image } }));
      setImageVersion((v) => v + 1);
      onChanged();
    }, 'Gruppenbild gespeichert.');
  };

  const removeImage = () =>
    void run(async () => {
      setGroup(await api<GroupDetail>(`/groups/${id}/image`, { method: 'DELETE' }));
      onChanged();
    });

  const changeRole = (userId: string, role: GroupRole) =>
    void run(async () => {
      setMembers(await api<GroupMember[]>(`/groups/${id}/members/${userId}/role`, { method: 'PUT', body: { role } }));
      onChanged();
    }, 'Rolle geändert.');

  const archive = (on: boolean) =>
    void run(async () => {
      setGroup(await api<GroupDetail>(`/groups/${id}/archive`, { method: on ? 'POST' : 'DELETE' }));
      onChanged();
    }, on ? 'Gruppe archiviert: Sie ist jetzt nur noch lesbar.' : 'Gruppe wieder aktiv.');

  const leave = () =>
    void run(async () => {
      const left = await api<LeftGroup>(`/groups/${id}/members/me`, { method: 'DELETE' });
      onGone(
        left.new_admin
          ? `Du hast „${group.name}“ verlassen. ${left.new_admin} ist jetzt Admin.`
          : `Du hast „${group.name}“ verlassen.`,
      );
    });

  const remove = () =>
    void run(async () => {
      await api(`/groups/${id}`, { method: 'DELETE' });
      onGone(`„${group.name}“ liegt im Papierkorb und lässt sich 30 Tage lang im Profil wiederherstellen.`);
    });

  return (
    <main className="page">
      <header className="title-bar">
        <button className="btn ghost" onClick={onBack} aria-label="Zurück">
          ‹ Zurück
        </button>
        <div className="title">
          <h2>{group.name}</h2>
          <span className="muted small">
            {ROLE_LABEL[group.role]}
            {group.archived && ' · archiviert'}
          </span>
        </div>
      </header>

      {group.archived && <p className="muted small">Diese Gruppe ist archiviert: Alles bleibt lesbar, aber niemand kann etwas ändern oder neue Turniere starten.</p>}

      <section className="stack" aria-label="Name und Bild">
        {group.has_image && (
          <img className="group-image" src={`/api/v1/groups/${id}/image?v=${imageVersion}`} alt={`Gruppenbild von ${group.name}`} />
        )}
        {editable && (
          <>
            <form className="stack" onSubmit={rename}>
              <label className="field">
                <span>Name der Gruppe</span>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
              </label>
              <button type="submit" className="btn" disabled={busy || !name.trim() || name.trim() === group.name}>
                Name speichern
              </button>
            </form>
            <label className="btn file-btn">
              {group.has_image ? 'Anderes Bild wählen' : 'Gruppenbild wählen'}
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
            </label>
            {group.has_image && (
              <button className="btn ghost" onClick={removeImage} disabled={busy}>
                Bild entfernen
              </button>
            )}
          </>
        )}
      </section>

      {members && (
        <section className="stack">
          <h3>Mitglieder mit Konto</h3>
          <ul className="member-list" aria-label={`Rollen in ${group.name}`}>
            {members.map((m) => (
              <li key={m.user_id}>
                <span>
                  {m.display_name}
                  {m.is_me && <span className="muted small"> · du</span>}
                </span>
                {editable ? (
                  <select
                    value={m.role}
                    aria-label={`Rolle von ${m.display_name}`}
                    disabled={busy}
                    onChange={(e) => changeRole(m.user_id, e.target.value as GroupRole)}
                  >
                    {(['admin', 'member', 'viewer'] as const).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="badge">{ROLE_LABEL[m.role]}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="muted small">Zuschauer sehen Live-Ansicht, Rangliste und Statistik, aber keine Profile und spielen nicht mit.</p>
          <h3>Alle Spieler</h3>
          <GroupMembers key={playersVersion} groupId={id} groupName={group.name} canManage={editable} />
        </section>
      )}

      {group.can_invite && !group.archived && <InviteLinks groupId={id} groupName={group.name} />}

      {editable && (
        <MergePlayers
          groupId={id}
          onMerged={(text) => {
            setMessage(text);
            setPlayersVersion((v) => v + 1);
          }}
        />
      )}

      <RulesSection group={group} editable={editable} busy={busy} run={run} onSaved={setGroup} />

      {message && (
        <p className="ok" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}

      <section className="stack">
        <h3>Verwalten</h3>
        {group.can_manage && (
          <button className="btn" onClick={() => archive(!group.archived)} disabled={busy}>
            {group.archived ? 'Archivieren aufheben' : 'Gruppe archivieren'}
          </button>
        )}
        {confirm === 'leave' ? (
          <div className="stack">
            <p className="small">Wirklich verlassen? Deine Ergebnisse bleiben in der Gruppe. Zurück kommst du nur mit einem neuen Einladungslink.</p>
            <button className="btn danger" onClick={leave} disabled={busy}>
              Ja, Gruppe verlassen
            </button>
            <button className="btn ghost" onClick={() => setConfirm(null)}>
              Abbrechen
            </button>
          </div>
        ) : (
          <button className="btn" onClick={() => setConfirm('leave')} disabled={busy}>
            Gruppe verlassen
          </button>
        )}
        {group.can_manage &&
          (confirm === 'delete' ? (
            <div className="stack">
              <p className="small">Gruppe löschen? Sie verschwindet für alle Mitglieder. 30 Tage lang kann ein Admin sie im Profil wiederherstellen, danach ist sie endgültig weg.</p>
              <button className="btn danger" onClick={remove} disabled={busy}>
                Ja, Gruppe löschen
              </button>
              <button className="btn ghost" onClick={() => setConfirm(null)}>
                Abbrechen
              </button>
            </div>
          ) : (
            <button className="btn danger" onClick={() => setConfirm('delete')} disabled={busy}>
              Gruppe löschen
            </button>
          ))}
      </section>
    </main>
  );
}

/** Regeln der Gruppe; Änderungen gelten ab der nächsten Saison (ADR-0018). */
function RulesSection({
  group,
  editable,
  busy,
  run,
  onSaved,
}: {
  group: GroupDetail;
  editable: boolean;
  busy: boolean;
  run(action: () => Promise<void>, ok?: string): Promise<void>;
  onSaved(group: GroupDetail): void;
}) {
  const [draft, setDraft] = useState<GroupRules>(group.rules);
  useEffect(() => setDraft(group.rules), [group.rules]);

  const changes = Object.fromEntries(
    (Object.keys(draft) as (keyof GroupRules)[])
      .filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(group.rules[k]))
      .map((k) => [k, draft[k]]),
  ) as Partial<GroupRules>;
  const dirty = Object.keys(changes).length > 0;
  const set = <K extends keyof GroupRules>(key: K, value: GroupRules[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const int = (v: string, fallback: number) => (Number.isFinite(Number.parseInt(v, 10)) ? Number.parseInt(v, 10) : fallback);

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const result = await api<GroupRulesChanged>(`/groups/${group.id}/rules`, { method: 'PATCH', body: changes });
      onSaved(result.group);
    }, 'Regeln gespeichert.');
  };

  const discard = () =>
    void run(async () => {
      onSaved(await api<GroupDetail>(`/groups/${group.id}/rules/pending`, { method: 'DELETE' }));
    });

  return (
    <section className="stack">
      <h3>Regeln</h3>
      <p className="small">{rulesText(group.rules).join(' · ')}</p>
      {group.pending_rules && (
        <div className="card stack">
          <p className="small">
            <strong>Ab der nächsten Saison:</strong> {rulesText(group.pending_rules).join(' · ')}
          </p>
          {editable && (
            <button className="btn ghost" onClick={discard} disabled={busy}>
              Vorgemerkte Änderungen verwerfen
            </button>
          )}
        </div>
      )}
      {editable && (
        <form className="stack" onSubmit={save} aria-label="Regeln ändern">
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
            <input type="number" min={1} max={100} value={draft.starting_life} onChange={(e) => set('starting_life', int(e.target.value, 20))} />
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
          <label className="field">
            <span>Saisonlänge</span>
            <select
              value={draft.season_mode}
              onChange={(e) => {
                const mode = e.target.value as GroupRules['season_mode'];
                setDraft((d) => ({ ...d, season_mode: mode, season_months: mode === 'months' ? (d.season_months ?? 6) : null }));
              }}
            >
              {(Object.keys(SEASON_LABEL) as GroupRules['season_mode'][]).map((m) => (
                <option key={m} value={m}>
                  {SEASON_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          {draft.season_mode === 'months' && (
            <label className="field">
              <span>Monate pro Saison</span>
              <input type="number" min={1} max={120} value={draft.season_months ?? 6} onChange={(e) => set('season_months', int(e.target.value, 6))} />
            </label>
          )}
          <p className="muted small">Hat die Gruppe schon Turniere, gelten Änderungen erst ab der nächsten Saison.</p>
          <button type="submit" className="btn" disabled={busy || !dirty}>
            Regeln speichern
          </button>
        </form>
      )}
    </section>
  );
}
