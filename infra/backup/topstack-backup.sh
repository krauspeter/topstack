#!/usr/bin/env bash
# Backups der TopStack-Datenbank (Phase 4, AP-1, ADR-0016).
#
# Läuft im Container "backup" aus infra/docker-compose.yml (Profil "ops"):
#   topstack-backup backup [nightly|pre-deploy|manual]   sichern, prüfen, nach R2 kopieren, aufräumen
#   topstack-backup restore-test                          neuestes Backup in Wegwerf-Datenbank einspielen und prüfen
#   topstack-backup restore <datei.dump>                  Backup in die echte Datenbank zurückspielen (API vorher stoppen!)
#   topstack-backup list                                  vorhandene Backups lokal und in R2 anzeigen
#
# Ablage lokal (unverschlüsselt, Rechte 600) und in R2 (mit age verschlüsselt):
#   daily/    7 Stück   jede Nacht
#   weekly/   4 Stück   zusätzlich sonntags
#   monthly/  6 Stück   zusätzlich am 1. des Monats
#   manual/  10 Stück   von Hand und vor jedem Deployment (AP-3)
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-/backups}
BACKUP_UID=${BACKUP_UID:-1000}
BACKUP_GID=${BACKUP_GID:-1000}
BACKUP_OFFSITE=${BACKUP_OFFSITE:-on}       # off = nur lokal (CI, Ersteinrichtung)
R2_BUCKET=${R2_BUCKET:-topstack-backups}
AGE_RECIPIENT=${BACKUP_AGE_RECIPIENT:-}
PING_URL=${BACKUP_PING_URL:-}              # healthchecks.io (AP-2), leer = kein Ping
RESTORE_TEST_PING_URL=${RESTORE_TEST_PING_URL:-}
export PGHOST=${PGHOST:-db} PGUSER=${PGUSER:-topstack} PGDATABASE=${PGDATABASE:-topstack}

declare -A KEEP=([daily]=7 [weekly]=4 [monthly]=6 [manual]=10)
# Tabellen, deren Zeilenzahl im Manifest steht und beim Wiederherstellungstest verglichen wird
COUNT_TABLES=(app_user player tournament match game_event)

umask 077

CLEANUP=()
cleanup() { local p; for p in "${CLEANUP[@]}"; do [ -n "$p" ] && rm -rf "$p"; done; }
trap cleanup EXIT

log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
die() { log "FEHLER: $*"; exit 1; }

ping() {  # ping <url> [suffix]; Fehler beim Ping brechen nichts ab
  local url=$1 suffix=${2:-}
  [ -n "$url" ] || return 0
  curl -fsS -m 10 --retry 3 "${url}${suffix}" >/dev/null || log "Ping an healthchecks.io fehlgeschlagen"
}

offsite() { [ "$BACKUP_OFFSITE" != "off" ]; }

check_offsite_config() {
  offsite || return 0
  [ -n "$AGE_RECIPIENT" ] || die "BACKUP_AGE_RECIPIENT fehlt in der .env (öffentlicher age-Schlüssel, beginnt mit age1)"
  [ -n "${RCLONE_CONFIG_R2_ENDPOINT:-}" ] || die "R2_ENDPOINT fehlt in der .env"
  [ -n "${RCLONE_CONFIG_R2_ACCESS_KEY_ID:-}" ] || die "R2_ACCESS_KEY_ID fehlt in der .env"
  [ -n "${RCLONE_CONFIG_R2_SECRET_ACCESS_KEY:-}" ] || die "R2_SECRET_ACCESS_KEY fehlt in der .env"
}

# psql-Abfrage mit einem einzelnen Wert als Ergebnis
q() { psql -X -v ON_ERROR_STOP=1 -tAc "$1" "${@:2}"; }

manifest() {  # manifest <name> <reason> <dump> -> JSON auf stdout
  local name=$1 reason=$2 dump=$3 counts="" t
  for t in "${COUNT_TABLES[@]}"; do
    counts+="\"$t\": $(q "SELECT count(*) FROM \"$t\""), "
  done
  cat <<JSON
{
  "name": "$name",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "reason": "$reason",
  "alembic_version": "$(q 'SELECT version_num FROM alembic_version')",
  "dump_bytes": $(stat -c %s "$dump"),
  "dump_sha256": "$(sha256sum "$dump" | cut -d' ' -f1)",
  "age_sha256": "__AGE_SHA256__",
  "counts": { ${counts%, } }
}
JSON
}

json_get() {  # json_get <datei> <schlüssel>  (flache Werte, ohne jq)
  sed -n "s/^ *\"$2\": *\"\{0,1\}\([^\",]*\)\"\{0,1\},\{0,1\}$/\1/p" "$1" | head -n1
}

