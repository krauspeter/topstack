# ADR-0013: Zustände eines Turniers und Berechtigungen

- Status: angenommen (18.11.2026)
- Datum: 2026-11-18

## Kontext
Ein Draft-Turnier durchläuft mehrere Abschnitte: Einladen, Auslosen, Draften, Spielen, eventuell Pausieren, Abschluss. Mehrere Handys ändern gleichzeitig denselben Stand. Das Schema kennt dafür `tournament_status` (`setup`, `seated`, `drafting`, `running`, `paused`, `finished`), aber noch keine Regeln, welche Übergänge erlaubt sind und wer sie auslösen darf.

## Entscheidung

**Zustandsautomat**

```mermaid
stateDiagram-v2
    [*] --> setup: Turnier starten (UC-03)
    setup --> seated: Plätze auslosen (UC-06)
    seated --> seated: neu auslosen
    seated --> drafting: Draft beginnen
    drafting --> running: Runde 1 starten (UC-08)
    running --> paused: pausieren (UC-16)
    paused --> running: fortsetzen
    running --> finished: letztes Ergebnis eingetragen (UC-17)
    setup --> cancelled: abbrechen
    seated --> cancelled: abbrechen
    drafting --> cancelled: abbrechen
    running --> cancelled: abbrechen (nur Admin)
    paused --> cancelled: abbrechen (nur Admin)
```

| Übergang | Wer darf | Bedingung |
| --- | --- | --- |
| Turnier starten | jedes Mitglied | Set-Kürzel gesetzt, kein anderes offenes Turnier in der Gruppe |
| Einladen, Gäste zulassen, Teilnehmer entfernen | Turnierstarter | Status `setup` |
| Plätze auslosen, neu auslosen | Turnierstarter | mindestens 2 zugesagte Teilnehmer; schließt die Anmeldung |
| Draft beginnen | Turnierstarter | Status `seated` |
| Farben melden | jeder Teilnehmer für sich | Status `seated`, `drafting` oder `running` |
| Runde 1 und jede weitere Runde starten | jeder Teilnehmer | bei offenen Matches nur mit Bestätigung der Warnung (UC-15) |
| Pausieren, fortsetzen | jeder Teilnehmer | – |
| Ergebnis eintragen, korrigieren | die beiden Spieler des Matches, Gruppen-Admin | bis Status `finished`; jede Korrektur landet in `match_correction` |
| Abbrechen | Turnierstarter, Gruppen-Admin | vor Runde 1; danach nur durch den Admin. Ein abgebrochenes Turnier zählt nicht für Rangliste und Statistik |

**Abschluss**
- Sind alle Matches des Spielplans beendet, setzt der Server das Turnier auf `finished`, berechnet die Tabelle und schreibt `final_place` und `ranking_points` in `tournament_entry` fest.
- Ergibt die Tabelle nach allen Tiebreakern noch Gleichstand (`needs_roll`), fordert die App die betroffenen Spieler zum W20-Wurf auf, bevor der Abschluss gilt.
- Nach `finished` sind keine Korrekturen mehr möglich (UC-14: „bis Turnierende“).

**Gleichzeitige Änderungen**
- `match` bekommt eine Spalte `version int NOT NULL DEFAULT 0`. Ergebnis-Änderungen schicken die bekannte Version mit; passt sie nicht, antwortet der Server mit `409 Conflict` und dem aktuellen Stand.
- Zustandswechsel des Turniers laufen in einer Transaktion mit `SELECT … FOR UPDATE` auf der Turnierzeile.

**Umsetzung**
- Die Übergänge liegen als reine Funktion in `server/topstack/domain/tournament.py` (ohne Datenbank, wie die übrige Domänenlogik) und sind vollständig durch Unit-Tests abgedeckt.
- Jeder erfolgreiche Übergang erzeugt eine WebSocket-Nachricht (`tournament.updated`, `round.started`, `seating.drawn` …).

## Alternativen
- **Ein fester Turnierleiter, der alles bestätigt:** einfacher zu prüfen, widerspricht aber den Use Cases, nach denen jeder die nächste Runde starten und Ergebnisse eintragen darf.
- **Letzte Änderung gewinnt, ohne Version:** einfacher, aber stille Überschreibungen bei zwei Handys sind genau der Fehler, den die Gruppe merken würde.

## Folgen
- Migration ergänzt `match.version` und den Status `cancelled` in `tournament_status`; der Teilindex `one_open_tournament_per_group` schließt `cancelled` aus. `docs/schema.sql` wird danach aus der Migration aktualisiert.
- Der Status `drafting` ist optional nutzbar: Wer ohne Draft-Timer spielt, kann direkt von `seated` auf Runde 1 gehen; der Server setzt dann `drafting` implizit.
