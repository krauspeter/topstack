# Phase 3 – Testplan

Stand: 18.11.2026 · gehört zu [Phase 3](README.md)

## 1. Testebenen

| Ebene | Werkzeug | Was | Wo |
| --- | --- | --- | --- |
| Domäne | pytest, Vitest | Regeln ohne Datenbank: Spielplan, Tabelle, Zustände, Lebenspunkte | CI, lokal |
| API | pytest + httpx, echtes PostgreSQL 16 | Endpunkte, Rechte, Transaktionen, Idempotenz | CI (Service-Container), lokal mit Docker |
| Migration | Alembic | `upgrade head` auf leerer Datenbank, `alembic check` gegen die Modelle | CI |
| App | Vitest | Outbox, Sync, Zusammenführen von Ereignissen | CI, lokal |
| Ende-zu-Ende | Playwright (Android- und iPhone-Ansicht, WebKit in der CI) | Abläufe im Browser gegen API-Container | CI |
| Gerät | Android-Handy über `https://topstack.win` | Installieren, Push, Offline, zwei Handys | manuell nach jedem AP ab AP-2 |
| iPhone | iPhone über Safari | wie Gerät | **Phase 4**, letzter Schritt vor v1.0 |

## 2. Testdaten

- Gruppe „Testgruppe“ mit Regeln aus `group_rules` (3/1/0, Bonus 2/1, Best-of-3, 20 Leben).
- Spieler: Anna, Ben, Chris, Dana (Mitglieder), Eli (Gast).
- 5 Spieler, damit ungerade Zahl und Pausen immer mitgetestet werden.
- Für Tiebreaker die Matchdaten aus `server/tests/domain/test_standings.py` wiederverwenden.

## 3. Testfälle

Pflicht in Phase 3: alle Fälle mit Priorität **hoch**. Jeder Fall hängt an einem Arbeitspaket (AP).

### Anmeldung und Einladung (AP-3)

| ID | Fall | Erwartung | Prio |
| --- | --- | --- | --- |
| TC-01 | Magic-Link anfordern und einlösen | Sitzungs-Cookie gesetzt, `/me` liefert Profil | hoch |
| TC-02 | Magic-Link zweimal oder nach 15 min benutzen | `410 Gone`, keine Sitzung | hoch |
| TC-03 | Passkey anlegen, abmelden, mit Passkey anmelden | Anmeldung ohne E-Mail | hoch |
| TC-04 | Einladungslink in die Gruppe annehmen (UC-02) | Mitglied mit Rolle `member`, Spieler angelegt | hoch |
| TC-05 | Geschützte Route ohne Sitzung | `401` | hoch |
| TC-06 | Profil ändern: Anzeigename, Lieblingsfarben `UR` | gespeichert, `favorite_colors` gültig | mittel |

### Turnier vorbereiten (AP-4)

| ID | Fall | Erwartung | Prio |
| --- | --- | --- | --- |
| TC-10 | Turnier ohne Set-Kürzel starten | `422` | hoch |
| TC-11 | Zweites offenes Turnier in derselben Gruppe | `409` | hoch |
| TC-12 | Mitglieder einladen, Zusage, Absage | Status `accepted` bzw. `declined` | hoch |
| TC-13 | Gast scannt QR-Code und gibt Namen ein (UC-05) | Spieler `guest`, nur in diesem Turnier | hoch |
| TC-14 | Teilnehmer vor der Auslosung entfernen | Status `removed` | mittel |
| TC-15 | Auslosen (UC-06) | jeder Platz genau einmal, Status `seated`, Anmeldung zu | hoch |
| TC-16 | Neu auslosen | neue Plätze, neue Animation bei allen | mittel |
| TC-17 | Einladen nach der Auslosung | `409` | hoch |
| TC-18 | Farben melden `WU`, dann farblos `""` (UC-07) | gespeichert, sofort bei allen sichtbar | hoch |
| TC-19 | Nicht-Starter versucht auszulosen | `403` | hoch |

