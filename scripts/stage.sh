#!/usr/bin/env bash
# shellcheck disable=SC1111  # deutsche Anführungszeichen „…“ in Meldungen sind gewollt
# Schaltet die Staging-Umgebung beta.topstack.win auf einen Stand um (AP-3b).
# Aufruf auf dem PC (braucht SSH-Zugang zum Heimserver):
#   bash scripts/stage.sh 145     Stand von Pull Request #145 (Image pr-145 aus der CI)
#   bash scripts/stage.sh main    zurück auf main (passiert nach dem Merge auch von selbst)
#   bash scripts/stage.sh status  zeigt, was gerade auf Staging läuft
# Einstellbar: TOPSTACK_SSH (Standard peter@heimserver), TOPSTACK_BETA_DIR (Standard topstack-beta,
# relativ zum Home-Verzeichnis auf dem Heimserver), GITHUB_OWNER (Standard krauspeter).
set -euo pipefail

ssh_target=${TOPSTACK_SSH:-peter@heimserver}
beta_dir=${TOPSTACK_BETA_DIR:-topstack-beta}
owner=${GITHUB_OWNER:-krauspeter}

usage() { echo "Aufruf: bash scripts/stage.sh <PR-Nummer>|main|status" >&2; exit 2; }
[ $# -eq 1 ] || usage

# Gibt es das Image schon? Die Images sind öffentlich, ein anonymes Token reicht.
image_exists() {  # image_exists <image> <tag>
  local token
  token=$(curl -fsS "https://ghcr.io/token?scope=repository:$owner/$1:pull" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  curl -fsS -o /dev/null -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json" \
    "https://ghcr.io/v2/$owner/$1/manifests/$2"
}

case "$1" in
  status)
    # shellcheck disable=SC2016  # $HOME soll auf dem Heimserver aufgelöst werden
    ssh "$ssh_target" 'grep "^TOPSTACK_VERSION=" "$HOME/'"$beta_dir"'/infra/.env"; curl -fsS http://127.0.0.1:8081/api/v1/health; echo'
    exit 0 ;;
  main) channel=main ;;
  *)
    printf '%s' "$1" | grep -Eq '^[0-9]+$' || usage
    channel="pr-$1"
    for image in topstack-api topstack-web; do
      if ! image_exists "$image" "$channel"; then
        echo "✗ Image $image:$channel gibt es nicht. Ist die CI für PR #$1 durchgelaufen? (Images" >&2
        echo "  entstehen nur bei Änderungen an app/, server/ oder infra/ und nicht für Dependabot.)" >&2
        exit 1
      fi
    done ;;
esac

echo "Staging → $channel …"
# Kanal setzen und sofort ausrollen; deploy.sh meldet das Ergebnis auch per ntfy
# shellcheck disable=SC2029  # $channel und $beta_dir sollen hier am PC eingesetzt werden
ssh "$ssh_target" "sed -i 's/^TOPSTACK_VERSION=.*/TOPSTACK_VERSION=$channel/' \"\$HOME/$beta_dir/infra/.env\" && \"\$HOME/$beta_dir/infra/ops/deploy.sh\""
echo "✓ Fertig. https://beta.topstack.win (unten auf dem Startbildschirm steht die Update-Nummer)"
