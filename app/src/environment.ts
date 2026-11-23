/**
 * In welcher Umgebung läuft die App? Dasselbe Image läuft in Produktion (`topstack.win`) und
 * auf Staging (`beta.topstack.win`, AP-3b); den Unterschied meldet der Server in
 * `/api/v1/health` als `environment` (TOPSTACK_ENVIRONMENT). Der letzte Wert wird gemerkt,
 * damit das Beta-Band auch offline und ohne Flackern beim Start erscheint.
 */
const KEY = 'topstack.environment';

export function cachedEnvironment(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberEnvironment(env: string): void {
  try {
    localStorage.setItem(KEY, env);
  } catch {
    // ohne Speicher kommt das Band eben erst nach der Antwort des Servers
  }
}

export function isStaging(env: string): boolean {
  return env === 'staging';
}

/**
 * Auf Staging: Titel und Name für „Zum Home-Bildschirm“ auf dem iPhone (Safari liest die
 * Meta-Angaben beim Hinzufügen). Manifest und Icons tauscht Caddy auf Staging selbst aus.
 */
export function applyStagingDocument(doc: Document): void {
  doc.title = 'TopStack Beta';
  doc.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', 'TopStack Beta');
}