### Turnierablauf und Ergebnisse (AP-5)

| ID | Fall | Erwartung | Prio |
| --- | --- | --- | --- |
| TC-20 | Runde 1 starten mit 5 Spielern (UC-08) | 5 Runden, je 2 Matches und 1 Pause, jeder spielt jeden genau einmal | hoch |
| TC-21 | Nächste Runde bei offenem Match ohne Bestätigung | `409` mit Warnung; mit Bestätigung erlaubt (UC-15) | hoch |
| TC-22 | Zwei freie Spieler, offenes Match vorhanden (UC-09) | Vorschlag: längste Pause zuerst; nach Bestätigung Plan neu verteilt | hoch |
| TC-23 | Ergebnis 2:1 eintragen (UC-13) | Match `finished`, Tabelle aktualisiert | hoch |
| TC-24 | Ergebnis 1:1 nach Zeit | Unentschieden, je 1 Matchpunkt | hoch |
| TC-25 | Ergebnis korrigieren (UC-14) | Eintrag in `match_correction`, Gegner bekommt Nachricht | hoch |
| TC-26 | Zwei Handys korrigieren gleichzeitig | eines erfolgreich, das andere `409` mit aktuellem Stand | hoch |
| TC-27 | Dritter Spieler ändert fremdes Ergebnis | `403` | hoch |
| TC-28 | Pausieren und an anderem Tag fortsetzen (UC-16) | Stand unverändert, Runden laufen weiter | mittel |
| TC-29 | Letztes Ergebnis eingetragen (UC-17) | Status `finished`, Endplätze und Ranglistenpunkte festgeschrieben | hoch |
| TC-30 | Gleichstand nach allen Tiebreakern | Aufforderung zum W20-Wurf vor dem Abschluss | mittel |
| TC-31 | Korrektur nach Turnierende | `409` | hoch |
| TC-32 | Turnier vor Runde 1 abbrechen | Status `cancelled`, zählt nicht für die Rangliste | mittel |
| TC-32a | Abbruch ab Runde 1 per Abstimmung, 5 Teilnehmer | Starter beantragt (zählt als 1. Bestätigung); bei 2 Bestätigungen noch `running`, bei der 3. `cancelled`; zählt nicht für die Rangliste | hoch |
| TC-32b | Abbruch ab Runde 1 durch einfachen Teilnehmer | Antrag wird mit `403` abgelehnt | mittel |
| TC-32c | Antrag zurückziehen und Bestätigung zurücknehmen | Antrag weg bzw. Zähler sinkt; Turnier läuft weiter | mittel |
| TC-32d | Gruppen-Admin bricht ab Runde 1 direkt ab | `cancelled` ohne Abstimmung | mittel |

### Life-Tracker am Server (AP-6)

| ID | Fall | Erwartung | Prio |
| --- | --- | --- | --- |
| TC-40 | Match mit einem Handy (`shared`) spielen | Ereignisse auf dem Server, Ergebnis automatisch (F-11) | hoch |
| TC-41 | Zweites Handy koppeln (UC-11) | jedes Handy zählt nur den eigenen Spieler, beide sehen alles | hoch |
| TC-42 | Handy A im Flugmodus, 10 Änderungen, wieder online | alle 10 Ereignisse kommen an, Stand überall gleich (N-01) | hoch |
| TC-43 | Dasselbe Ereignis dreimal senden | einmal gespeichert, zweimal `duplicates` | hoch |
| TC-41a | Modus `dual`: zweites Handy fehlt, dann würfelt jeder selbst | Würfeln erst, wenn beide da sind; nur der eigene W20; Gleichstand → beide neu; Platz übernehmen nur mit Bestätigung | hoch |
| TC-44 | Handy B sendet Lebenspunkte für Spieler A im Modus `dual` | Ereignis im Stapel abgelehnt (`rejected` mit Grund), der Rest wird gespeichert | hoch |
| TC-45 | Beide Handys melden widersprüchliches Spielende | erstes gilt, zweites `rejected`, Hinweis in der App | mittel |
| TC-46 | Spielende mit Grund `concede` und `time` | `game.end_reason` gespeichert | mittel |
| TC-47 | Lokales Match ohne Turnier | bleibt lokal, kein Upload | mittel |

