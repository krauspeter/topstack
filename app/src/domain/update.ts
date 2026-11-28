/**
 * Stabile Updates (Phase 5, AP-14, ADR-0021): Ist der Server neuer als diese App?
 *
 * Verglichen werden die Update-Nummern (Nummer des Pull Requests, aus dem das Image stammt).
 * Nur „Server neuer“ zählt: Während eines Deployments kann die App kurz neuer sein als die API,
 * und lokal (Entwicklung) fehlt die Nummer ganz.
 */
export function newerOnServer(app: string, server: string | null | undefined): boolean {
  if (!server || !/^\d+$/.test(app) || !/^\d+$/.test(server)) return false;
  return Number(server) > Number(app);
}

/** Wie oft die App nach einem neuen Stand fragt: beim Öffnen, beim Zurückkehren und alle 30 Minuten. */
export const CHECK_INTERVAL_MS = 30 * 60 * 1000;

const RELOAD_KEY = 'topstack.updateReloadFor';

/**
 * Wurde für diese Server-Nummer schon einmal neu geladen? Dann hat das Neuladen nicht geholfen
 * (Zwischenspeicher hängt), und die App bietet „App zurücksetzen“ an.
 */
export function alreadyReloadedFor(server: string, storage: Pick<Storage, 'getItem'> | null = safeSession()): boolean {
  try {
    return storage?.getItem(RELOAD_KEY) === server;
  } catch {
    return false;
  }
}

export function markReloadFor(server: string, storage: Pick<Storage, 'setItem'> | null = safeSession()): void {
  try {
    storage?.setItem(RELOAD_KEY, server);
  } catch {
    // ohne Speicher wird beim nächsten Mal eben wieder zuerst neu geladen
  }
}

function safeSession(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
