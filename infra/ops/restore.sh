#!/usr/bin/env bash
# Ernstfall: ein Backup in die echte Datenbank zurückspielen. Überschreibt den aktuellen Stand!
#   infra/ops/restore.sh daily/topstack-20270105T023000Z-nightly.dump
# Der Pfad ist relativ zu BACKUP_DIR aus der .env. Vorhandene Backups: infra/ops/backup.sh list
set -euo pipefail
cd "$(dirname "$0")/.."
file=${1:-}
[ -n "$file" ] || { echo "Aufruf: $0 <stufe>/<datei>.dump   (Liste: infra/ops/backup.sh list)" >&2; exit 2; }
dir=$(sed -n 's/^BACKUP_DIR=//p' .env | tail -n1)
[ -f "$dir/$file" ] || { echo "Nicht gefunden: $dir/$file" >&2; exit 1; }

echo "Das überschreibt ALLE aktuellen Daten von TopStack mit dem Stand aus:"
echo "  $file"
read -r -p "Zum Fortfahren JA eingeben: " answer
[ "$answer" = "JA" ] || { echo "Abgebrochen."; exit 1; }

echo "1/4 Sicherheitskopie des aktuellen Stands"
ops/backup.sh backup manual || echo "   (Kopie nach R2 fehlgeschlagen, lokale Kopie liegt in $dir/manual)"
echo "2/4 API stoppen"
docker compose --env-file .env stop api
echo "3/4 Backup einspielen"
docker compose --env-file .env --profile ops run --rm -T backup restore "/backups/$file"
echo "4/4 API starten"
docker compose --env-file .env start api
sleep 5
curl -fsS http://127.0.0.1/api/v1/health && echo && echo "Fertig."
