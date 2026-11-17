# TopStack

Selbst gehostete App für MTG-Spielgruppen: **Life-Tracker** im Spiel, **Draft-Turniere** mit Live-Verlauf und eine dauerhafte **Rangliste** – später mit eigenem **Steuergerät** (ESP32) als physischem Life-Counter und **KI-Auswertungen**.

[![CI](https://github.com/krauspeter/topstack/actions/workflows/ci.yml/badge.svg)](https://github.com/krauspeter/topstack/actions/workflows/ci.yml)

> Status: 🚧 Phase 1 – Architektur & Design (Nov 2026). Läuft auf dem [Heimserver](https://github.com/krauspeter/heimserver).

## Aufbau

| Ordner | Inhalt |
| --- | --- |
| [`app/`](app) | PWA – React, TypeScript, Vite, offline-fähig |
| [`server/`](server) | Backend – Python, FastAPI, PostgreSQL; Domänenlogik in `topstack/domain/` |
| [`firmware/`](firmware) | Steuergerät – ESP32, PlatformIO, Unity-Tests |
| [`infra/`](infra) | Docker Compose, Caddy, Mosquitto für den Heimserver |
| [`docs/`](docs) | [Architektur](docs/architektur.md), [Datenmodell](docs/datenmodell.md), [Schnittstellen](docs/schnittstellen.md), [ADRs](docs/adr) |
| [`scripts/`](scripts) | Hilfsskripte, z. B. Backlog als GitHub Issues anlegen |

## Lokal entwickeln

```bash
# Backend
cd server
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest
uvicorn topstack.main:app --reload      # http://localhost:8000/api/v1/docs

# App (zweites Terminal)
cd app
npm install
npm run dev                              # http://localhost:5173, /api wird an :8000 weitergeleitet

# Firmware-Logik ohne Hardware testen
cd firmware
pio test -e native
```

## Prüfen vor dem Push

```bash
pip install pre-commit
pre-commit install          # einmalig: richtet Commit- und Push-Hooks ein
bash scripts/push.sh        # pusht und zeigt den CI-Lauf live im Terminal
```

Beim Commit laufen Ruff-Checks, beim Push Tests, Typecheck und Build der geänderten Teile – wie in der CI. End-to-End-Tests, Schema-Check und Docker-Build laufen nur in der CI.

## Auf dem Heimserver starten

```bash
cd infra
cp .env.example .env                     # ausfüllen
docker run --rm -v "$PWD:/w" eclipse-mosquitto:2 mosquitto_passwd -c -b /w/mosquitto.passwd topstack-api <passwort>
docker compose up -d
```

## Lizenz

MIT – siehe [LICENSE](LICENSE).
