#!/usr/bin/env bash
# Automatisches Deployment auf dem Heimserver (Phase 4, AP-3, ADR-0016).
#
# Läuft alle 5 Minuten per systemd-Timer (topstack-deploy.timer) und von Hand:
#   infra/ops/deploy.sh
# Ablauf: Repo und Images zum Kanal aus TOPSTACK_VERSION holen (main = jeder Merge,
# latest = letzte Release-Version, 1.2.3 = feste Version). Nur wenn sich etwas geändert hat:
# Backup, neuer Stand, auf die API warten. Antwortet sie nicht, zurück auf den alten Stand
# und diesen neuen Stand nicht noch einmal versuchen. Meldungen über ntfy (NTFY_URL).
#
# Deploy-Sperre für Spieleabende:  touch ~/topstack-state/deploy.lock   (aufheben: rm …)
set -euo pipefail

main() {
  INFRA=$(cd "$(dirname "$0")/.." && pwd)
  REPO=$(cd "$INFRA/.." && pwd)
  STATE=${DEPLOY_STATE_DIR:-$HOME/topstack-state}
  HEALTH_URL=${DEPLOY_HEALTH_URL:-http://127.0.0.1/api/v1/health}
  HEALTH_TIMEOUT=${DEPLOY_HEALTH_TIMEOUT:-120}
  mkdir -p "$STATE"
  cd "$INFRA"

  exec 9>"$STATE/deploy.flock"
  flock -n 9 || { log "Ein anderes Deployment läuft gerade."; return 0; }

  if [ -e "$STATE/deploy.lock" ]; then
    log "Deploy-Sperre aktiv ($STATE/deploy.lock), nichts zu tun."
    return 0
  fi

  CHANNEL=$(env_get TOPSTACK_VERSION latest)
  OWNER=$(env_get GITHUB_OWNER krauspeter)
  NTFY_URL=$(env_get NTFY_URL "")
  SERVICES=(api caddy)
  declare -A REF=(
    [api]="ghcr.io/$OWNER/topstack-api:$CHANNEL"
    [caddy]="ghcr.io/$OWNER/topstack-web:$CHANNEL"
  )

  local old_commit new_commit
  old_commit=$(git -C "$REPO" rev-parse HEAD)
  update_repo || return 1
  new_commit=$(git -C "$REPO" rev-parse HEAD)

  if [ "${DEPLOY_SKIP_PULL:-0}" != 1 ]; then
    # Nur die eigenen Images aus ghcr.io; Docker Hub begrenzt anonyme Abrufe (postgres, caddy usw.
    # bleiben auf ihrem Stand, bis sie von Hand mit "docker compose pull" aktualisiert werden)
    compose --profile ops pull --quiet api caddy backup || { notify "TopStack: Images konnten nicht geladen werden" warning "Kanal $CHANNEL"; return 1; }
  fi

  declare -A WANT=() RUN=()
  local svc changed=0
  for svc in "${SERVICES[@]}"; do
    WANT[$svc]=$(docker image inspect -f '{{.Id}}' "${REF[$svc]}" 2>/dev/null || true)
    RUN[$svc]=$(running_image "$svc")
    [ -n "${WANT[$svc]}" ] || { log "Image ${REF[$svc]} fehlt lokal."; return 1; }
    [ "${WANT[$svc]}" = "${RUN[$svc]}" ] || changed=1
  done
  [ "$old_commit" = "$new_commit" ] || changed=1
  if [ $changed = 0 ]; then
    log "Keine Änderung (Kanal $CHANNEL)."
    return 0
  fi

  local candidate="$new_commit ${WANT[api]} ${WANT[caddy]}"
  if [ -f "$STATE/bad" ] && [ "$(cat "$STATE/bad")" = "$candidate" ]; then
    log "Dieser Stand ist schon einmal gescheitert und wird übersprungen."
    [ "$old_commit" = "$new_commit" ] || git -C "$REPO" reset -q --hard "$old_commit"
    # Tags wieder auf die laufenden Images, damit ein späteres "docker compose up -d" nichts Kaputtes startet
    for svc in "${SERVICES[@]}"; do
      [ -z "${RUN[$svc]}" ] || docker tag "${RUN[$svc]}" "${REF[$svc]}"
    done
    return 0
  fi

  log "Neuer Stand: Commit ${new_commit:0:7}, API ${WANT[api]:7:12}, Web ${WANT[caddy]:7:12}"
  # Laufende Images festhalten: Nach dem Pull hängt an ihnen kein Name mehr, und sobald
  # "up -d" die Container ersetzt, würde Docker sie löschen. Der Rollback braucht sie aber.
  for svc in "${SERVICES[@]}"; do
    [ -z "${RUN[$svc]}" ] || docker tag "${RUN[$svc]}" "topstack-rollback/$svc:previous"
  done
  if ! "$INFRA/ops/backup.sh" backup pre-deploy; then
    notify "TopStack: Update abgebrochen" warning "Das Backup vor dem Update ist fehlgeschlagen. Nichts geändert."
    [ "$old_commit" = "$new_commit" ] || git -C "$REPO" reset -q --hard "$old_commit"
    return 1
  fi

  # Fehler beim Start entscheidet der Health-Check, nicht set -e
  compose up -d || log "docker compose up meldet einen Fehler"
  if wait_healthy; then
    local build
    build=$(curl -fsS -m 5 "$HEALTH_URL" | sed -n 's/.*"pr":"\([0-9]*\)".*/\1/p')
    log "Update eingespielt (Update #${build:-?})."
    notify "TopStack: Update #${build:-?} eingespielt" white_check_mark "Kanal $CHANNEL, Commit ${new_commit:0:7}"
    rm -f "$STATE/bad"
    return 0
  fi

  # --- Rollback --------------------------------------------------------------------
  log "Die API antwortet nicht. Zurück auf den vorherigen Stand."
  echo "$candidate" >"$STATE/bad"
  [ "$old_commit" = "$new_commit" ] || git -C "$REPO" reset -q --hard "$old_commit"
  for svc in "${SERVICES[@]}"; do
    [ -z "${RUN[$svc]}" ] || docker tag "topstack-rollback/$svc:previous" "${REF[$svc]}"
  done
  compose up -d || log "docker compose up meldet einen Fehler"
  if wait_healthy; then
    notify "TopStack: Update fehlgeschlagen, zurückgerollt" warning \
      "Der neue Stand (Commit ${new_commit:0:7}) hat nicht geantwortet. Der alte Stand läuft wieder; der neue wird nicht erneut versucht."
  else
    notify "TopStack: Update und Rollback fehlgeschlagen" rotating_light \
      "Vermutlich hat eine Migration die Datenbank verändert. Auf dem Heimserver: infra/ops/backup.sh list, dann infra/ops/restore.sh manual/<neuestes …-pre-deploy.dump>"
  fi
  return 1
}

log() { printf '%s %s\n' "$(date +%H:%M:%S)" "$*"; }

compose() { docker compose --env-file "$INFRA/.env" "$@"; }

env_get() {  # env_get <name> <standard>: Wert aus infra/.env
  local v
  v=$(sed -n "s/^$1=//p" "$INFRA/.env" | tail -n1)
  printf '%s' "${v:-$2}"
}

running_image() {  # Image-ID des laufenden Containers eines Dienstes, sonst leer
  local cid
  cid=$(compose ps -q "$1" 2>/dev/null | head -n1)
  [ -n "$cid" ] && docker inspect -f '{{.Image}}' "$cid" 2>/dev/null || true
}

update_repo() {
  [ "${DEPLOY_SKIP_GIT:-0}" != 1 ] || return 0
  if [ -n "$(git -C "$REPO" status --porcelain --untracked-files=no)" ]; then
    notify "TopStack: Update angehalten" warning "Im Repo auf dem Heimserver gibt es lokale Änderungen. Bitte prüfen: git -C $REPO status"
    return 1
  fi
  case "$CHANNEL" in
    main)
      git -C "$REPO" fetch -q origin main
      if [ "$(git -C "$REPO" rev-parse --abbrev-ref HEAD)" != main ]; then git -C "$REPO" checkout -q main; fi
      git -C "$REPO" merge -q --ff-only origin/main
      ;;
    latest)
      git -C "$REPO" fetch -q --tags origin
      local tag
      tag=$(git -C "$REPO" tag -l 'v*' --sort=-v:refname | head -n1)
      if [ -n "$tag" ]; then git -C "$REPO" checkout -q "$tag"; else log "Noch keine Release-Version, Repo bleibt."; fi
      ;;
    *)
      git -C "$REPO" fetch -q --tags origin
      git -C "$REPO" checkout -q "v$CHANNEL"
      ;;
  esac
}

wait_healthy() {
  local waited=0 cid running
  while [ $waited -lt "$HEALTH_TIMEOUT" ]; do
    cid=$(compose ps -q api 2>/dev/null | head -n1)
    running=$( [ -n "$cid" ] && docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null || echo false)
    if [ "$running" = true ] && curl -fsS -m 5 "$HEALTH_URL" 2>/dev/null | grep -q '"status":"ok"'; then
      return 0
    fi
    sleep 5
    waited=$((waited + 5))
  done
  return 1
}

notify() {  # notify <titel> <tag> <text>; ohne NTFY_URL nur ins Log
  log "$1: $3"
  [ -n "$NTFY_URL" ] || return 0
  # Dieselbe Meldung höchstens alle 6 Stunden, sonst kommt sie bei Dauerproblemen alle 5 Minuten
  local last="$STATE/last-notify"
  if [ -f "$last" ] && [ "$(cat "$last")" = "$1" ] && [ -n "$(find "$last" -mmin -360)" ]; then
    return 0
  fi
  printf '%s' "$1" >"$last"
  curl -fsS -m 10 -H "Title: $1" -H "Tags: $2" -d "$3" "$NTFY_URL" >/dev/null || log "ntfy nicht erreichbar"
}

main "$@"
exit $?
