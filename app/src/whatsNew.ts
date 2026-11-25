/**
 * „Was ist neu“: kurze Hinweise auf Deutsch, die nach einem Update einmal erscheinen (AP-4).
 * Der ausführliche Changelog steht auf Englisch in CHANGELOG.md.
 *
 * Pro Version höchstens drei bis vier kurze Punkte, nur was die Spieler merken. Eine
 * Vorabversion wie 1.0.0-rc.1 nutzt den Eintrag ihrer Endversion (1.0.0), falls es keinen
 * eigenen gibt.
 */
export const WHATS_NEW: Record<string, string[]> = {
  '1.0.0': [
    'Turniere: Die Startseite zeigt dein laufendes Turnier, Gold ist immer dein nächster Schritt.',
    'Push: Im Profil aktivieren, dann meldet sich die App, wenn du dran bist.',
    'Feedback geben direkt aus der App, gern mit Screenshot.',
    '„Neues Match“ heißt jetzt „Freies Match“.',
  ],
  '0.9.0': [
    'Die App hat jetzt eine Versionsnummer, unten auf dem Startbildschirm.',
    'Updates kommen automatisch, nach jedem Update steht hier kurz, was neu ist.',
    'Eure Daten werden jede Nacht gesichert, auch außer Haus.',
  ],
};

const SEEN_KEY = 'topstack.seenVersion';

/** Einträge zu einer Version, bei Vorabversionen ersatzweise die der Endversion. */
export function whatsNewEntries(version: string): string[] {
  return WHATS_NEW[version] ?? WHATS_NEW[version.split('-')[0]] ?? [];
}

/**
 * Was soll beim Start angezeigt werden? Beim allerersten Start nichts (es gibt ja kein
 * Update), sonst einmal pro neuer Version, falls es Einträge gibt.
 */
export function pendingWhatsNew(version: string, seen: string | null): string[] {
  if (!version || seen === null || seen === version) return [];
  return whatsNewEntries(version);
}

/**
 * Liest die zuletzt gesehene Version und merkt sich beim ersten Aufruf die aktuelle.
 * Wer die App schon vor der Versionsanzeige genutzt hat (andere `topstack.*`-Einträge
 * vorhanden), bekommt '' zurück und sieht den Hinweis einmal; ganz neue Geräte nicht.
 */
export function readSeenVersion(version: string): string | null {
  try {
    const seen = localStorage.getItem(SEEN_KEY);
    if (seen !== null || !version) return seen;
    const usedBefore = Object.keys(localStorage).some((k) => k.startsWith('topstack.'));
    localStorage.setItem(SEEN_KEY, version);
    return usedBefore ? '' : null;
  } catch {
    return version; // ohne Speicher lieber nie anzeigen als bei jedem Start
  }
}

let startupSeen: string | null = null;

/** Beim App-Start aufrufen (main.tsx): hält fest, welche Version vorher zuletzt lief. */
export function rememberStartupVersion(version: string): void {
  startupSeen = readSeenVersion(version);
}

/** Die beim App-Start gemerkte Version, für den Startbildschirm. */
export function seenAtStartup(): string | null {
  return startupSeen;
}

export function markVersionSeen(version: string): void {
  startupSeen = version;
  try {
    localStorage.setItem(SEEN_KEY, version);
  } catch {
    // ohne Speicher zeigt readSeenVersion den Hinweis gar nicht erst an
  }
}
