import { useEffect, useState } from 'react';
import { api, errorText } from '../../api/client';
import type { GroupPlayer } from '../../api/types';
import { PersonalLink } from './GroupLinks';

/**
 * Wer gehört zur Gruppe? Mitglieder mit Konto und vorgemerkte Spieler ohne Konto (ADR-0015),
 * dieselbe Liste wie beim Einladen zum Turnier. Gäste zählen nur im Turnier und fehlen hier.
 */
export function GroupMembers({ groupId, groupName, canManage = false }: { groupId: string; groupName: string; canManage?: boolean }) {
  const [players, setPlayers] = useState<GroupPlayer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
            <span>{p.display_name}</span>
            {p.is_me && <span className="muted small">du</span>}
            {p.kind === 'reserved' && <span className="muted small">ohne Konto</span>}
            {p.kind === 'reserved' && canManage && <PersonalLink groupId={groupId} player={p} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
