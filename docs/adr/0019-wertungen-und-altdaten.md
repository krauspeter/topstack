# ADR-0019: Elo, Head-to-Head und Awards aus der Historie; Altdaten als Importläufe

- Status: angenommen (27.11.2026)
- Datum: 2026-11-27

## Kontext
v1.1 bringt Elo, Head-to-Head und Awards sowie den Import alter Turniere (30 bis 150 Stück, Befragung vom 27.11.2026). Ergebnisse lassen sich bis Turnierende korrigieren (UC-14), Spieler werden zusammengeführt, Importe sollen sich pro Lauf zurücknehmen lassen. Das Schema enthält seit Phase 1 eine Tabelle `elo_rating (player_id, scope)`. Sie passt nicht zur globalen Elo, weil `player` zu einer Gruppe gehört und die globale Elo zum Konto.

## Entscheidung
- **Elo wird berechnet, nicht fortgeschrieben:** Eine reine Funktion in `server/topstack/domain/elo.py` rechnet aus der zeitlich sortierten Liste der Matches die Elo (Start 1000, K = 40 in den ersten 10 Matches, danach 32, Unentschieden 0,5). Gäste und importierte Turniere zählen nicht (Roadmap). Es zählen alle Matches seit v1.0 (Befragung vom 27.11.2026).
  - **Gruppen-Elo** je `player`, **globale Elo** je Konto über alle Gruppen. Spieler ohne Konto haben nur die Gruppen-Elo.
  - Korrekturen, Zusammenführen und Importe brauchen keine Nachbearbeitung: Die nächste Abfrage rechnet neu. Bei einigen hundert Matches dauert das Millisekunden. Ein Zwischenspeicher im Prozess wird bei jedem Ergebnis ungültig.
  - Die Tabelle `elo_rating` wird entfernt (Migration).
- **Head-to-Head** ebenso aus den Matches, ab dem ersten Match. Importierte Matches zählen mit, weil sie echte Ergebnisse sind. Die Anzeige markiert sie.
- **Awards werden beim Turnierende berechnet und gespeichert** (Tabelle `award`). Sie hängen an Ereignissen, die sich danach nicht mehr ändern. Ein Admin-Befehl rechnet sie für ein Turnier neu. Die Abstimmung „Spieler des Abends“ speichert Stimmen in `award_vote`.
- **Altdaten als Importlauf:** Tabelle `import_run` (Gruppe, Admin, Zeitpunkt, Quelle, `undone_at`). Jedes importierte Turnier ist ein normales `tournament` mit `imported = true` und `import_run_id`. Ehemalige Spieler werden als `player.kind = 'former'` angelegt. Zurücknehmen löscht alle Turniere des Laufs und die Ehemaligen, die sonst nirgends vorkommen.
  - Der Import läuft in zwei Schritten: Prüfen (Vorschau mit Fehlerliste, nichts gespeichert) und Übernehmen (eine Transaktion).
  - Unbekanntes Set heißt `UNK`. Importierte Turniere zählen in die Saison ihres Datums und in die ewige Tabelle.

## Alternativen
- **Elo fortschreiben (Tabelle aktualisieren):** schnellere Abfrage, aber jede Korrektur, jedes Zusammenführen und jeder rückgenommene Import müsste die Elo aller späteren Matches neu schreiben.
- **Awards immer live berechnen:** Abstimmungen und neue Award-Regeln würden alte Abende nachträglich verändern.
- **Altdaten nur als Ranglisten-Einträge ohne Turniere:** einfacher, aber Head-to-Head und Statistik pro Set gingen verloren.

## Folgen
- Migrationen: `elo_rating` entfernen; `import_run`, `tournament.import_run_id`, `award_vote` anlegen.
- `docs/schema.sql` und `docs/datenmodell.md` werden angepasst.
- Wird die Datenmenge mit v4.0 groß, kommt ein gespeicherter Stand pro Saison dazu. Die Rechenfunktion bleibt dieselbe.
