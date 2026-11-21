# ADR-0006: Live-Daten über WebSocket, Steuergerät über MQTT

- Status: angenommen
- Datum: 2026-11-15

## Kontext
Live-Ansicht in unter 2 Sekunden (N-04). Das Steuergerät (Phase 6) ist ein ESP32 im WLAN.

## Entscheidung
- Browser bekommen Live-Daten über einen WebSocket (`/ws`) direkt vom Backend.
- Das Steuergerät spricht MQTT mit Mosquitto. Das Backend ist MQTT-Client und übersetzt zwischen MQTT und den gleichen Ereignissen wie aus der App.
- Ereignisse vom Steuergerät haben `source = "hardware"`, sonst gleiches Format.

## Umsetzung in AP-7 (ergänzt am 21.11.2026)
- Ein Thema pro Turnier (`tournament:<id>`), keine eigenen Themen pro Spiel. Nachrichten sind Hinweise (`tournament.updated`, `game.events`); die App lädt den Stand per REST. So gibt es nur eine Quelle der Wahrheit, und ein verpasster Hinweis schadet nicht.
- Der Verteiler liegt im Speicher des einen API-Prozesses (`topstack/live.py`). Wer nicht innerhalb von 2 Sekunden annimmt, wird abgemeldet und lädt beim Wiederverbinden nach. Bei mehreren Prozessen kommt PostgreSQL `LISTEN/NOTIFY` dazu.
- Die App lädt weiter zur Sicherheit nach: Turnierseite alle 30 s, Tracker alle 10 s; ohne WebSocket wie bisher alle 5 bzw. 2 s.

## Alternativen
- MQTT über WebSocket auch im Browser: ein Protokoll, aber Rechteprüfung pro Turnier wird schwieriger.
- Bluetooth direkt zum Handy: geht in Safari nicht.

## Folgen
Zwei Kanäle, aber jeder mit dem passenden Werkzeug. MQTT-Topics sind ab Phase 1 festgelegt, damit Phase 6 parallel starten kann.
