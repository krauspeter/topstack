#!/usr/bin/env bash
# shellcheck disable=SC1111  # deutsche Anführungszeichen „…“ in Meldungen sind gewollt
# Prüft, dass App und Server dieselbe Version tragen und der Changelog dazu passt (AP-4).
# Aufruf: bash scripts/check-version.sh   (läuft in der CI bei jedem PR)
#
# Die Version steht an drei Stellen, die scripts/release.sh gemeinsam setzt:
#   app/package.json, server/pyproject.toml, server/topstack/__init__.py
# Dazu muss der neueste veröffentlichte Abschnitt in CHANGELOG.md dieselbe Version haben.
set -euo pipefail
cd "$(dirname "$0")/.."

app=$(sed -n 's/^  "version": "\(.*\)",$/\1/p' app/package.json | head -n1)
lock=$(sed -n '1,5s/^  "version": "\(.*\)",$/\1/p' app/package-lock.json | head -n1)
pyproject=$(sed -n 's/^version = "\(.*\)"$/\1/p' server/pyproject.toml | head -n1)
module=$(sed -n 's/^__version__ = "\(.*\)"$/\1/p' server/topstack/__init__.py)
changelog=$(sed -n 's/^## \[\([0-9][^]]*\)\].*/\1/p' CHANGELOG.md | head -n1)

fail=0
echo "app/package.json:            $app"
echo "app/package-lock.json:       $lock"
echo "server/pyproject.toml:       $pyproject"
echo "server/topstack/__init__.py: $module"
echo "CHANGELOG.md (neuester):     ${changelog:-–}"

if ! printf '%s' "$app" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$'; then
  echo "✗ Keine gültige Version (MAJOR.MINOR.PATCH[-vorab]) in app/package.json"; fail=1
fi
for v in "$lock" "$pyproject" "$module"; do
  if [ "$v" != "$app" ]; then echo "✗ Versionen weichen ab, bitte mit scripts/release.sh setzen"; fail=1; break; fi
done
if [ -n "$changelog" ] && [ "$changelog" != "$app" ]; then
  echo "✗ Neuester Abschnitt in CHANGELOG.md ist $changelog, die Version aber $app"; fail=1
fi
if ! grep -q '^## \[Unreleased\]' CHANGELOG.md; then
  echo "✗ Abschnitt „## [Unreleased]“ fehlt in CHANGELOG.md"; fail=1
fi

[ $fail -eq 0 ] && echo "✓ Version $app einheitlich"
exit $fail
