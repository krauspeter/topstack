#!/usr/bin/env bash
# Pusht und zeigt danach den GitHub-Actions-Lauf live im Terminal.
# Aufruf: bash scripts/push.sh   (Argumente gehen an git push weiter)
set -euo pipefail

git push "$@"

branch=$(git branch --show-current)
sha=$(git rev-parse HEAD)
echo "Warte auf den CI-Lauf für ${sha:0:7} …"
for _ in $(seq 1 20); do
  run_id=$(gh run list --branch "$branch" --commit "$sha" --limit 1 --json databaseId -q '.[0].databaseId' 2>/dev/null || true)
  [ -n "$run_id" ] && break
  sleep 3
done
if [ -z "${run_id:-}" ]; then
  echo "Kein CI-Lauf gefunden (nur Doku geändert?)."
  exit 0
fi
gh run watch "$run_id" --exit-status && echo "✔ CI grün" || { echo "✘ CI rot – Details:"; gh run view "$run_id" --log-failed | tail -40; exit 1; }
