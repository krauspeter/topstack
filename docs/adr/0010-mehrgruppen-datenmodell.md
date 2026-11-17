# ADR-0010: Mehrgruppenfähiges Datenmodell ab v1.0

- Status: angenommen
- Datum: 2026-11-15

## Kontext
v1.0 bedient eine Gruppe, v1.1 mehrere mit eigenen Regeln und Rollen. Ein Profil gilt für alle Gruppen, Statistik läuft je Gruppe.

## Entscheidung
- `app_user` ist das Konto (global), `player` ist die Spieleridentität **innerhalb einer Gruppe** (Mitglied, Gast oder Ehemaliger).
- Alle Turnierdaten hängen über `group_id` an einer Gruppe. Gruppenregeln liegen in `group_rules`, Abweichungen pro Turnier in `tournament.settings`.
- In v1.0 wird beim Einrichten genau eine Gruppe angelegt; die Oberfläche blendet die Gruppenauswahl aus.

## Folgen
Gäste und Ehemalige brauchen kein Konto. Ein Gast kann später in ein Profil umgewandelt werden, indem `player.app_user_id` gesetzt wird (UC-18) – die Ergebnisse bleiben am `player` hängen.
