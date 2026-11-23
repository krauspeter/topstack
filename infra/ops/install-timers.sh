#!/usr/bin/env bash
# Richtet die systemd-Timer ein (auf dem Heimserver, braucht sudo; mehrfach aufrufbar):
#   topstack-backup.timer        täglich 03:30   infra/ops/backup.sh backup nightly
#   topstack-restore-test.timer  am 1. um 04:30  infra/ops/backup.sh restore-test
#   topstack-deploy.timer        alle 5 Minuten  infra/ops/deploy.sh (AP-3)
# Die Dienste laufen als der Benutzer, der dieses Skript aufruft (muss in der Gruppe docker sein).
set -euo pipefail
repo=$(cd "$(dirname "$0")/../.." && pwd)
user=$(id -un)
id -nG "$user" | grep -qw docker || { echo "$user ist nicht in der Gruppe docker." >&2; exit 1; }
for unit in "$repo"/infra/ops/systemd/*; do
  name=$(basename "$unit")
  sed -e "s|@REPO@|$repo|g" -e "s|@USER@|$user|g" "$unit" | sudo tee "/etc/systemd/system/$name" >/dev/null
  echo "installiert: $name"
done
sudo systemctl daemon-reload
sudo systemctl enable --now topstack-backup.timer topstack-restore-test.timer topstack-deploy.timer
systemctl list-timers 'topstack-*'
