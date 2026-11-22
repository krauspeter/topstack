#!/usr/bin/env bash
# Startet das Backup-Werkzeug (infra/backup) auf dem Heimserver. Aufruf aus beliebigem Ordner:
#   infra/ops/backup.sh backup manual     Backup von Hand
#   infra/ops/backup.sh restore-test      neuestes Backup in Wegwerf-Datenbank prüfen
#   infra/ops/backup.sh list              vorhandene Backups anzeigen
# Nachts ruft der systemd-Timer "backup nightly" auf (infra/ops/install-timers.sh).
set -euo pipefail
cd "$(dirname "$0")/.."
dir=$(sed -n 's/^BACKUP_DIR=//p' .env | tail -n1)
case "$dir" in
  /*) mkdir -p "$dir" && chmod 700 "$dir" ;;
  *) echo "BACKUP_DIR fehlt in infra/.env oder ist kein absoluter Pfad (z. B. /home/peter/topstack-backups)." >&2; exit 1 ;;
esac
exec docker compose --env-file .env --profile ops run --rm -T backup "$@"
