#!/usr/bin/env bash
# Gleicht Labels, Meilensteine und Issues aus scripts/backlog.tsv mit dem aktuellen GitHub-Repo ab.
# Voraussetzung: gh CLI, angemeldet (gh auth login), im Repo-Ordner ausführen.
# Darf mehrfach laufen: Gibt es schon ein offenes Issue mit demselben Titel, bekommt es nur Meilenstein
# und Labels aus der Datei; geschlossene Issues mit demselben Titel bleiben unberührt, es wird kein neues angelegt.
#
#   scripts/create-backlog-issues.sh               # alle Meilensteine
#   scripts/create-backlog-issues.sh v1.1 v1.2     # nur diese Meilensteine
set -euo pipefail
cd "$(dirname "$0")"

repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo "Repo: $repo"

# Fälligkeit nach dem Zeitplan in docs/roadmap.md (Stand 27.11.2026)
declare -A due=(
  ["v1.1"]="2027-02-15" ["v1.2"]="2027-05-15" ["v1.3"]="2027-06-15" ["v1.4"]="2027-07-31"
  ["v2.0"]="2027-10-31" ["v2.1"]="2028-01-31" ["v3.0"]="2028-05-31" ["v3.1"]="2028-08-31"
  ["v4.0"]="2028-11-30" ["Backlog"]=""
)

labels=$(tail -n +2 backlog.tsv | cut -f2 | tr ',' '\n' | sort -u)
for label in $labels; do
  gh label create "$label" --force >/dev/null
done

existing=$(gh api "repos/$repo/milestones?state=all&per_page=100" -q '.[].title')
for m in "${!due[@]}"; do
  if ! grep -qxF "$m" <<<"$existing"; then
    if [ -n "${due[$m]}" ]; then
      gh api "repos/$repo/milestones" -f title="$m" -f due_on="${due[$m]}T23:59:59Z" >/dev/null
    else
      gh api "repos/$repo/milestones" -f title="$m" >/dev/null
    fi
    echo "Meilenstein: $m"
  fi
done

only=("$@")
wanted() {
  [ ${#only[@]} -eq 0 ] && return 0
  local m
  for m in "${only[@]}"; do [ "$m" = "$1" ] && return 0; done
  return 1
}

issues=$(gh issue list --state all --limit 500 --json number,title,state -q '.[] | "\(.number)\t\(.state)\t\(.title)"')

tail -n +2 backlog.tsv | while IFS=$'\t' read -r milestone labels title body; do
  wanted "$milestone" || continue
  match=$(awk -F'\t' -v t="$title" '$3 == t' <<<"$issues" | sort -t$'\t' -k2,2r | head -n 1)
  if [ -z "$match" ]; then
    gh issue create --title "$title" --body "$body" --label "$labels" --milestone "$milestone" >/dev/null
    echo "Neu: $title"
  elif [ "$(cut -f2 <<<"$match")" = "OPEN" ]; then
    number=$(cut -f1 <<<"$match")
    gh issue edit "$number" --milestone "$milestone" --add-label "$labels" >/dev/null
    echo "Aktualisiert: #$number $title"
  else
    echo "Geschlossen, übersprungen: $title"
  fi
done
