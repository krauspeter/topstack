import type { GroupMembership } from '../api/types';

/** Umschalter zwischen Gruppen (ADR-0018); erscheint erst ab zwei Gruppen. */
export function GroupSwitcher({
  groups,
  active,
  onSelect,
}: {
  groups: readonly GroupMembership[];
  active: GroupMembership | null;
  onSelect(id: string): void;
}) {
  if (groups.length < 2 || !active) return null;
  return (
    <label className="field group-switcher">
      <span className="muted small">Gruppe</span>
      <select value={active.id} onChange={(e) => onSelect(e.target.value)} aria-label="Gruppe wählen">
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
            {g.archived ? ' (archiviert)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
