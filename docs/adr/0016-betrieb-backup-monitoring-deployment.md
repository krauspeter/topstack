# ADR-0016: Backups, Monitoring und Deployment auf dem Heimserver

- Status: angenommen (21.11.2026)
- Datum: 2026-11-21

## Kontext
Ab v1.0 nutzt die ganze Gruppe TopStack, und die Rangliste soll über Jahre wachsen. Bis Phase 3 wird von Hand gesichert und von Hand per SSH aktualisiert, ein Ausfall fällt erst auf, wenn jemand die App öffnet. Gate G4 verlangt ein erfolgreich wiederhergestelltes Backup. Randbedingungen: ein einzelner Mini-PC (ADR-0007), kein offener Port nach außen, öffentliches Repo ohne Geheimnisse (ADR-0009), das Betriebssystem des Heimservers bleibt möglichst unverändert (E3 aus Phase 3), etwa 6 Stunden Zeit pro Woche.

## Entscheidung

**Backups (E1)**
- Täglich um 03:30 ein `pg_dump -Fc` über einen Wegwerf-Container `backup` (Image auf Basis von `postgres:16` mit `age` und `rclone`), gestartet von einem systemd-Timer auf dem Heimserver. Auf dem Host kommt nur der Timer dazu, keine Pakete.
- Zu jedem Backup eine kleine Manifest-Datei mit Zeitpunkt, Alembic-Version und Anzahl der Zeilen in den wichtigsten Tabellen.
- Lokal unter `~/topstack-backups/`, außer Haus in Cloudflare R2 (Bucket mit Speicherort EU). In R2 nur verschlüsselt mit `age`; der private Schlüssel liegt nicht auf dem Server.
- Aufbewahrung 7 täglich, 4 wöchentlich, 6 monatlich.
- Monatlich ein automatischer Wiederherstellungstest in einem Wegwerf-PostgreSQL, der das Ergebnis gegen das Manifest prüft und die Prüfsumme der Kopie in R2 vergleicht. Ob sich die R2-Kopie entschlüsseln lässt, kann der Server nicht prüfen, weil der private Schlüssel dort nicht liegt; das zeigt die Probe auf einem anderen Rechner (Windows-PC, geändert am 22.11.2026).

**Monitoring (E3)**
- Uptime Kuma auf dem Heimserver prüft App, API mit Datenbank, MQTT und das Zertifikat.
- healthchecks.io als Wächter von außen: Uptime Kuma, Backup und Wiederherstellungstest melden sich dort; bleibt ein Signal aus, kommt ein Alarm.
- Alarme als Push über ntfy, ohne Spielerdaten in den Nachrichten.

**Deployment (E2)**
- Die CI pusht Images mit Commit-SHA und `main` für jeden Merge, bei einem Tag `v*` zusätzlich die Versionsnummern und `latest`.
- Der Heimserver holt alle 5 Minuten per systemd-Timer (`infra/ops/deploy.sh`), was zu seinem Kanal passt (`main` in der Beta, `latest` ab v1.0). Nur bei neuen Digests: Backup, letzte gute Digests merken, `up -d`, auf die neue Version im Health-Check warten, sonst automatischer Rollback der Images und Alarm.
- Eine Sperrdatei verhindert Deployments während eines Spieleabends.

## Alternativen
- **Backup-Ziel OneDrive oder Backblaze B2:** OneDrive vermischt Server-Daten mit persönlichen Dateien und braucht einen OAuth-Token, der abläuft; B2 bräuchte ein weiteres Konto. R2 hängt am bestehenden Cloudflare-Konto und ist im Umfang kostenlos.
- **Backup auf den Ryzen-PC im Heimnetz:** schützt nicht vor Brand, Diebstahl oder Überspannung im selben Haus.
- **Watchtower:** aktualisiert Container ohne Backup vor der Migration und ohne Prüfung der neuen Version; das Projekt wird kaum noch gepflegt.
- **Self-hosted GitHub Runner auf dem Mini-PC:** Bei einem öffentlichen Repo könnte fremder Code aus Pull Requests auf dem Server laufen; außerdem ein weiterer Dienst mit Rechten auf Docker.
- **Push-Deployment per SSH aus der CI:** bräuchte einen Zugang von außen und einen SSH-Schlüssel in GitHub.
- **Nur Uptime Kuma:** meldet nichts, wenn der Mini-PC selbst ausfällt.
- **Alarm per E-Mail oder Discord:** E-Mail wird leicht übersehen, Discord-Webhooks landen in einem Kanal statt direkt auf dem Handy.

## Folgen
- Updates brauchen kein SSH mehr; ein Merge ist nach wenigen Minuten auf dem Heimserver.
- Die Daten der Gruppe überstehen auch einen Totalausfall des Mini-PCs, sofern der private `age`-Schlüssel sicher aufbewahrt ist.
- Drei externe Dienste mehr (R2, healthchecks.io, ntfy), alle im kostenlosen Umfang. Ihre Zugangsdaten gehören in den Passwort-Manager und in die `.env`, nie ins Repo.
- `latest` bedeutet ab Phase 4 „letzte Release-Version“ statt „letzter Stand von `main`“. Der Heimserver muss dafür in der Beta auf `TOPSTACK_VERSION=main` stehen.
- Ein Rollback setzt nur die Images zurück. Hat eine Migration die Datenbank verändert, ist zusätzlich das Backup vor dem Deployment nötig; das Skript macht das nur nach Bestätigung.
