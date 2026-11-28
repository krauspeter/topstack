import { GroupMembers } from './GroupMembers';
import { Notifications } from './Notifications';
import { type FormEvent, useEffect, useState } from 'react';
import { api, errorText } from '../../api/client';
import { createPasskey, passkeysSupported } from '../../api/passkeys';
import type { DeletedGroup, GroupDetail, InvitationCreated, Me } from '../../api/types';
import { MANA, type Mana, choiceName, describeColors, normalizeColors } from '../../domain/colors';
import { choiceSurface } from '../../theme';
import { ResetAppButton } from '../../UpdateBanner';
import { AvatarPicker } from './AvatarPicker';

interface Props {
  me: Me;
  onChange(me: Me): void;
  onSignOut(): void;
  onBack(): void;
  onFeedback(): void;
  /** Bildschirm „Gruppe“ öffnen (Phase 5, AP-1). */
  onOpenGroup(id: string): void;
  /** Profil neu laden, z. B. nach neuer oder wiederhergestellter Gruppe. */
  onRefresh(): void;
  /** Hinweis nach dem Verlassen oder Löschen einer Gruppe. */
  notice?: string | null;
}

const ROLES: Record<Me['groups'][number]['role'], string> = { admin: 'Admin', member: 'Mitglied', viewer: 'Zuschauer' };

/** Lieblingsfarben dürfen auch leer sein, anders als Deckfarben im Match. */
function toggleFavorite(current: string, color: Mana): string {
  return current.includes(color) ? current.replace(color, '') : normalizeColors(current + color);
}

