#!/bin/sh
# Startet die API (Phase 3, AP-2): erst fehlende Migrationen einspielen (ADR-0014),
# dann uvicorn. Schlägt die Migration fehl, startet die API nicht.
set -e
echo "Datenbank-Migrationen: alembic upgrade head"
alembic upgrade head
exec "$@"
