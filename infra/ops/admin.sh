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
#   infra/ops/admin.sh seasons                       Saisons mit Zeitraum und Turnieren
#   infra/ops/admin.sh season-start "Saison 2027" 2026-12-01 --apply
#   infra/ops/admin.sh finish-tournament 3f2a1b7c --apply   hängendes Turnier abschließen
#   infra/ops/admin.sh deploy-lock on|off|status     Deploy-Sperre für den Spieleabend
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

# Deploy-Sperre: eine Datei im Zustandsordner von deploy.sh, kein Container nötig
if [ "${1:-}" = deploy-lock ]; then
  case "${stack:-prod}" in
    prod) state_default=$HOME/topstack-state ;;
    *) state_default=$HOME/topstack-beta-state ;;
  esac
  state=$(sed -n 's/^DEPLOY_STATE_DIR=//p' .env | tail -n1)
  lock="${state:-$state_default}/deploy.lock"
  case "${2:-status}" in
    on) mkdir -p "$(dirname "$lock")"; touch "$lock"; echo "Deploy-Sperre gesetzt ($lock): Es wird nichts eingespielt." ;;
    off) rm -f "$lock"; echo "Deploy-Sperre aufgehoben: Der nächste Lauf spielt wieder ein." ;;
    status) if [ -e "$lock" ]; then echo "Deploy-Sperre aktiv seit $(date -r "$lock" '+%d.%m.%Y %H:%M')."; else echo "Keine Deploy-Sperre."; fi ;;
    *) echo "Aufruf: infra/ops/admin.sh deploy-lock on|off|status" >&2; exit 2 ;;
  esac
  exit 0
fi

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