### Live-Ansicht (AP-7)

| ID | Fall | Erwartung | Prio |
| --- | --- | --- | --- |
| TC-50 | Lebenspunkt ändern, Zuschauer im Turnier | Anzeige in unter 2 s (N-04) | hoch |
| TC-51 | WebSocket bricht ab und kommt wieder | Stand per REST nachgeladen, kein doppelter Eintrag | hoch |
| TC-52 | Pause-Ansicht | Lebenspunkte anderer Matches, Tabelle, Bilanz gegen nächsten Gegner | mittel |
| TC-53 | Nicht-Teilnehmer abonniert ein Turnier | abgelehnt | hoch |

### Push (AP-8)

| ID | Fall | Erwartung | Prio |
| --- | --- | --- | --- |
| TC-60 | „Du bist dran“ bei geschlossener App (Android) | Benachrichtigung kommt an | hoch |
| TC-61 | Ereignis „neue Runde“ abgeschaltet | keine Benachrichtigung | mittel |
| TC-62 | Abgelaufenes Push-Abo | wird beim Senden entfernt | mittel |

### Rangliste und Statistik (AP-9)

| ID | Fall | Erwartung | Prio |
| --- | --- | --- | --- |
| TC-70 | Rangliste nach zwei Turnieren | Punkte stimmen mit Handrechnung nach der Punkte-Tabelle | hoch |
| TC-71 | Filter Saison 2027 | nur Turniere der Saison | mittel |
| TC-72 | Gast in der Rangliste | erscheint nicht in der Gruppen-Rangliste | hoch |
| TC-73 | Abgebrochenes Turnier | zählt nicht | mittel |
| TC-74 | Spielerstatistik | Turniersiege, Platzierungen, Siegquoten, Farben korrekt | mittel |

### Betrieb (AP-2)

| ID | Fall | Erwartung | Prio |
| --- | --- | --- | --- |
| TC-80 | `https://topstack.win` öffnen | App lädt, Zertifikat gültig | hoch |
| TC-81 | `/api/v1/health` | `{"status":"ok"}` | hoch |
| TC-82 | Container neu starten | Daten bleiben erhalten, Migration läuft ohne Fehler | hoch |
| TC-83 | Port 5432 und 1883 von außen | nicht erreichbar | hoch |

## 4. Abnahmeszenario Gate G3

Ein echter Spieleabend mit der Gruppe. Abgenommen ist G3, wenn alle Schritte ohne Eingriff in die Datenbank gelingen.

1. Turnierstarter startet ein Draft-Turnier mit dem Set des Abends.
2. Mitglieder werden aus der Liste eingeladen, ein Gast tritt per QR-Code bei.
3. Plätze werden ausgelost; alle sehen die Tischgrafik mit Passrichtung.
4. Nach dem Deckbau melden alle ihre Farben.
5. Runde 1 wird gestartet; mindestens ein Match läuft mit zwei Handys, eines mit einem Handy, eines ohne Tracker (Ergebnis direkt eingetragen).
6. Ein Match wird vorgezogen, ein Ergebnis wird korrigiert.
7. Das Turnier wird bis zur Siegerehrung gespielt.
8. Die Rangliste zeigt die Ranglistenpunkte aller Mitglieder; der Gast taucht nicht in der Gruppen-Rangliste auf.

Ergebnisse, Fehler und Wünsche werden direkt danach als GitHub Issues erfasst.