json_count() {  # json_count <datei> <tabelle>
  grep -o "\"$2\": [0-9]*" "$1" | head -n1 | grep -o '[0-9]*$'
}

prune_local() {  # prune_local <stufe>
  local tier=$1 keep=${KEEP[$1]}
  find "$BACKUP_DIR/$tier" -maxdepth 1 -name 'topstack-*.dump' -printf '%f\n' | sort -r | tail -n +$((keep + 1)) |
    while read -r f; do
      log "lösche lokal $tier/${f%.dump}"
      rm -f "$BACKUP_DIR/$tier/$f" "$BACKUP_DIR/$tier/${f%.dump}.json"
    done
}

prune_remote() {  # prune_remote <stufe>
  local tier=$1 keep=${KEEP[$1]}
  rclone lsf "r2:$R2_BUCKET/$tier/" --include 'topstack-*.dump.age' 2>/dev/null | sort -r | tail -n +$((keep + 1)) |
    while read -r f; do
      local base=${f%.dump.age}
      log "lösche in R2 $tier/$base"
      rclone deletefile "r2:$R2_BUCKET/$tier/$f"
      rclone deletefile "r2:$R2_BUCKET/$tier/$base.json" 2>/dev/null || true
    done
}

cmd_backup() {
  local reason=${1:-manual} tiers=() name tmp rc=0
  case "$reason" in
    nightly)
      tiers=(daily)
      [ "$(date -u +%u)" = 7 ] && tiers+=(weekly)
      [ "$(date -u +%d)" = 01 ] && tiers+=(monthly)
      ;;
    pre-deploy | manual) tiers=(manual) ;;
    *) die "Unbekannter Grund '$reason' (nightly, pre-deploy oder manual)" ;;
  esac
  check_offsite_config

  name="topstack-$(date -u +%Y%m%dT%H%M%SZ)-$reason"
  tmp=$(mktemp -d)
  CLEANUP+=("$tmp")

  log "pg_dump → $name.dump"
  pg_dump -Fc -f "$tmp/$name.dump"
  pg_restore --list "$tmp/$name.dump" >/dev/null || die "Backup ist nicht lesbar (pg_restore --list)"
  [ -s "$tmp/$name.dump" ] || die "Backup ist leer"
  manifest "$name" "$reason" "$tmp/$name.dump" >"$tmp/$name.json"

  if offsite; then
    age -r "$AGE_RECIPIENT" -o "$tmp/$name.dump.age" "$tmp/$name.dump"
    sed -i "s/__AGE_SHA256__/$(sha256sum "$tmp/$name.dump.age" | cut -d' ' -f1)/" "$tmp/$name.json"
  else
    sed -i 's/"__AGE_SHA256__"/null/' "$tmp/$name.json"
  fi

  local tier
  for tier in "${tiers[@]}"; do
    mkdir -p "$BACKUP_DIR/$tier"
    cp "$tmp/$name.dump" "$tmp/$name.json" "$BACKUP_DIR/$tier/"
    if offsite; then
      log "Upload nach R2: $tier/$name"
      if ! rclone copyto "$tmp/$name.dump.age" "r2:$R2_BUCKET/$tier/$name.dump.age" ||
        ! rclone copyto "$tmp/$name.json" "r2:$R2_BUCKET/$tier/$name.json"; then
        log "Upload nach R2 fehlgeschlagen, das lokale Backup bleibt erhalten"
        rc=1
      fi
    fi
  done
  chown -R "$BACKUP_UID:$BACKUP_GID" "$BACKUP_DIR" 2>/dev/null || true

  for tier in "${tiers[@]}"; do
    prune_local "$tier"
    if offsite && [ $rc = 0 ]; then prune_remote "$tier" || rc=1; fi
  done

  if [ $rc = 0 ]; then
    log "fertig: $name ($(du -h "$tmp/$name.dump" | cut -f1)) in ${tiers[*]}"
    ping "$PING_URL"
  else
    ping "$PING_URL" /fail
  fi
  return $rc
}

latest_local() {
  find "$BACKUP_DIR" -mindepth 2 -maxdepth 2 -name 'topstack-*.dump' -printf '%f %p\n' | sort -r | head -n1 | cut -d' ' -f2
}

