import { useCallback, useEffect, useState } from 'react';
import type { GroupMembership } from '../api/types';
import { pickActiveGroup } from '../domain/activeGroup';

/** Zuletzt genutzte Gruppe pro Gerät (ADR-0018). Ohne Speicher (privates Fenster) gilt die erste. */
const KEY = 'topstack.activeGroup';
const EVENT = 'topstack:active-group';

function readStored(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function storeActiveGroup(id: string): void {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // Speicher gesperrt: Auswahl gilt nur bis zum Neuladen
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
}

/** Aktive Gruppe und Umschalter; alle Bildschirme folgen derselben Auswahl. */
export function useActiveGroup(groups: readonly GroupMembership[]): [GroupMembership | null, (id: string) => void] {
  const [stored, setStored] = useState<string | null>(readStored);

  useEffect(() => {
    const onChange = (e: Event) => setStored((e as CustomEvent<string>).detail);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  const select = useCallback((id: string) => {
    setStored(id);
    storeActiveGroup(id);
  }, []);

  return [pickActiveGroup(groups, stored), select];
}
