# ADR-0004: Backend mit FastAPI und PostgreSQL

- Status: angenommen
- Datum: 2026-11-15

## Kontext
Das Backend ist schlank, muss gut testbar sein und später zum KI-Teil (Python) passen.

## Entscheidung
- Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2 (async), Alembic für Migrationen.
- PostgreSQL 16 von Anfang an, kein SQLite-Zwischenschritt.
- Domänenlogik (Spielplan, Tabelle, Tiebreaker, Punkte, später Elo) als reines Python in `topstack/domain/`, ohne Abhängigkeit zu FastAPI oder Datenbank.
- Lint und Format mit Ruff, Tests mit pytest.

## Alternativen
- SQLite zum Start: einfacher, aber späterer Umzug und keine echten Constraints/JSONB.
- Node/NestJS: eine Sprache mit dem Frontend, aber schlechter für den KI-Teil.

## Folgen
Postgres läuft ohnehin im Docker Compose. Die OpenAPI-Doku entsteht automatisch.