cmd_restore_test() {
  local dump=${1:-} json tier name pgdata rc=0 t want got
  [ -n "$dump" ] || dump=$(latest_local)
  [ -n "$dump" ] && [ -f "$dump" ] || { ping "$RESTORE_TEST_PING_URL" /fail; die "Kein Backup unter $BACKUP_DIR gefunden"; }
  json=${dump%.dump}.json
  [ -f "$json" ] || { ping "$RESTORE_TEST_PING_URL" /fail; die "Manifest $json fehlt"; }
  name=$(basename "${dump%.dump}")
  log "Wiederherstellungstest mit $name"

  # 1. Prüfsumme der lokalen Datei
  [ "$(sha256sum "$dump" | cut -d' ' -f1)" = "$(json_get "$json" dump_sha256)" ] || { log "Prüfsumme des Dumps stimmt nicht"; rc=1; }

  # 2. Wegwerf-PostgreSQL nur in diesem Container, ohne Netzwerk
  pgdata=$(mktemp -d)
  chown postgres:postgres "$pgdata"
  gosu postgres initdb -D "$pgdata" -U postgres --auth=trust >/dev/null
  CLEANUP+=("$pgdata")
  gosu postgres pg_ctl -D "$pgdata" -l "$pgdata/postgres.log" -o "-c listen_addresses='' -k $pgdata" -w -s start
  local conn=(-h "$pgdata" -U postgres)
  psql -X -q "${conn[@]}" -d postgres -c 'CREATE DATABASE restoretest'
  if ! pg_restore "${conn[@]}" -d restoretest --no-owner --no-acl --exit-on-error "$dump"; then
    log "pg_restore ist fehlgeschlagen"
    rc=1
  else
    # 3. Inhalt gegen das Manifest
    want=$(json_get "$json" alembic_version)
    got=$(q 'SELECT version_num FROM alembic_version' "${conn[@]}" -d restoretest)
    [ "$want" = "$got" ] || { log "Alembic-Version: erwartet $want, gefunden $got"; rc=1; }
    for t in "${COUNT_TABLES[@]}"; do
      want=$(json_count "$json" "$t")
      got=$(q "SELECT count(*) FROM \"$t\"" "${conn[@]}" -d restoretest)
      if [ "$want" = "$got" ]; then log "  $t: $got ✓"; else log "  $t: erwartet $want, gefunden $got"; rc=1; fi
    done
  fi

  # 4. Kopie in R2 vorhanden und unverändert (entschlüsseln geht nur mit dem privaten Schlüssel, der nicht auf dem Server liegt)
  if offsite && [ "$(json_get "$json" age_sha256)" != "null" ]; then
    check_offsite_config
    tier=$(basename "$(dirname "$dump")")
    got=$(rclone cat "r2:$R2_BUCKET/$tier/$name.dump.age" 2>/dev/null | sha256sum | cut -d' ' -f1)
    if [ "$got" = "$(json_get "$json" age_sha256)" ]; then log "  R2-Kopie ✓"; else log "  R2-Kopie fehlt oder ist verändert"; rc=1; fi
  fi

  gosu postgres pg_ctl -D "$pgdata" -m immediate -w -s stop || true

  if [ $rc = 0 ]; then log "Wiederherstellungstest bestanden"; ping "$RESTORE_TEST_PING_URL"; else log "Wiederherstellungstest FEHLGESCHLAGEN"; ping "$RESTORE_TEST_PING_URL" /fail; fi
  return $rc
}

cmd_restore() {
  local dump=${1:-}
  [ -n "$dump" ] && [ -f "$dump" ] || die "Aufruf: restore <pfad/zur/datei.dump> (Pfad im Container, z. B. /backups/daily/…)"
  log "Spiele $(basename "$dump") in die Datenbank $PGDATABASE ein (überschreibt den aktuellen Stand)"
  pg_restore -d "$PGDATABASE" --clean --if-exists --no-owner --exit-on-error "$dump"
  log "fertig. Jetzt die API wieder starten."
}

cmd_list() {
  local tier
  for tier in daily weekly monthly manual; do
    echo "== $tier (lokal)"
    if [ -d "$BACKUP_DIR/$tier" ]; then
      find "$BACKUP_DIR/$tier" -maxdepth 1 -name 'topstack-*.dump' -printf '%f  %k KB\n' | sort -r
    else
      echo "(noch keine)"
    fi
    if offsite && [ -n "${RCLONE_CONFIG_R2_ENDPOINT:-}" ]; then
      echo "== $tier (R2)"
      rclone lsf "r2:$R2_BUCKET/$tier/" --include '*.dump.age' 2>/dev/null | sort -r || echo "(nicht lesbar)"
    fi
  done
}

case "${1:-}" in
  backup) cmd_backup "${2:-manual}" ;;
  restore-test) cmd_restore_test "${2:-}" ;;
  restore) cmd_restore "${2:-}" ;;
  list) cmd_list ;;
  *) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
