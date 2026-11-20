# ADR-0015: Spieler ohne Konto bis zum Release von v1.0

- Status: angenommen (20.11.2026)
- Datum: 2026-11-20

## Kontext
Bis zum Release von v1.0 hat nur Peter ein Konto (Entscheidung vom 20.11.2026). Gäste zählen laut Festlegung aus Phase 0 nur im jeweiligen Turnier. Ohne weitere Regel stünde nach den Testturnieren in Phase 3 nur Peter in der Rangliste, und Gate G3 („Rangliste für alle sichtbar“) ließe sich nicht sinnvoll prüfen.

## Entscheidung
- Neue Spielerart `reserved` („vorgemerkt“): ein fester Spieler der Gruppe ohne Konto. Der Gruppen-Admin legt ihn mit Anzeigename an.
- Vorgemerkte Spieler zählen wie Mitglieder in Rangliste, Elo und Statistik. Sie lassen sich wie Mitglieder zu Turnieren einladen; zugesagt wird für sie durch den Turnierstarter.
- Eine Einladung kann an einen vorgemerkten Spieler gebunden sein (neue Spalte `invitation.player_id`). Wer sie annimmt, übernimmt diesen Spieler: `app_user_id` wird gesetzt, `kind` wird `member`, die Mitgliedschaft entsteht. Alle Ergebnisse bleiben erhalten.
- Die Prüfung im Schema bleibt eindeutig: `member` hat immer ein Konto, `reserved`, `guest` und `former` nie.
- Umgesetzt in AP-4 (Turnier vorbereiten), Migration 0003.

## Folgen
- Testturniere aus Phase 3 bleiben gültig und gehen in die erste Saison ein.
- Beim Rollout von v1.0 bekommt jeder Freund seinen persönlichen Einladungslink aus der Spielerliste; ein allgemeiner Gruppenlink legt weiterhin einen neuen Spieler an.
- UC-18 (Gast in Profil umwandeln, v1.1) kann denselben Mechanismus nutzen.
