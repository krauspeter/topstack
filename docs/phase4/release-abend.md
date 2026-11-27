# Release v1.0 am Draftabend · Drehbuch

Stand: 25.11.2026 · Draftabend **So 27.12.2026** (voraussichtlich), dann schon mit v1.0 · gehört zu [AP-8](README.md#ap-8--rollout-und-release-abend-v10-ca-3-h)

Jeder Schritt sagt, wo er läuft: **PC** (Browser oder GitHub), **Heimserver** (per SSH, Ordner `~/topstack` bzw. `~/topstack-beta`) oder **Handy**. Was Claude vorbereitet, steht als „Claude“ dabei.

## Zeitplan

Entscheidung vom 25.11.2026: `v1.0.0` kommt noch am selben Tag direkt nach `1.0.0-rc.1`, und die Produktion geht sofort auf den Kanal `latest`. Die Gruppe nutzt v1.0 also schon vor dem Draftabend; Fehler, die sie findet, kommen als `1.0.1`.

| Wann | Was | Wer |
| --- | --- | --- |
| **Mi 25.11.** | `1.0.0-rc.1` (Abschnitt 2), gleich danach `v1.0.0` und Produktion auf `latest` (Abschnitt 3) | Claude bereitet vor, Peter mergt und stellt um |
| ab 25.11. | Anleitung an die Gruppe, alle richten die App ein (Abschnitt 1) | Peter, Gruppe |
| bis 26.12. | Feedback sichten, Fehler als `1.0.1` (Release-PR, Produktion holt `latest` von selbst) | Claude, Peter |
| **So 27.12.** tagsüber | Backup, Deploy-Sperre, Probelauf (Abschnitt 4) | Peter |
| **So 27.12.** abends | Draftabend mit v1.0, Push im echten Turnier (Abschnitt 5) | alle |
| Mo 28.12. | Sperre aufheben, Wiederherstellung proben, Feedback sichten, Schlüssel erneuern (Abschnitt 6) | Peter, Claude |

Ab `v1.0.0` bekommt die Produktion nur noch Releases; Merges in `main` landen zuerst auf Beta.

## 1. Gruppe vorbereiten (ab 25.11.)

- [ ] **Heimserver (`~/topstack`):** Der Abend zählt schon zur Saison 2027 (Festlegung vom 22.11.2026). Nach v1.0.1: `infra/ops/admin.sh seasons`, dann `infra/ops/admin.sh season-start "Saison 2027" 2026-12-01 --apply` (Name wie in der Liste).

- [ ] **PC:** Anleitung [„TopStack in 4 Schritten“](https://claude.ai/artifact/9Z6ue547qKEUT9SnKQDY8P) in die Gruppe schicken (vorher teilen oder als Bild/PDF exportieren). Alle installieren die App von `topstack.win`, melden sich an und erlauben Push.
- [ ] Optional, für Probeläufe neuer Versionen: **PC:** Tester für Beta freischalten. Cloudflare → Zero Trust → Access → Applications → „TopStack Beta“ → Richtlinie „Nur Peter“ → Include **Emails**: die Adressen der Mitspieler ergänzen. Die Richtlinie danach ruhig in „Tester“ umbenennen.
- [ ] **Heimserver (`~/topstack-beta`):** dieselben Adressen in `TOPSTACK_MAIL_ALLOWLIST` der Staging-`.env` (kommagetrennt), dann `docker compose -f infra/docker-compose.staging.yml --env-file infra/.env up -d api`. Sonst schickt Beta ihnen keine Anmeldelinks.
- [ ] **Handy (Peter, auf Beta):** Profil → Testgruppe → Einladungslink erzeugen und in die Gruppe schicken. Wer ihn öffnet, landet in der Testgruppe auf Beta.

## 2. Release-Kandidat rc.1 (Mi 25.11.)

- [ ] **Claude:** `scripts/release.sh 1.0.0-rc.1` → Release-PR mit dem Changelog aller Einträge unter „Unreleased“.
- [ ] **PC:** PR mergen. `release.yml` setzt das Tag `v1.0.0-rc.1` und legt den Vorab-Release auf GitHub an. `latest` zeigt nie auf einen Kandidaten.
- [ ] **Handy:** Beta und Produktion zeigen unten **v1.0.0-rc.1** und einmal „Was ist neu“.
- [ ] **Gruppe:** auf Beta ein Testturnier mit allen spielen (Einladung, Plätze, Farben, zwei Runden, Ergebnis korrigieren), Feedback über den Knopf in der App.
- [ ] **PC:** Feedback-Issues sichten. Was den Abend gefährdet, wird behoben und kommt als `1.0.0-rc.2`; der Rest geht nach v1.0.1.

## 3. Release v1.0.0 (Mi 25.11.)

- [ ] **Claude:** `scripts/release.sh 1.0.0` → Release-PR. Der Abschnitt `## [1.0.0]` übernimmt alle Einträge von rc.1, damit der GitHub-Release alles seit 0.9.0 nennt.
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
  infra/ops/admin.sh deploy-lock on
  ```
  Bis zur Aufhebung spielt der Timer nichts mehr ein, auch keine Merges.
- [ ] **Heimserver:** `infra/ops/admin.sh tournaments` zeigt keine Testturniere in der „Draft-Runde“; `infra/ops/admin.sh players` zeigt alle Mitspieler als Mitglied.
- [ ] **Handy (Peter):** Profil → Benachrichtigungen → „Test senden“ kommt an.
- [ ] **Handy:** Gäste ohne Konto spielen per QR-Code als Gast mit (in der Rangliste erscheinen sie nicht).

## 5. Am Abend

Kein Gate mehr: Phase 4 ist seit dem 27.11.2026 abgeschlossen, G3 entfällt. Die Checkliste aus [Phase 3, AP-10](../phase3/README.md#ap-10--abnahme-gate-g3-ca-2-h--verschoben-zum-release-v10) taugt trotzdem als Leitfaden.

- [ ] Push kommt an: „Du bist dran“, neue Runde, Turnierende.
- [ ] Die Turnier-Karte auf der Startseite stimmt bei allen: dran, läuft, Pause mit Vorziehen, nächste Runde.
- [ ] Probleme direkt über „Feedback geben“ melden, mit Screenshot.

## 6. Danach (ab Mo 28.12.)

- [ ] **Heimserver:** Sperre aufheben: `infra/ops/admin.sh deploy-lock off`.
- [ ] **PC (Windows):** Backup vom Abend wiederherstellen, Rangliste stimmt mit der App überein ([Heimserver, Ernstfall auf einem anderen Rechner](../phase3/heimserver.md#ernstfall-auf-einem-anderen-rechner-wiederherstellen)).
- [ ] **PC:** Feedback des Abends sichten, Fehler im Meilenstein v1.0.1.
- [ ] **PC und Heimserver:** Resend-API-Schlüssel und ntfy-Topic erneuern (siehe AP-8).
- [ ] iPhone-Test AP-7 nachholen, sobald ein iPhone da ist.
- [x] **Claude:** Phase-4-Plan aktualisieren, G4 abhaken (27.11.2026; G3 entfällt).

## Wenn etwas schiefgeht

| Problem | Was tun |
| --- | --- |
| Update auf v1.0.0 kaputt | Der Timer rollt selbst zurück und meldet sich per ntfy. Sonst: `TOPSTACK_VERSION=1.0.0-rc.1` (bzw. der letzte gute Kandidat) in `infra/.env`, beim nächsten Lauf ist der alte Stand zurück. Nicht auf 0.9.0: dem fehlt die Datenbank-Migration 0004. |
| Turnier hängt (jemand musste gehen, Matches bleiben offen) | `infra/ops/admin.sh finish-tournament <ID-Anfang>` zeigt, was gestrichen wird; mit `--apply` abschließen. |
| Server fällt am Abend aus | Der Life-Tracker läuft offline weiter. Ergebnisse auf Papier notieren und am nächsten Tag nachtragen. |
| Daten kaputt | `infra/ops/backup.sh list`, dann `infra/ops/restore.sh manual/<Backup vom Nachmittag>`. |
| Jemand kommt nicht rein | Anmeldelink neu schicken lassen; notfalls als Gast per QR-Code mitspielen. |
