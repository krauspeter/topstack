# ADR-0009: Öffentliches Repo unter MIT-Lizenz

- Status: angenommen
- Datum: 2026-11-15

## Kontext
TopStack ist Portfolio-Projekt für die Jobsuche.

## Entscheidung
- Repo ist öffentlich auf GitHub, Lizenz MIT.
- Keine Secrets im Repo: Konfiguration nur über `.env` (nicht eingecheckt) und `infra/.env.example`.
- Dependabot und Secret-Scanning in GitHub aktivieren.
- Keine echten Spielerdaten im Repo; Testdaten sind erfunden.

## Folgen
Recruiter sehen Code, Commits, ADRs und CI direkt. Sicherheitsfehler sind öffentlich sichtbar, daher Abhängigkeiten aktuell halten.
