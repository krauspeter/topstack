# TopStack – Anleitung für Claude Code

TopStack ist eine selbst gehostete App für eine Magic-the-Gathering-Spielgruppe: Life-Tracker im Spiel (offline-fähige PWA), Draft-Turniere mit Live-Ansicht und eine dauerhafte Rangliste. Später kommen weitere Formate, KI und ein eigenes Steuergerät (ESP32) dazu. Das Repo ist öffentlich und Teil von Peters Portfolio.

Stand dieser Datei: 27.11.2026. **v1.0.1 läuft in der Produktion, Phase 4 ist abgeschlossen. Phase 5 (v1.1: Gruppen & Altdaten) läuft ab 28.11.2026, Plan in [`docs/phase5/README.md`](docs/phase5/README.md).** Plan, Anforderungen und alle Festlegungen für die kommenden Phasen stehen in [`docs/roadmap.md`](docs/roadmap.md).

## Mit wem du arbeitest

Peter ist Product Owner, Entwickler und Betreiber in einer Person. Er hat einen Hintergrund in Maschinenbau und Embedded-Software (Automotive), ist aber neu bei GitHub, Web-Entwicklung und Betrieb.

- **Sprache:** Mit Peter Deutsch. Code-Kommentare, Doku, UI-Texte und PR-Beschreibungen auf Deutsch. **Commit-Nachrichten auf Englisch**, immer mit Beschreibung (Betreffzeile plus Absatz, was und warum), nie nur eine Zeile.
- **Wo läuft ein Befehl?** Bei jedem Befehl, den Peter ausführen soll, dazusagen, ob er auf dem **PC** (Git Bash unter Windows, Repo unter `/d/OneDrive/Projekte/git/Projects/topstack`) oder auf dem **Heimserver** (per SSH, `peter@heimserver`) läuft, und in welchem Ordner.
- **Befehle einzeln:** Peter kopiert Befehle ins Terminal. Lange Blöcke einzeln geben, nie mehrere Befehle für `nano` oder interaktive Programme in einem Block.
- **GitHub Schritt für Schritt:** PRs mergen, Actions ansehen, Releases: genau erklären, wo man klickt.
- **PR-Beschreibung:** immer mit dem Abschnitt „Nach dem Einspielen“, der sagt, welche Version und Update-Nummer die App danach unten auf dem Startbildschirm zeigt (z. B. „v1.0.1 · Update #166“). Die Update-Nummer ist die Nummer des PRs, aus dem das Image stammt.
- **Anforderungen vor dem Bauen klären**, wenn etwas mehrdeutig ist, gern als kurze Multiple-Choice-Fragen. Peter entscheidet, du schlägst vor.
- **Entscheidungen festhalten:** mit Datum im Plan der Phase (`docs/phase<N>/README.md`) und, wenn sie die Architektur betreffen, als ADR in `docs/adr/`.

## Was nie passieren darf

- **Keine Secrets** in Repo, Commits, Issues, PRs oder im Chat: `.env`-Inhalte, API-Schlüssel (Resend, VAPID, GitHub-Token), R2-Zugangsdaten, Ping-URLs von healthchecks.io, das ntfy-Topic. Peter trägt solche Werte selbst in die `.env` auf dem Heimserver ein. Bittet er dich, einen Wert zu lesen oder zu zeigen, sag, dass er ihn selbst eintragen soll.
- **Der private `age`-Schlüssel (AGE-SECRET-KEY) kommt nie auf den Heimserver und nie in den Chat.** Er liegt nur in Peters Passwort-Manager; der Heimserver hat nur den öffentlichen Schlüssel (ADR-0016).
- **Nicht direkt auf `main` pushen und nie von Hand mergen** (`gh pr merge` bleibt gesperrt). Immer Branch → Pull Request → grüne CI → Merge. **Auto-Merge (Entscheidung vom 27.11.2026):** Für jeden PR schaltest du Auto-Merge über die App ein. Die Pflicht-Checks auf `main` sorgen dafür, dass GitHub erst bei grüner CI mergt. Ist ein Check rot, behebst du den Fehler.
- **Die Produktion nicht von Hand ändern.** Sie folgt dem Kanal `latest` und bekommt nur Releases (siehe unten).
- Keine Daten echter Mitspieler in Tests, Screenshots oder Doku; dort nur erfundene Namen (Anna, Ben, Chris, Dana, …).

## Aufbau des Repos

| Ordner | Inhalt |
| --- | --- |
| `app/` | PWA: React 18, TypeScript, Vite, vite-plugin-pwa, Dexie (IndexedDB), Vitest, Playwright. Fachlogik ohne React in `app/src/domain/`, Bildschirme in `app/src/screens/`, API-Typen in `app/src/api/types.ts`, „Was ist neu“ in `app/src/whatsNew.ts` |
| `server/` | API: Python 3.12, FastAPI, SQLAlchemy 2 (async), Alembic, pytest, Ruff. Fachlogik ohne Framework in `server/topstack/domain/`, Abläufe in `services/`, HTTP in `api/`, Modelle in `db/models.py`, Migrationen in `server/migrations/versions/` (aktuell bis `0004`), Betreiber-Skripte in `topstack/scripts/` |
| `infra/` | Docker Compose (`docker-compose.yml` Produktion, `docker-compose.staging.yml` Beta), Caddy, Backup-Image, Betriebsskripte in `infra/ops/` (`deploy.sh`, `backup.sh`, `restore.sh`, `admin.sh`, `install-timers.sh`) |
| `firmware/` | ESP32-Grundgerüst (PlatformIO, Unity-Tests) für v3.0 |
| `docs/` | `roadmap.md`, Pläne je Phase (`phase3/`, `phase4/`), ADRs (`adr/`), `architektur.md`, `datenmodell.md`, `schnittstellen.md`, `schema.sql` (muss zur migrierten Datenbank passen, die CI vergleicht) |
| `scripts/` | `release.sh`, `check-version.sh`, `stage.sh`, `push.sh`, Backlog (`backlog.tsv`, `create-backlog-issues.sh`) |

Wichtige Grundsätze (Details in den ADRs):

- **Lebenspunkte sind Ereignisse** (UUIDv7, Geräte-ID, `seq`), nie nur ein Endstand; jedes Handy zählt nur den eigenen Spieler (ADR-0005, ADR-0012).
- **Offline zuerst:** Der Life-Tracker muss ohne Server laufen (N-01).
- **Mehrgruppenfähiges Datenmodell** seit v1.0 (ADR-0010), Spieler ohne Konto (ADR-0015).
- **Turnier-Zustände und Rechte** zentral in `server/topstack/domain/tournament.py` (ADR-0013).
- **Design „Dunkel & Gold“** (ADR-0011): Gold markiert genau einen nächsten Schritt pro Bildschirm. Kontrast mindestens 4,5:1. Farben als Tokens in `app/src/styles.css` und `app/src/theme.ts`.
- **Live** per WebSocket `/ws` mit Themen `tournament:<id>` und `game:<id>` (ADR-0006).

## Lokal prüfen (PC)

App (in `app/`):

```bash
npm ci
npm run typecheck
npm run lint
npm test                 # Vitest
npm run test:e2e         # Playwright, Android- und iPhone-Emulation
npm run dev -- --host    # App unter http://localhost:5173, auch fürs Handy im WLAN
```

Server (in `server/`): Ruff läuft immer, die Tests brauchen PostgreSQL 16, sonst werden sie übersprungen.

```bash
ruff check . && ruff format --check .
docker run -d --name topstack-test-db -e POSTGRES_USER=topstack -e POSTGRES_PASSWORD=test -e POSTGRES_DB=topstack_test -p 5432:5432 postgres:16
export TOPSTACK_TEST_DATABASE_URL=postgresql+asyncpg://topstack:test@localhost:5432/topstack_test
pytest
```

Die CI (`.github/workflows/ci.yml`) prüft alles vollständig: App, Server gegen PostgreSQL, Schema-Vergleich, Firmware, einen Smoke-Test des ganzen Stacks mit Backup, Rollback und Staging, und baut die Images. Kann etwas lokal nicht laufen, sag das und verlass dich auf die CI. **Erst wenn die CI grün ist, ist ein PR fertig.** `bash scripts/push.sh` pusht und zeigt den CI-Lauf im Terminal.

Neue Bildschirme oder Abläufe bekommen Unit-Tests für die Logik und einen E2E-Test. Server-Änderungen bekommen Tests in `server/tests/` (API-Tests in `tests/api/`). Datenbankänderungen nur per Alembic-Migration und mit angepasstem `docs/schema.sql`.

## Arbeitsablauf für eine Änderung

1. Branch von aktuellem `main`: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
2. Ändern, Tests schreiben, lokal prüfen.
3. **CHANGELOG.md:** Eintrag unter `## [Unreleased]` in der passenden Rubrik (Added, Changed, Fixed, Known limitations), auf Englisch, mit der PR-Nummer `(#N)`. Die nächste PR-Nummer ist die höchste Nummer aus Issues und PRs plus 1: `gh api "repos/krauspeter/topstack/issues?state=all&per_page=1" --jq '.[0].number'`.
4. Commit auf Englisch mit Beschreibung, am Ende:
   ```
   Co-Authored-By: Claude <noreply@anthropic.com>
   ```
5. Push, PR mit deutscher Beschreibung: „Worum geht es“, „Änderungen“, „Tests“, „Auf Staging ansehen“ (wenn sinnvoll), „Changelog“, „Nach dem Einspielen“ mit Version und Update-Nummer.
6. Auto-Merge einschalten. Ist die CI rot, Fehler beheben und neu pushen; ist sie grün, mergt GitHub von selbst. Danach lokal `git switch main && git pull --ff-only`.

## Umgebungen und Kanäle

Auf dem Heimserver (Beelink Mini-PC, Debian, Docker) laufen zwei getrennte Stacks mit eigener Datenbank. Ein systemd-Timer startet alle 5 Minuten `infra/ops/deploy.sh`, holt das Image des eingestellten Kanals aus ghcr.io, macht vorher ein Backup und rollt bei Fehlern zurück.

| Umgebung | Adresse | Ordner auf dem Heimserver | Kanal (`TOPSTACK_VERSION` in `infra/.env`) |
| --- | --- | --- | --- |
| Produktion | `topstack.win` | `~/topstack` | `latest`: nur Releases |
| Staging (Beta) | `beta.topstack.win` | `~/topstack-beta` | `main`: jeder Merge; mit `bash scripts/stage.sh <PR>` (PC, im Repo; verbindet sich per SSH mit dem Heimserver; `status` zeigt den Stand) vorübergehend ein offener PR (`pr-<N>`), danach springt es von selbst zurück |

Beta liegt hinter Cloudflare Access (nur freigeschaltete Mails), hat eine eigene Testgruppe, schickt keine Push-Nachrichten und Magic-Links nur an eine Allowlist. Auf beiden Servern holt `deploy.sh` den Repo-Stand selbst; ein `git pull` ist dort nicht nötig (die Produktion steht fest auf dem Release-Tag).

Images: `ghcr.io/krauspeter/topstack-api`, `topstack-web`, `topstack-backup`. Labels: `pr-<N>` (Pull Request), `main` (jeder Merge), `X.Y.Z`, `X.Y` und `latest` (Release, nur neu benannt, nicht neu gebaut; Vorabversionen wie `1.0.0-rc.1` bekommen nie `latest`).

## Release

Wenn auf Beta genug zusammengekommen ist und Peter ein Release möchte:

1. Auf aktuellem `main`: `bash scripts/release.sh X.Y.Z` (PC). Das setzt die Version in `app/package.json`, `app/package-lock.json`, `server/pyproject.toml` und `server/topstack/__init__.py`, macht aus „Unreleased“ den Abschnitt `## [X.Y.Z] - Datum` und legt den Branch `release/vX.Y.Z` an. `bash scripts/check-version.sh` prüft, dass alle Versionen gleich sind.
2. „Was ist neu“ für die Version in `app/src/whatsNew.ts` ergänzen: 2–4 kurze Sätze auf Deutsch für die Mitspieler.
3. PR „chore: release vX.Y.Z“. Nach Peters Merge setzt `.github/workflows/release.yml` das Tag, benennt die getesteten Images um und legt den GitHub-Release aus dem CHANGELOG an. Die Produktion holt die Version innerhalb von 5 Minuten selbst.

Semantic Versioning: Fehlerbehebungen `1.0.x`, neue Funktionen der nächsten Version `1.x.0` (v1.1 Gruppen & Altdaten, v1.2 Terminumfrage, …). Für größere Releases vorher ein Release-Kandidat `X.Y.Z-rc.1` auf Beta.

## Betrieb (Heimserver, nur über Peter)

Diese Befehle führt Peter per SSH auf dem Heimserver aus; du erklärst sie nur.

```bash
infra/ops/admin.sh players | tournaments | seasons
infra/ops/admin.sh delete-player <Name> [--apply]        # nur Spieler ohne Konto, nicht wenn in einem Turnier
infra/ops/admin.sh delete-tournament <ID-Anfang> [--apply]
infra/ops/admin.sh finish-tournament <ID-Anfang> [--apply]
infra/ops/admin.sh season-start "<Saison>" JJJJ-MM-TT [--apply]
infra/ops/admin.sh merge-player <von> <nach> [--apply]   # Gast, Vorgemerkten oder Ehemaligen übernehmen
infra/ops/admin.sh invite-link <Spieler> [--days N]
infra/ops/admin.sh deploy-lock on|off|status            # z. B. am Spieleabend
infra/ops/backup.sh list | backup manual
infra/ops/restore.sh <Backup>
```

Ohne `--apply` zeigt `admin.sh` nur, was passieren würde; mit `--apply` macht es vorher ein Backup. Backups: nachts 03:30, Aufbewahrung 7 Tage / 4 Wochen / 6 Monate, verschlüsselte Kopie in Cloudflare R2, monatlicher Wiederherstellungstest. Monitoring: Uptime Kuma auf dem Heimserver, healthchecks.io von außen, Alarme per ntfy. Ausführlich: [`docs/phase3/heimserver.md`](docs/phase3/heimserver.md), [ADR-0016](docs/adr/0016-betrieb-backup-monitoring-deployment.md), [ADR-0017](docs/adr/0017-staging.md).

## Eine neue Phase beginnen

Kurzbefehl: `/phase <Nummer>` (in `.claude/commands/phase.md`). Für Releases gibt es `/release X.Y.Z`.

Jede Phase hatte bisher denselben Ablauf; halte ihn ein:

1. Den Abschnitt der Phase in [`docs/roadmap.md`](docs/roadmap.md) lesen: Inhalt, Festlegungen aus den Befragungen, Gate.
2. Offene Fragen mit Peter klären (kurze Multiple-Choice-Fragen), Entscheidungen mit Datum festhalten.
3. Plan als `docs/phase<N>/README.md` anlegen, nach dem Vorbild von [`docs/phase4/README.md`](docs/phase4/README.md): Ziel und Gate, Arbeitspakete (AP-0, AP-1, …) mit Schätzung, Anforderungen und Aufgaben als Checklisten, Testfälle mit fortlaufender Nummer (Phase 5 endet bei TC-162), Entscheidungen. Architekturentscheidungen als neue ADR (nächste Nummer: 0020).
4. Die Arbeitspakete einzeln umsetzen, je ein oder mehrere PRs, und nach jedem PR den Plan abhaken.
5. Am Ende Gate abnehmen, Release machen, Roadmap und Plan auf „abgeschlossen“ setzen.

Noch offen aus früheren Phasen: das Backlog-Skript (`scripts/backlog.tsv`, `scripts/create-backlog-issues.sh`) muss vor dem Ausführen an den Versionsplan vom 22.11.2026 angepasst werden; und die Punkte unter „Nach Phase 4“ im [Phase-4-Plan](docs/phase4/README.md) (Draftabend 27.12.2026, Push im echten Turnier, iPhone-Test).
