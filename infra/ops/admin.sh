#!/usr/bin/env bash
# shellcheck disable=SC1111  # deutsche Anführungszeichen „…“ in Meldungen sind gewollt
# Superuser-Werkzeug auf dem Heimserver (Phase 4): Spieler und Turniere aufräumen,
# persönliche Einladungslinks. Ruft topstack.scripts.admin im API-Container auf.
#   infra/ops/admin.sh players                      Spieler je Gruppe
#   infra/ops/admin.sh tournaments                  Turniere je Gruppe
#   infra/ops/admin.sh delete-player Ben            zeigt nur, was passieren würde
#   infra/ops/admin.sh delete-player Ben --apply    löscht, vorher Backup
#   infra/ops/admin.sh delete-tournament 3f2a1b7c --apply
#   infra/ops/admin.sh invite-link Andreas
# Vor jedem --apply legt das Skript in der Produktion ein Backup an (Name …-pre-admin.dump) und
# bricht ab, wenn das nicht klappt. Auf Staging (TOPSTACK_STACK=staging) gibt es kein Backup.
set -euo pipefail
cd "$(dirname "$0")/.."

stack=$(sed -n 's/^TOPSTACK_STACK=//p' .env | tail -n1)
case "${stack:-prod}" in
  prod) compose_file=docker-compose.yml ;;
  staging) compose_file=docker-compose.staging.yml ;;
  *) echo "Unbekannter TOPSTACK_STACK=$stack (prod oder staging)." >&2; exit 1 ;;
esac

apply=0
for arg in "$@"; do
  [ "$arg" = --apply ] && apply=1
done

if [ "$apply" = 1 ] && [ "${stack:-prod}" = prod ]; then
  echo "Backup vor der Änderung …"
  if ! ops/backup.sh backup pre-admin; then
    echo "✗ Backup fehlgeschlagen, nichts geändert." >&2
    exit 1
  fi
fi

tty=()
[ -t 0 ] && [ -t 1 ] || tty=(-T)
exec docker compose --env-file .env -f "$compose_file" exec "${tty[@]}" api python -m topstack.scripts.admin "$@"
