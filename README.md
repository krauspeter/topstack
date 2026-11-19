# TopStack

Selbst gehostete App für MTG-Spielgruppen: **Life-Tracker** im Spiel, **Draft-Turniere** mit Live-Verlauf und eine dauerhafte **Rangliste** – später mit eigenem **Steuergerät** (ESP32) als physischem Life-Counter und **KI-Auswertungen**.

[![CI](https://github.com/krauspeter/topstack/actions/workflows/ci.yml/badge.svg)](https://github.com/krauspeter/topstack/actions/workflows/ci.yml)

> Status: ✅ Phase 2 – Offline-Life-Tracker abgeschlossen (18.11.2026) · 🚧 Phase 3 – Backend, Turniere & Rangliste in Planung ([Plan](docs/phase3/README.md)). Läuft auf dem [Heimserver](https://github.com/krauspeter/heimserver).

## Aufbau

| Ordner | Inhalt |
| --- | --- |
| [`app/`](app) | PWA – React, TypeScript, Vite, offline-fähig |
| [`server/`](server) | Backend – Python, FastAPI, PostgreSQL; Domänenlogik in `topstack/domain/` |
| [`firmware/`](firmware) | Steuergerät – ESP32, PlatformIO, Unity-Tests |
| [`infra/`](infra) | Docker Compose, Caddy, Mosquitto für den Heimserver |
| [`docs/`](docs) | [Architektur](docs/architektur.md), [Datenmodell](docs/datenmodell.md), [Schnittstellen](docs/schnittstellen.md), [ADRs](docs/adr), [Phase 3](docs/phase3/README.md) |
| [`scripts/`](scripts) | Hilfsskripte, z. B. Backlog als GitHub Issues anlegen |

## Lokal entwickeln

Schritt für Schritt testen, am PC und auf dem Handy: siehe [TESTEN.md](TESTEN.md).

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

Ausführliche Anleitung: [docs/phase3/heimserver.md](docs/phase3/heimserver.md). Kurzfassung auf dem Heimserver:

```bash
cd infra
cp .env.example .env                     # ausfüllen (Datenbank-Passwort, Tunnel-Token)
docker compose --env-file .env pull      # Images topstack-web und topstack-api aus ghcr.io
docker compose --env-file .env up -d     # die API spielt Migrationen beim Start ein
```

## Lizenz

MIT – siehe [LICENSE](LICENSE).
