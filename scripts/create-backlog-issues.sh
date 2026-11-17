#!/usr/bin/env bash
# Legt Labels, Meilensteine und Issues aus scripts/backlog.tsv im aktuellen GitHub-Repo an.
# Voraussetzung: gh CLI, angemeldet (gh auth login), im Repo-Ordner ausführen.
# Mehrfaches Ausführen legt Issues doppelt an – daher nur einmal starten.
set -euo pipefail
cd "$(dirname "$0")"

repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo "Repo: $repo"

for label in phase-1 phase-2 phase-3 phase-4 v1.1 v2.0 hardware app server devops docs; do
  gh label create "$label" --force >/dev/null
done

declare -A due=(
  ["Phase 1"]="2027-01-10" ["Phase 2"]="2027-02-28" ["Phase 3"]="2027-04-30"
  ["Phase 4"]="2027-05-31" ["v1.1"]="2027-08-31" ["Hardware"]="2027-12-31" ["v2.0"]="2028-03-31"
)
existing=$(gh api "repos/$repo/milestones?state=all&per_page=100" -q '.[].title')
for m in "${!due[@]}"; do
  if ! grep -qxF "$m" <<<"$existing"; then
    gh api "repos/$repo/milestones" -f title="$m" -f due_on="${due[$m]}T23:59:59Z" >/dev/null
    echo "Meilenstein: $m"
  fi
done

tail -n +2 backlog.tsv | while IFS=$'\t' read -r milestone labels title body; do
  gh issue create --title "$title" --body "$body" --label "$labels" --milestone "$milestone" >/dev/null
  echo "Issue: $title"
done
