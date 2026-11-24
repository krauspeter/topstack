#!/usr/bin/env bash
# Automatisches Deployment auf dem Heimserver (Phase 4, AP-3, ADR-0016).
#
# Läuft alle 5 Minuten per systemd-Timer (topstack-deploy.timer) und von Hand:
#   infra/ops/deploy.sh
# Ablauf: Repo und Images zum Kanal aus TOPSTACK_VERSION holen (main = jeder Merge,
# latest = letzte Release-Version, 1.2.3 = feste Version, pr-<Nummer> = Stand eines Pull
# Requests, nur Staging). Nur wenn sich etwas geändert hat:
# Backup, neuer Stand, auf die API warten. Antwortet sie nicht, zurück auf den alten Stand
# und diesen neuen Stand nicht noch einmal versuchen. Meldungen über ntfy (NTFY_URL).
#
# Deploy-Sperre für Spieleabende:  touch ~/topstack-state/deploy.lock   (aufheben: rm …)
#
# Staging (AP-3b): derselbe Ablauf in einem zweiten Klon (~/topstack-beta) mit
# TOPSTACK_STACK=staging in dessen infra/.env: docker-compose.staging.yml, Zustand in
# ~/topstack-beta-state, Health-Check über 127.0.0.1:8081, kein Backup vorher. Ein
# pr-<Nummer>-Kanal springt nach Merge oder Schließen des Pull Requests von selbst auf main.
set -euo pipefail

