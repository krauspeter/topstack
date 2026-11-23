#!/usr/bin/env bash
# shellcheck disable=SC1111  # deutsche Anführungszeichen „…“ in Meldungen sind gewollt
# Bereitet ein Release vor (AP-4): Version setzen, Changelog-Abschnitt anlegen, Branch und Commit.
# Aufruf auf dem PC im Repo:  bash scripts/release.sh 0.9.0      (oder 1.0.0-rc.1, 1.0.0 …)
#
# Danach den Branch pushen und als PR mergen. Nach dem Merge erledigt release.yml den Rest:
# Tag vX.Y.Z, Images mit der Versionsnummer, GitHub-Release mit dem Changelog-Abschnitt.
#
# Optionen: --no-branch  arbeitet im aktuellen Branch und ohne Prüfung auf main (für Tests)
set -euo pipefail

usage() { echo "Aufruf: bash scripts/release.sh X.Y.Z[-vorab] [--no-branch]" >&2; exit 2; }
[ $# -ge 1 ] || usage
version=$1; shift
branch_mode=1
for arg in "$@"; do
  case "$arg" in
    --no-branch) branch_mode=0 ;;
    *) usage ;;
  esac
done

if ! printf '%s' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$'; then
  echo "✗ „$version“ ist keine Version nach Semantic Versioning (z. B. 0.9.0 oder 1.0.0-rc.1)" >&2; exit 2
fi

cd "$(git rev-parse --show-toplevel)"

if [ -n "$(git status --porcelain)" ]; then
  echo "✗ Es gibt nicht committete Änderungen, bitte erst committen oder verwerfen" >&2; exit 1
fi
if git rev-parse -q --verify "refs/tags/v$version" >/dev/null; then
  echo "✗ Tag v$version gibt es schon" >&2; exit 1
fi

current=$(sed -n 's/^  "version": "\(.*\)",$/\1/p' app/package.json | head -n1)
if [ "$current" = "$version" ]; then
  echo "✗ Die Version ist schon $version" >&2; exit 1
fi
# Neue Version muss größer sein (sort -V ordnet 1.0.0-rc.1 vor 1.0.0 nicht richtig ein,
# deshalb nur der Kern MAJOR.MINOR.PATCH; gleicher Kern ist erlaubt, z. B. rc.1 → rc.2 → final)
core_new=${version%%-*}; core_old=${current%%-*}
if [ "$core_new" != "$core_old" ] && [ "$(printf '%s\n%s\n' "$core_old" "$core_new" | sort -V | tail -n1)" != "$core_new" ]; then
  echo "✗ $version ist kleiner als die aktuelle Version $current" >&2; exit 1
fi

# Der Abschnitt „Unreleased“ muss Einträge haben, sonst gibt es nichts zu veröffentlichen
unreleased=$(awk '/^## \[Unreleased\]/{f=1;next} /^## \[/{f=0} f' CHANGELOG.md | grep -c '^- ' || true)
if [ "$unreleased" -eq 0 ]; then
  echo "✗ Unter „## [Unreleased]“ in CHANGELOG.md steht noch nichts" >&2; exit 1
fi

if [ $branch_mode -eq 1 ]; then
  if [ "$(git branch --show-current)" != main ]; then
    echo "✗ Bitte von main aus starten (git switch main && git pull)" >&2; exit 1
  fi
  git switch -q -c "release/v$version"
fi

# Version an allen Stellen setzen
sed -i "0,/^  \"version\": \".*\",\$/s//  \"version\": \"$version\",/" app/package.json
# package-lock.json: Kopf und Eintrag des Pakets selbst (packages."")
sed -i "1,5s/^  \"version\": \".*\",\$/  \"version\": \"$version\",/" app/package-lock.json
sed -i "/^    \"\": {\$/,/^    },\$/s/^      \"version\": \".*\",\$/      \"version\": \"$version\",/" app/package-lock.json
sed -i "0,/^version = \".*\"\$/s//version = \"$version\"/" server/pyproject.toml
sed -i "s/^__version__ = \".*\"\$/__version__ = \"$version\"/" server/topstack/__init__.py

# Changelog: „Unreleased“ wird zur Version, darüber ein neuer leerer Abschnitt
today=$(date +%Y-%m-%d)
awk -v v="$version" -v d="$today" '
  /^## \[Unreleased\]/ && !done { print; print ""; print "## [" v "] - " d; done=1; next }
  { print }
' CHANGELOG.md > CHANGELOG.md.tmp && mv CHANGELOG.md.tmp CHANGELOG.md
# Vergleichslinks am Ende fortschreiben
repo=https://github.com/krauspeter/topstack
if grep -q '^\[Unreleased\]:' CHANGELOG.md; then
  sed -i "s|^\[Unreleased\]:.*|[Unreleased]: $repo/compare/v$version...HEAD\n[$version]: $repo/compare/v$current...v$version|" CHANGELOG.md
  # Vor dem ersten Release gibt es keinen Tag v$current: dann auf den Tag selbst zeigen
  if ! git rev-parse -q --verify "refs/tags/v$current" >/dev/null && ! git ls-remote --exit-code --tags origin "v$current" >/dev/null 2>&1; then
    sed -i "s|^\[$version\]:.*|[$version]: $repo/releases/tag/v$version|" CHANGELOG.md
  fi
fi

bash scripts/check-version.sh >/dev/null

# Hinweis, falls für die App noch kein „Was ist neu“ zu dieser Version da ist
if ! grep -q "'${version%%-*}'" app/src/whatsNew.ts && ! grep -q "'$version'" app/src/whatsNew.ts; then
  echo "⚠ In app/src/whatsNew.ts steht noch kein „Was ist neu“ für $version (optional, wird sonst nicht angezeigt)"
fi

git add app/package.json app/package-lock.json server/pyproject.toml server/topstack/__init__.py CHANGELOG.md
git commit -q -F - <<EOF
chore: release v$version

Sets the version to $version in the app and the server and turns the
"Unreleased" section of CHANGELOG.md into the section for $version.

After the merge, release.yml tags the merge commit as v$version, adds the
version to the already tested images and creates the GitHub release with
this changelog section.
EOF

echo "✓ Release v$version vorbereitet (Commit $(git rev-parse --short HEAD))"
if [ $branch_mode -eq 1 ]; then
  echo "  Weiter: bash scripts/push.sh -u origin release/v$version, dann den PR mergen."
fi
