#!/usr/bin/env bash
# Richtet die systemd-Timer ein (auf dem Heimserver, braucht sudo; mehrfach aufrufbar).
# Produktion (Klon ~/topstack, TOPSTACK_STACK fehlt oder prod in infra/.env):
#   topstack-backup.timer        täglich 03:30   infra/ops/backup.sh backup nightly
#   topstack-restore-test.timer  am 1. um 04:30  infra/ops/backup.sh restore-test
#   topstack-deploy.timer        alle 5 Minuten  infra/ops/deploy.sh (AP-3)
# Staging (Klon ~/topstack-beta, TOPSTACK_STACK=staging in infra/.env, AP-3b):
#   topstack-beta-deploy.timer   alle 5 Minuten  infra/ops/deploy.sh dieses Klons
# Die Dienste laufen als der Benutzer, der dieses Skript aufruft (muss in der Gruppe docker sein).
set -euo pipefail
repo=$(cd "$(dirname "$0")/../.." && pwd)
user=$(id -un)
id -nG "$user" | grep -qw docker || { echo "$user ist nicht in der Gruppe docker." >&2; exit 1; }
stack=$(sed -n 's/^TOPSTACK_STACK=//p' "$repo/infra/.env" 2>/dev/null | tail -n1)
case "${stack:-prod}" in
  prod)    units=("$repo"/infra/ops/systemd/*.service "$repo"/infra/ops/systemd/*.timer)
           timers=(topstack-backup.timer topstack-restore-test.timer topstack-deploy.timer) ;;
  staging) units=("$repo"/infra/ops/systemd/staging/*.service "$repo"/infra/ops/systemd/staging/*.timer)
           timers=(topstack-beta-deploy.timer) ;;
  *) echo "Unbekannter TOPSTACK_STACK=$stack in infra/.env (prod oder staging)." >&2; exit 1 ;;
esac
for unit in "${units[@]}"; do
  name=$(basename "$unit")
  sed -e "s|@REPO@|$repo|g" -e "s|@USER@|$user|g" "$unit" | sudo tee "/etc/systemd/system/$name" >/dev/null
  echo "installiert: $name"
done
sudo systemctl daemon-reload
sudo systemctl enable --now "${timers[@]}"
systemctl list-timers 'topstack-*'