main() {
  INFRA=$(cd "$(dirname "$0")/.." && pwd)
  REPO=$(cd "$INFRA/.." && pwd)
  cd "$INFRA"
  local state_default health_default
  STACK=$(env_get TOPSTACK_STACK prod)
  case "$STACK" in
    prod)
      COMPOSE_FILE_NAME=docker-compose.yml WEB=caddy LABEL=TopStack BACKUP=1
      state_default=$HOME/topstack-state health_default=http://127.0.0.1/api/v1/health ;;
    staging)
      COMPOSE_FILE_NAME=docker-compose.staging.yml WEB=beta-caddy LABEL="TopStack Beta" BACKUP=0
      state_default=$HOME/topstack-beta-state health_default=http://127.0.0.1:8081/api/v1/health ;;
    *) log "Unbekannter TOPSTACK_STACK=$STACK (prod oder staging)."; return 1 ;;
  esac
  STATE=${DEPLOY_STATE_DIR:-$state_default}
  HEALTH_URL=${DEPLOY_HEALTH_URL:-$health_default}
  HEALTH_TIMEOUT=${DEPLOY_HEALTH_TIMEOUT:-120}
  PULL_RETRY_SECONDS=${DEPLOY_PULL_RETRY_SECONDS:-30}
  mkdir -p "$STATE"

  exec 9>"$STATE/deploy.flock"
  flock -n 9 || { log "Ein anderes Deployment läuft gerade."; return 0; }

  if [ -e "$STATE/deploy.lock" ]; then
    log "Deploy-Sperre aktiv ($STATE/deploy.lock), nichts zu tun."
    return 0
  fi

  CHANNEL=$(env_get TOPSTACK_VERSION latest)
  OWNER=$(env_get GITHUB_OWNER krauspeter)
  NTFY_URL=$(env_get NTFY_URL "")
  if [[ "$CHANNEL" == pr-* ]]; then
    pr_channel || return 1  # setzt nach Merge oder Schließen des PRs CHANNEL=main
  fi
  local old_commit new_commit
  old_commit=$(git -C "$REPO" rev-parse HEAD)
  update_repo || return 1
  SERVICES=(api "$WEB")
  declare -A REF=(
    [api]="ghcr.io/$OWNER/topstack-api:$CHANNEL"
    [$WEB]="ghcr.io/$OWNER/topstack-web:$CHANNEL"
  )
  new_commit=$(git -C "$REPO" rev-parse HEAD)

  # Laufende Images vor dem Pull festhalten. Nach dem Pull hängt der Name am neuen Image; mit dem
  # containerd-Speicher von Docker ist ein Image ohne Namen sofort weg, auch wenn ein Container es
  # noch benutzt. Der Rollback braucht es aber.
  declare -A WANT=() RUN=() PINNED=()
  local svc changed=0
  for svc in "${SERVICES[@]}"; do
    RUN[$svc]=$(running_image "$svc")
    if [ -n "${RUN[$svc]}" ] && docker tag "${RUN[$svc]}" "topstack-rollback/$STACK-$svc:previous" 2>/dev/null; then
      PINNED[$svc]=1
    fi
  done

  if [ -n "${DEPLOY_PULL_HOOK:-}" ]; then
    bash -c "$DEPLOY_PULL_HOOK"  # nur für Tests in der CI: ersetzt den Pull
  elif [ "${DEPLOY_SKIP_PULL:-0}" != 1 ]; then
    # Nur die eigenen Images aus ghcr.io; Docker Hub begrenzt anonyme Abrufe (postgres, caddy usw.
    # bleiben auf ihrem Stand, bis sie von Hand mit "docker compose pull" aktualisiert werden)
    local pull=(pull --quiet api "$WEB")
    [ "$STACK" = prod ] && pull=(--profile ops pull --quiet api caddy backup)
    # ghcr.io antwortet gelegentlich nicht (z. B. Timeout beim Token): erst nach drei Versuchen melden
    local try
    for try in 1 2 3; do
      compose "${pull[@]}" && break
      if [ "$try" = 3 ]; then
        notify "$LABEL: Images konnten nicht geladen werden" warning "Kanal $CHANNEL, drei Versuche"
        return 1
      fi
      log "Laden fehlgeschlagen (Versuch $try von 3), neuer Versuch in ${PULL_RETRY_SECONDS}s."
      sleep "$PULL_RETRY_SECONDS"
    done
  fi

  for svc in "${SERVICES[@]}"; do
    WANT[$svc]=$(docker image inspect -f '{{.Id}}' "${REF[$svc]}" 2>/dev/null || true)
    [ -n "${WANT[$svc]}" ] || { log "Image ${REF[$svc]} fehlt lokal."; return 1; }
    [ "${WANT[$svc]}" = "${RUN[$svc]}" ] || changed=1
  done
  [ "$old_commit" = "$new_commit" ] || changed=1
  if [ $changed = 0 ]; then
    log "Keine Änderung (Kanal $CHANNEL)."
    return 0
  fi

  local candidate="$new_commit ${WANT[api]} ${WANT[$WEB]}"
  if [ -f "$STATE/bad" ] && [ "$(cat "$STATE/bad")" = "$candidate" ]; then
    log "Dieser Stand ist schon einmal gescheitert und wird übersprungen."
    [ "$old_commit" = "$new_commit" ] || git -C "$REPO" reset -q --hard "$old_commit"
    # Tags wieder auf die laufenden Images, damit ein späteres "docker compose up -d" nichts Kaputtes startet
    restore_tags
    return 0
  fi

  log "Neuer Stand: Commit ${new_commit:0:7}, API ${WANT[api]:7:12}, Web ${WANT[$WEB]:7:12}"
  if [ "$BACKUP" = 0 ]; then
    log "Staging: kein Backup vor dem Update."
  elif ! "$INFRA/ops/backup.sh" backup pre-deploy; then
    notify "$LABEL: Update abgebrochen" warning "Das Backup vor dem Update ist fehlgeschlagen. Nichts geändert."
    [ "$old_commit" = "$new_commit" ] || git -C "$REPO" reset -q --hard "$old_commit"
    return 1
  fi

  # Fehler beim Start entscheidet der Health-Check, nicht set -e
  compose up -d || log "docker compose up meldet einen Fehler"
  if wait_healthy; then
    local health build version
    health=$(curl -fsS -m 5 "$HEALTH_URL" || true)
    build=$(printf '%s' "$health" | sed -n 's/.*"pr":"\([0-9]*\)".*/\1/p')
    version=$(printf '%s' "$health" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')
    log "Update eingespielt (v${version:-?}, Update #${build:-?})."
    notify "$LABEL: Update #${build:-?} eingespielt" white_check_mark "v${version:-?}, Kanal $CHANNEL, Commit ${new_commit:0:7}"
    rm -f "$STATE/bad"
    return 0
  fi

  # --- Rollback --------------------------------------------------------------------
  log "Die API antwortet nicht. Zurück auf den vorherigen Stand."
  echo "$candidate" >"$STATE/bad"
  [ "$old_commit" = "$new_commit" ] || git -C "$REPO" reset -q --hard "$old_commit"
  restore_tags
  compose up -d || log "docker compose up meldet einen Fehler"
  if wait_healthy; then
    notify "$LABEL: Update fehlgeschlagen, zurückgerollt" warning \
      "Der neue Stand (Commit ${new_commit:0:7}) hat nicht geantwortet. Der alte Stand läuft wieder; der neue wird nicht erneut versucht."
  else
    local hint="Auf dem Heimserver: infra/ops/backup.sh list, dann infra/ops/restore.sh manual/<neuestes …-pre-deploy.dump>"
    [ "$STACK" = prod ] || hint="Staging hat kein Backup: Datenbank neu anlegen (docker compose -f docker-compose.staging.yml --env-file .env down -v) oder mit scripts/stage.sh einen anderen Stand wählen"
    notify "$LABEL: Update und Rollback fehlgeschlagen" rotating_light \
      "Vermutlich hat eine Migration die Datenbank verändert. $hint"
  fi
  return 1
}

