# Release v1.0 am Draftabend · Drehbuch

Stand: 25.11.2026 · Draftabend **So 27.12.2026** (voraussichtlich) · gehört zu [AP-8](README.md#ap-8--rollout-und-release-abend-v10-ca-3-h)

Jeder Schritt sagt, wo er läuft: **PC** (Browser oder GitHub), **Heimserver** (per SSH, Ordner `~/topstack` bzw. `~/topstack-beta`) oder **Handy**. Was Claude vorbereitet, steht als „Claude“ dabei.

## Zeitplan

| Wann | Was | Wer |
| --- | --- | --- |
| bis So 13.12. | Anleitung an die Gruppe, Tester für Beta freischalten (Abschnitt 1) | Peter |
| **So 20.12.** | Release-Kandidat `1.0.0-rc.1`, die Gruppe testet auf Beta (Abschnitt 2) | Claude bereitet vor, Peter mergt |
| 21.–24.12. | Feedback sichten, Fehler beheben; bei Änderungen `1.0.0-rc.2` | Claude, Peter |
| **Sa 26.12.** | Release `v1.0.0`, Produktion auf den Kanal `latest` (Abschnitt 3) | Claude bereitet vor, Peter mergt und stellt um |
| **So 27.12.** tagsüber | Backup, Deploy-Sperre, Probelauf (Abschnitt 4) | Peter |
| **So 27.12.** abends | Draftabend: Abnahme G3 und Push im echten Turnier (Abschnitt 5) | alle |
| Mo 28.12. | Sperre aufheben, Wiederherstellung proben, Feedback sichten, Schlüssel erneuern (Abschnitt 6) | Peter, Claude |

Ab dem 20.12. kommen nur noch Fehlerbehebungen in `main`, keine neuen Funktionen.

## 1. Gruppe vorbereiten (bis 13.12.)

- [ ] **PC:** Anleitung [„TopStack in 4 Schritten“](https://claude.ai/artifact/9Z6ue547qKEUT9SnKQDY8P) in die Gruppe schicken (vorher teilen oder als Bild/PDF exportieren). Alle installieren die App von `topstack.win`, melden sich an und erlauben Push.
- [ ] **PC:** Tester für Beta freischalten. Cloudflare → Zero Trust → Access → Applications → „TopStack Beta“ → Richtlinie „Nur Peter“ → Include **Emails**: die Adressen der Mitspieler ergänzen. Die Richtlinie danach ruhig in „Tester“ umbenennen.
- [ ] **Heimserver (`~/topstack-beta`):** dieselben Adressen in `TOPSTACK_MAIL_ALLOWLIST` der Staging-`.env` (kommagetrennt), dann `docker compose -f infra/docker-compose.staging.yml --env-file infra/.env up -d api`. Sonst schickt Beta ihnen keine Anmeldelinks.
- [ ] **Handy (Peter, auf Beta):** Profil → Testgruppe → Einladungslink erzeugen und in die Gruppe schicken. Wer ihn öffnet, landet in der Testgruppe auf Beta.

## 2. Release-Kandidat rc.1 (So 20.12.)

- [ ] **Claude:** `scripts/release.sh 1.0.0-rc.1` → Release-PR mit dem Changelog aller Einträge unter „Unreleased“.
- [ ] **PC:** PR mergen. `release.yml` setzt das Tag `v1.0.0-rc.1` und legt den Vorab-Release auf GitHub an. Die Produktion bleibt auf `main`, `latest` zeigt weiter nicht auf einen Kandidaten.
- [ ] **Handy:** Beta zeigt unten **v1.0.0-rc.1**.
- [ ] **Gruppe:** auf Beta ein Testturnier mit allen spielen (Einladung, Plätze, Farben, zwei Runden, Ergebnis korrigieren), Feedback über den Knopf in der App.
- [ ] **PC:** Feedback-Issues sichten. Was den Abend gefährdet, wird behoben und kommt als `1.0.0-rc.2`; der Rest geht nach v1.0.1.

## 3. Release v1.0.0 (Sa 26.12.)

- [ ] **Claude:** `scripts/release.sh 1.0.0` → Release-PR. „Unreleased“ wird zu `## [1.0.0] - 2026-12-26`, die Neuigkeiten in der App zeigen die wichtigsten Punkte.
- [ ] **PC:** PR mergen, auf den grünen Lauf von `release.yml` warten. Danach gibt es auf ghcr.io die Tags `1.0.0` und `latest`.
- [ ] **Heimserver (`~/topstack`):** Produktion auf Releases umstellen:
  ```bash
  cd ~/topstack
  git pull
  sed -i 's/^TOPSTACK_VERSION=.*/TOPSTACK_VERSION=latest/' infra/.env
  grep TOPSTACK_VERSION infra/.env
  ```
  Der Deploy-Timer holt `latest` beim nächsten Lauf (höchstens 5 Minuten), vorher läuft ein Backup.
- [ ] **Handy:** `topstack.win` zeigt unten **v1.0.0** und einmal die Neuigkeiten. ntfy meldet das Update.
- [ ] **PC:** Uptime Kuma und healthchecks.io grün.

## 4. Am Tag des Draftabends, tagsüber (So 27.12.)

- [ ] **Heimserver:** Backup von Hand und Sperre setzen:
  ```bash
  cd ~/topstack
  infra/ops/backup.sh backup manual
  touch ~/topstack-state/deploy.lock
  ```
  Bis zur Aufhebung spielt der Timer nichts mehr ein, auch keine Merges.
- [ ] **Heimserver:** `infra/ops/admin.sh tournaments` zeigt keine Testturniere in der „Draft-Runde“; `infra/ops/admin.sh players` zeigt alle Mitspieler als Mitglied.
- [ ] **Handy (Peter):** Profil → Benachrichtigungen → „Test senden“ kommt an.
- [ ] **Handy:** Gäste ohne Konto spielen per QR-Code als Gast mit (in der Rangliste erscheinen sie nicht).

## 5. Am Abend

- [ ] Abnahme G3 nach der [Checkliste AP-10 aus Phase 3](../phase3/README.md#ap-10--abnahme-gate-g3-ca-2-h--verschoben-zum-release-v10), Schritte 1 bis 8.
- [ ] Push kommt an: „Du bist dran“, neue Runde, Turnierende.
- [ ] Die Turnier-Karte auf der Startseite stimmt bei allen: dran, läuft, Pause mit Vorziehen, nächste Runde.
- [ ] Probleme direkt über „Feedback geben“ melden, mit Screenshot.

## 6. Danach (ab Mo 28.12.)

- [ ] **Heimserver:** Sperre aufheben: `rm ~/topstack-state/deploy.lock`.
- [ ] **PC (Windows):** Backup vom Abend wiederherstellen, Rangliste stimmt mit der App überein ([Heimserver, Ernstfall auf einem anderen Rechner](../phase3/heimserver.md#ernstfall-auf-einem-anderen-rechner-wiederherstellen)).
- [ ] **PC:** Feedback des Abends sichten, Fehler im Meilenstein v1.0.1.
- [ ] **PC und Heimserver:** Resend-API-Schlüssel und ntfy-Topic erneuern (siehe AP-8).
- [ ] iPhone-Test AP-7 nachholen, sobald ein iPhone da ist.
- [ ] **Claude:** Roadmap und Phase-4-Plan aktualisieren, G3 und G4 abhaken.

## Wenn etwas schiefgeht

| Problem | Was tun |
| --- | --- |
| Update am 26.12. kaputt | Der Timer rollt selbst zurück und meldet sich per ntfy. Sonst: `TOPSTACK_VERSION=0.9.0` in `infra/.env`, beim nächsten Lauf ist der alte Stand zurück. |
| Server fällt am Abend aus | Der Life-Tracker läuft offline weiter. Ergebnisse auf Papier notieren und am nächsten Tag nachtragen. |
| Daten kaputt | `infra/ops/backup.sh list`, dann `infra/ops/restore.sh manual/<Backup vom Nachmittag>`. |
| Jemand kommt nicht rein | Anmeldelink neu schicken lassen; notfalls als Gast per QR-Code mitspielen. |