export function Profile({ me, onChange, onSignOut, onBack, onFeedback, onOpenGroup, onRefresh, notice = null }: Props) {
  const [name, setName] = useState(me.display_name);
  const [colors, setColors] = useState(me.favorite_colors);
  const [message, setMessage] = useState<string | null>(notice);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [invites, setInvites] = useState<Record<string, InvitationCreated>>({});
  const [newGroup, setNewGroup] = useState('');
  const [deleted, setDeleted] = useState<DeletedGroup[]>([]);

  useEffect(() => {
    api<DeletedGroup[]>('/me/deleted-groups')
      .then(setDeleted)
      .catch(() => setDeleted([]));
  }, [me]);

  const dirty = name.trim() !== me.display_name || colors !== me.favorite_colors;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof DOMException ? 'Abgebrochen.' : errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const updated = await api<Me>('/me', {
        method: 'PATCH',
        body: { display_name: name.trim(), favorite_colors: colors },
      });
      onChange(updated);
      setName(updated.display_name);
      setColors(updated.favorite_colors);
      setMessage('Gespeichert.');
    });
  };

  const addPasskey = () =>
    run(async () => {
      await createPasskey();
      onChange({ ...me, has_passkey: true });
      setMessage('Passkey angelegt. Ab jetzt kannst du dich ohne E-Mail anmelden.');
    });

  const invite = (groupId: string) =>
    run(async () => {
      const created = await api<InvitationCreated>(`/groups/${groupId}/invitations`, { method: 'POST', body: {} });
      setInvites((prev) => ({ ...prev, [groupId]: created }));
    });

  const createGroup = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const g = await api<GroupDetail>('/groups', { method: 'POST', body: { name: newGroup.trim() } });
      setNewGroup('');
      onRefresh();
      onOpenGroup(g.id);
    });
  };

  const restore = (g: DeletedGroup) =>
    run(async () => {
      await api(`/groups/${g.id}/restore`, { method: 'POST' });
      onRefresh();
      setMessage(`„${g.name}“ ist wiederhergestellt.`);
    });

  const share = async (url: string, group: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'TopStack', text: `Komm in unsere TopStack-Gruppe „${group}“:`, url });
        return;
      } catch {
        // abgebrochen: dann kopieren
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setMessage('Link kopiert.');
    } catch {
      setMessage('Link markieren und kopieren.');
    }
  };

  return (
    <main className="page">
      <header className="bar">
        <button className="btn ghost" onClick={onBack} aria-label="Zurück">
          ‹ Zurück
        </button>
        <h2>Profil</h2>
      </header>

      <form className="stack" onSubmit={save}>
        <label className="field">
          <span>Anzeigename</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required autoComplete="nickname" />
        </label>
        <div className="field">
          <span>Lieblingsfarben</span>
          <div className="swatches" role="group" aria-label="Lieblingsfarben">
            {MANA.map((c) => {
              const surface = choiceSurface(c);
              const on = colors.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  aria-label={choiceName(c)}
                  title={choiceName(c)}
                  className={on ? 'on' : ''}
                  style={{ background: surface.value, color: surface.tokens?.['--text'] ?? 'var(--text)' }}
                  onClick={() => setColors((prev) => toggleFavorite(prev, c))}
                >
                  {c}
                </button>
              );
            })}
          </div>
          <p className="muted small">{colors ? describeColors(colors) : 'Keine'}</p>
        </div>
        <button type="submit" className="btn primary big" disabled={busy || !dirty || !name.trim()}>
          Speichern
        </button>
      </form>

      <section className="stack">
        <h3>Anmeldung</h3>
        <p className="muted small">{me.email}</p>
        {me.has_passkey ? (
          <p className="small">Passkey eingerichtet ✓</p>
        ) : (
          passkeysSupported() && (
            <button className="btn" onClick={addPasskey} disabled={busy}>
              Passkey auf diesem Gerät anlegen
            </button>
          )
        )}
      </section>

      <AvatarPicker me={me} onChange={onChange} />

      <Notifications />

      <section className="stack">
        <h3>Gruppen</h3>
        {me.groups.length === 0 && <p className="muted small">Noch keine Gruppe. Lass dich von deiner Gruppe einladen oder leg unten eine an.</p>}
        <ul className="group-list">
          {me.groups.map((g) => (
            <li key={g.id}>
              <div className="group-head">
                <strong>{g.name}</strong>
                <span className="badge">{ROLES[g.role]}</span>
                {g.archived && <span className="badge">archiviert</span>}
                <button className="btn ghost small" onClick={() => onOpenGroup(g.id)} aria-label={`${g.name} verwalten`}>
                  Verwalten ›
                </button>
              </div>
              <GroupMembers groupId={g.id} groupName={g.name} />
              {g.role !== 'viewer' &&
                !g.archived &&
                (invites[g.id] ? (
                  <div className="stack">
                    <input readOnly value={invites[g.id].url} aria-label={`Einladungslink für ${g.name}`} onFocus={(e) => e.target.select()} />
                    <p className="muted small">
                      Gültig bis {new Date(invites[g.id].expires_at).toLocaleDateString('de-DE')} · für beliebig viele Freunde
                    </p>
                    <button className="btn" onClick={() => share(invites[g.id].url, g.name)}>
                      Link teilen
                    </button>
                  </div>
                ) : (
                  <button className="btn" onClick={() => invite(g.id)} disabled={busy}>
                    Einladungslink erstellen
                  </button>
                ))}
            </li>
          ))}
        </ul>
        <form className="stack" onSubmit={createGroup} aria-label="Neue Gruppe">
          <label className="field">
            <span>Neue Gruppe anlegen</span>
            <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} maxLength={60} placeholder="z. B. Freitagsrunde" />
          </label>
          <button type="submit" className="btn" disabled={busy || !newGroup.trim()}>
            Gruppe anlegen
          </button>
          <p className="muted small">Du wirst Admin und kannst Freunde einladen. Höchstens 5 eigene Gruppen.</p>
        </form>
        {deleted.length > 0 && (
          <div className="stack">
            <h3>Papierkorb</h3>
            <ul className="group-list">
              {deleted.map((g) => (
                <li key={g.id} className="group-head">
                  <span>
                    {g.name}
                    <span className="muted small"> · endgültig weg am {new Date(g.purge_on).toLocaleDateString('de-DE')}</span>
                  </span>
                  <button className="btn small" onClick={() => void restore(g)} disabled={busy}>
                    Wiederherstellen
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

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

      <button className="btn" onClick={onFeedback}>
        Feedback geben: Fehler oder Wunsch melden
      </button>

      <section className="stack">
        <h3>Hängt die App?</h3>
        <p className="muted small">Zeigt sie eine alte Version oder lädt nicht richtig, hilft Zurücksetzen. Spielstände und Anmeldung bleiben.</p>
        <ResetAppButton />
      </section>

      <button className="btn danger" onClick={onSignOut} disabled={busy}>
        Abmelden
      </button>
    </main>
  );
}
