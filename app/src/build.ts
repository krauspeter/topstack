/**
 * Welches Update läuft gerade? Die Version kommt aus package.json (gesetzt von
 * scripts/release.sh), die CI schreibt beim Image-Bau die Nummer des Pull Requests,
 * den Commit und die Uhrzeit hinein (BUILD_PR, BUILD_SHA, BUILD_TIME).
 */
declare const __BUILD__: BuildInfo;

export interface BuildInfo {
  version: string;
  pr: string;
  sha: string;
  time: string;
}

export const BUILD: BuildInfo = typeof __BUILD__ === 'undefined' ? { version: '', pr: '', sha: '', time: '' } : __BUILD__;

/** Zeit in deutscher Schreibweise und deutscher Zeitzone, z. B. „21.11.2026, 12:40“. */
export function buildTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Kurzer Text für den Startbildschirm, z. B. „v0.9.0 · Update #143 · 23.11.2026, 16:40“. */
export function buildLabel(b: BuildInfo): string {
  const name = b.pr ? `Update #${b.pr}` : b.sha ? `Stand ${b.sha}` : 'Entwicklungsstand';
  return [b.version && `v${b.version}`, name, buildTime(b.time)].filter(Boolean).join(' · ');
}
