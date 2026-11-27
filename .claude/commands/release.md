---
description: Release vorbereiten (z. B. /release 1.1.0) – Version, Changelog, „Was ist neu“, PR
argument-hint: X.Y.Z oder X.Y.Z-rc.N
---

Bereite das Release **$ARGUMENTS** von TopStack vor, wie in CLAUDE.md unter „Release“ beschrieben.

1. Prüfe, dass `main` aktuell ist (`git fetch`, `git switch main`, `git pull --ff-only`) und die letzte CI auf `main` grün ist (`gh run list --branch main --limit 3`). Ist sie rot, stopp und erklär Peter, woran es liegt.
2. Zeig Peter, was seit dem letzten Release unter `## [Unreleased]` in `CHANGELOG.md` steht, und frag, ob das so raus soll. Ist der Abschnitt leer, stopp.
3. `bash scripts/release.sh $ARGUMENTS` (legt den Branch `release/v$ARGUMENTS` an).
4. Ergänze `app/src/whatsNew.ts` um 2–4 kurze deutsche Sätze für die Mitspieler (nur bei Versionen ohne `-rc`; ein Release-Kandidat nutzt den Eintrag der fertigen Version). Commit auf Englisch mit Beschreibung.
5. `bash scripts/check-version.sh`, dann pushen und den PR „chore: release v$ARGUMENTS“ anlegen. PR-Beschreibung auf Deutsch mit „Worum geht es“, „Änderungen“, „Nach dem Merge“ (was `release.yml` macht; bei `-rc`: `latest` bleibt) und „Nach dem Einspielen“ mit „v$ARGUMENTS · Update #<PR-Nummer>“.
6. Auf die CI warten. Erklär Peter Schritt für Schritt: PR mergen, unter *Actions* auf den grünen Lauf von „Release“ warten, nach etwa 5 Minuten zeigt die Produktion die neue Version.