log() { printf '%s %s\n' "$(date +%H:%M:%S)" "$*"; }

restore_tags() {  # Image-Namen zurück auf die festgehaltenen, vorher laufenden Images
  local svc
  for svc in "${SERVICES[@]}"; do
    if [ -n "${PINNED[$svc]:-}" ]; then
      docker tag "topstack-rollback/$STACK-$svc:previous" "${REF[$svc]}"
    else
      log "Für $svc gibt es kein festgehaltenes Image, der Name bleibt."
    fi
  done
}

compose() { docker compose -f "$INFRA/$COMPOSE_FILE_NAME" --env-file "$INFRA/.env" "$@"; }

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
    notify "$LABEL: Update angehalten" warning "Im Repo auf dem Heimserver gibt es lokale Änderungen. Bitte prüfen: git -C $REPO status"
    return 1
  fi
  case "$CHANNEL" in
    pr-*)
      # Stand eines Pull Requests (nur Staging, gesetzt mit scripts/stage.sh)
      git -C "$REPO" fetch -q origin "pull/${CHANNEL#pr-}/head"
      git -C "$REPO" checkout -q --detach FETCH_HEAD
      ;;
    main)
      git -C "$REPO" fetch -q origin main
      if [ "$(git -C "$REPO" rev-parse --abbrev-ref HEAD)" != main ]; then git -C "$REPO" checkout -q main; fi
      git -C "$REPO" merge -q --ff-only origin/main
      ;;
    latest)
      git -C "$REPO" fetch -q --tags origin
      local tag
      # Vorabversionen (v1.0.0-rc.1) zählen nicht als latest, wie in release.yml
      tag=$(git -C "$REPO" tag -l 'v*' --sort=-v:refname | grep -v -- - | head -n1 || true)
      if [ -n "$tag" ]; then git -C "$REPO" checkout -q "$tag"; else log "Noch keine Release-Version, Repo bleibt."; fi
      ;;
    *)
      git -C "$REPO" fetch -q --tags origin
      git -C "$REPO" checkout -q "v$CHANNEL"
      ;;
  esac
}

pr_channel() {  # pr-<Nummer>: nach Merge oder Schließen des PRs zurück auf main
  if [ "$STACK" != staging ]; then
    notify "$LABEL: Kanal $CHANNEL nur für Staging" warning "In der Produktion gibt es keine Stände aus Pull Requests. Bitte TOPSTACK_VERSION in infra/.env prüfen."
    return 1
  fi
  local state
  state=$(curl -fsS -m 10 "https://api.github.com/repos/$OWNER/topstack/pulls/${CHANNEL#pr-}" 2>/dev/null \
    | sed -n 's/^  "state": "\([a-z]*\)",$/\1/p' | head -n1 || true)
  if [ "$state" = closed ]; then
    sed -i "s/^TOPSTACK_VERSION=.*/TOPSTACK_VERSION=main/" "$INFRA/.env"
    notify "$LABEL: zurück auf main" information_source "Pull Request #${CHANNEL#pr-} ist gemergt oder geschlossen, Staging folgt wieder main."
    CHANNEL=main
  fi
  return 0
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
