import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../api/client';
import type { GroupPlayer, InvitationCreated, InvitationOut, MergeResult } from '../../api/types';

/** Link teilen (Handy) oder kopieren; gibt den Hinweis für die Anzeige zurück. */
export async function shareLink(url: string, text: string): Promise<string | null> {
  if (navigator.share) {
    try {
      await navigator.share({ title: 'TopStack', text, url });
      return null;
    } catch {
      // abgebrochen: dann kopieren
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'Link kopiert.';
  } catch {
    return 'Link markieren und kopieren.';
  }
}

const date = (iso: string) => new Date(iso).toLocaleDateString('de-DE');

/** Gruppenlinks: erzeugen (alle Mitglieder), offene Links ansehen und zurückziehen (Phase 5, AP-2). */
export function InviteLinks({ groupId, groupName }: { groupId: string; groupName: string }) {
  const [links, setLinks] = useState<InvitationOut[] | null>(null);
  const [created, setCreated] = useState<InvitationCreated | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<InvitationOut[]>(`/groups/${groupId}/invitations`)
      .then(setLinks)
      .catch((err: unknown) => setNote(errorText(err)));
  }, [groupId]);

  useEffect(load, [load]);

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setNote(null);
    try {
      await action();
    } catch (err) {
      setNote(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    act(async () => {
      setCreated(await api<InvitationCreated>(`/groups/${groupId}/invitations`, { method: 'POST', body: {} }));
      load();
    });

  const revoke = (id: string) =>
    act(async () => {
      await api(`/groups/${groupId}/invitations/${id}`, { method: 'DELETE' });
      if (created && links?.find((l) => l.id === id)?.mine) setCreated(null);
      load();
    });

  return (
    <section className="stack">
      <h3>Einladungslinks</h3>
      {created ? (
        <div className="stack">
          <input readOnly value={created.url} aria-label={`Neuer Einladungslink für ${groupName}`} onFocus={(e) => e.target.select()} />
          <p className="muted small">Gültig bis {date(created.expires_at)} · für beliebig viele Freunde</p>
          <button className="btn" onClick={() => void shareLink(created.url, `Komm in unsere TopStack-Gruppe „${groupName}“:`).then(setNote)}>
            Link teilen
          </button>
        </div>
      ) : (
        <button className="btn" onClick={() => void create()} disabled={busy}>
          Einladungslink erstellen
        </button>
      )}
      {links && links.length > 0 && (
        <ul className="member-list" aria-label="Offene Einladungslinks">
          {links.map((l) => (
            <li key={l.id}>
              <span className="small">
                {l.player_name ? `Persönlich für ${l.player_name}` : `Von ${l.mine ? 'dir' : (l.created_by ?? '?')}`} · bis {date(l.expires_at)} ·{' '}
                {l.uses}× genutzt
              </span>
              <button className="btn ghost small" onClick={() => void revoke(l.id)} disabled={busy} aria-label="Link zurückziehen">
                Zurückziehen
              </button>
            </li>
          ))}
        </ul>
      )}
      {note && <p className="muted small">{note}</p>}
    </section>
  );
}

/** Persönlicher Link für einen Spieler ohne Konto (ADR-0015); nur Admins. */
export function PersonalLink({ groupId, player }: { groupId: string; player: GroupPlayer }) {
  const [link, setLink] = useState<InvitationCreated | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const create = async () => {
    try {
      setLink(await api<InvitationCreated>(`/groups/${groupId}/invitations`, { method: 'POST', body: { player_id: player.id } }));
    } catch (err) {
      setNote(errorText(err));
    }
  };

  if (!link) {
    return (
      <>
        <button className="btn ghost small" onClick={() => void create()} aria-label={`Persönlicher Link für ${player.display_name}`}>
          Persönlicher Link
        </button>
        {note && <span className="warn small">{note}</span>}
      </>
    );
  }
  return (
    <span className="stack">
      <input readOnly value={link.url} aria-label={`Persönlicher Link für ${player.display_name}`} onFocus={(e) => e.target.select()} />
      <button
        className="btn small"
        onClick={() => void shareLink(link.url, `${player.display_name}, hier ist dein persönlicher TopStack-Link:`).then(setNote)}
      >
        Teilen
      </button>
      {note && <span className="muted small">{note}</span>}
    </span>
  );
}

const KIND: Record<GroupPlayer['kind'], string> = { member: 'mit Konto', reserved: 'ohne Konto', guest: 'Gast', former: 'ehemalig' };

/** Doppelte Spieler zusammenführen (Phase 5, AP-2): erst Vorschau, dann übernehmen. */
export function MergePlayers({ groupId, onMerged }: { groupId: string; onMerged(message: string): void }) {
  const [players, setPlayers] = useState<GroupPlayer[]>([]);
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [preview, setPreview] = useState<MergeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<GroupPlayer[]>(`/groups/${groupId}/players?all=true`)
      .then(setPlayers)
      .catch(() => setPlayers([]));
  }, [groupId]);
  useEffect(load, [load]);

  const send = async (apply: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<MergeResult>(`/groups/${groupId}/players/merge`, {
        method: 'POST',
        body: { source_id: source, target_id: target, apply },
      });
      if (apply) {
        setPreview(null);
        setSource('');
        setTarget('');
        load();
        onMerged(`${result.source} ist jetzt ${result.target}.`);
      } else {
        setPreview(result);
      }
    } catch (err) {
      setPreview(null);
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const label = (p: GroupPlayer) => `${p.display_name} (${KIND[p.kind]})`;
  const sources = players.filter((p) => p.kind !== 'member');

  if (sources.length === 0) return null;
  return (
    <section className="stack" aria-label="Spieler zusammenführen">
      <h3>Spieler zusammenführen</h3>
      <p className="muted small">Für doppelte Spieler, z. B. ein Gast, der jetzt ein Konto hat. Alle Ergebnisse wandern mit.</p>
      <label className="field">
        <span>Dieser Spieler …</span>
        <select
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setPreview(null);
          }}
        >
          <option value="">bitte wählen</option>
          {sources.map((p) => (
            <option key={p.id} value={p.id}>
              {label(p)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>… geht auf in</span>
        <select
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setPreview(null);
          }}
        >
          <option value="">bitte wählen</option>
          {players
            .filter((p) => p.id !== source)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {label(p)}
              </option>
            ))}
        </select>
      </label>
      {preview ? (
        <div className="card stack">
          <p className="small">
            {preview.source} geht in {preview.target} auf: {preview.tournaments} Turnier(e), {preview.matches} Match(es). Das lässt sich nicht
            rückgängig machen.
          </p>
          <button className="btn danger" onClick={() => void send(true)} disabled={busy}>
            Jetzt zusammenführen
          </button>
        </div>
      ) : (
        <button className="btn" onClick={() => void send(false)} disabled={busy || !source || !target}>
          Vorschau
        </button>
      )}
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
