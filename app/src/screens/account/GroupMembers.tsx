import { useEffect, useState } from 'react';
import { api, errorText } from '../../api/client';
import type { GroupPlayer } from '../../api/types';
import { Avatar } from '../../Avatar';
import { PRESETS } from '../../domain/avatars';
import { PersonalLink } from './GroupLinks';

/**
 * Wer gehört zur Gruppe? Mitglieder mit Konto und vorgemerkte Spieler ohne Konto (ADR-0015),
 * dieselbe Liste wie beim Einladen zum Turnier. Gäste zählen nur im Turnier und fehlen hier.
 * Admins geben Spielern ohne Konto ein Profilbild aus der Vorauswahl (AP-15).
 */
export function GroupMembers({ groupId, groupName, canManage = false }: { groupId: string; groupName: string; canManage?: boolean }) {
  const [players, setPlayers] = useState<GroupPlayer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<GroupPlayer[]>(`/groups/${groupId}/players`)
      .then((rows) => active && setPlayers(rows))
      .catch((err: unknown) => active && setError(errorText(err)));
    return () => {
      active = false;
    };
  }, [groupId]);

  if (error) return <p className="muted small">Mitglieder konnten nicht geladen werden: {error}</p>;
  if (!players) return <p className="muted small">Mitglieder werden geladen …</p>;

  const setAvatar = async (p: GroupPlayer, preset: string | null) => {
    try {
      await api(`/groups/${groupId}/players/${p.id}/avatar`, { method: 'PUT', body: { preset } });
      setPlayers((list) => list?.map((x) => (x.id === p.id ? { ...x, avatar: preset ? `preset:${preset}` : null } : x)) ?? null);
      setPicking(null);
    } catch (err) {
      setError(errorText(err));
    }
  };

  const withoutAccount = players.filter((p) => p.kind === 'reserved').length;
  return (
    <div className="stack">
      <p className="muted small">
        {players.length === 1 ? '1 Spieler' : `${players.length} Spieler`}
        {withoutAccount > 0 && `, davon ${withoutAccount} ohne Konto`}
      </p>
      <ul className="member-list" aria-label={`Mitglieder von ${groupName}`}>
        {players.map((p) => (
          <li key={p.id}>
            <Avatar avatar={p.avatar} name={p.display_name} size={28} />
            <span>{p.display_name}</span>
            {p.is_me && <span className="muted small">du</span>}
            {p.kind === 'reserved' && <span className="muted small">ohne Konto</span>}
            {p.kind === 'reserved' && canManage && (
              <button className="btn ghost small" onClick={() => setPicking(picking === p.id ? null : p.id)} aria-label={`Bild für ${p.display_name}`}>
                Bild
              </button>
            )}
            {p.kind === 'reserved' && canManage && <PersonalLink groupId={groupId} player={p} />}
            {picking === p.id && (
              <div className="avatar-grid" role="group" aria-label={`Bild für ${p.display_name} wählen`}>
                {PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    className={p.avatar === `preset:${preset.key}` ? 'avatar-choice on' : 'avatar-choice'}
                    aria-label={preset.name}
                    onClick={() => void setAvatar(p, preset.key)}
                  >
                    <Avatar avatar={`preset:${preset.key}`} name={preset.name} size={44} />
                  </button>
                ))}
                {p.avatar && (
                  <button type="button" className="btn ghost small" onClick={() => void setAvatar(p, null)}>
                    Ohne Bild
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
