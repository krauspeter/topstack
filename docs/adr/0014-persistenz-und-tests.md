# ADR-0014: Datenbankzugriff, Migrationen und Tests mit echtem PostgreSQL

- Status: vorgeschlagen
- Datum: 2026-11-18

## Kontext
ADR-0004 legt FastAPI, SQLAlchemy 2, Alembic und PostgreSQL 16 fest. Bisher gibt es nur `docs/schema.sql`, das die CI gegen PostgreSQL prüft, aber keine Modelle und keine Migration. Für Phase 3 muss klar sein, wie Code auf die Datenbank zugreift, wie sich das Schema weiterentwickelt und wie getestet wird.

## Entscheidung

**Aufbau im Server**

| Schicht | Ordner | Aufgabe |
| --- | --- | --- |
| Domäne | `topstack/domain/` | Reine Regeln ohne Datenbank (bestehend) |
| Modelle | `topstack/db/models.py` | SQLAlchemy-2-Modelle (`Mapped[...]`), eine Klasse pro Tabelle |
| Zugriff | `topstack/db/repo/` | Abfragen pro Bereich (Turniere, Matches, Ereignisse …), asynchron |
| Dienste | `topstack/services/` | Abläufe: lädt Daten, ruft Domänenlogik, schreibt in einer Transaktion |
| API | `topstack/api/` | FastAPI-Router, Pydantic-Schemas, Rechteprüfung |

Router rufen nur Dienste auf, Dienste nur Repositories und Domänenlogik. So bleibt die Domänenlogik ohne Datenbank testbar.

**Migrationen**
- Alembic mit asynchroner Engine. Die erste Migration erzeugt das Schema aus `docs/schema.sql` 1:1, inklusive Enums, Teilindex und Check-Constraints.
- Ab dann ist die Migrationskette die Wahrheit. `docs/schema.sql` wird mit `pg_dump --schema-only` aus einer migrierten Datenbank erzeugt und bleibt als lesbare Referenz im Repo.
- Die CI prüft, dass `alembic upgrade head` auf leerer Datenbank läuft und `alembic check` keine Abweichung zu den Modellen findet.
- Die API führt beim Start `alembic upgrade head` aus (ein Container, eine Instanz, daher unkritisch).

**Tests**
- Unit-Tests der Domäne wie bisher, ohne Datenbank.
- API- und Repository-Tests gegen echtes PostgreSQL 16: in der CI als Service-Container, lokal über `docker compose -f infra/docker-compose.yml up db`.
- Jeder Test läuft in einer Transaktion, die am Ende zurückgerollt wird; die Datenbank wird pro Testlauf einmal migriert.
- Testdaten über kleine Fabrikfunktionen (`make_group()`, `make_tournament(players=5)`), keine geteilten Fixtures mit festen IDs.
- End-to-End-Tests der App laufen weiter mit Playwright; ab AP-5 zusätzlich gegen einen API-Container mit Testdatenbank.

## Alternativen
- **SQLite für Tests:** schneller, aber Enums, Teilindizes, `jsonb` und Arrays verhalten sich anders. Verworfen, weil ADR-0004 bewusst auf „PostgreSQL direkt“ setzt.
- **SQLModel statt SQLAlchemy:** weniger Code, aber schwächer bei Enums, Arrays und asynchronen Abfragen.
- **Schema nur per `schema.sql` pflegen, ohne Alembic:** einfach am Anfang, aber keine sicheren Änderungen an einer laufenden Datenbank mit echten Turnierdaten.

## Folgen
- Neue Abhängigkeiten im Server: `pytest-asyncio`; Alembic und `asyncpg` sind schon eingetragen.
- Der CI-Job `server` braucht einen PostgreSQL-Service-Container, wie ihn der Job `schema` schon hat.
- Änderungen am Datenmodell laufen ab Phase 3 immer über eine neue Migration, nie über `schema.sql`.
