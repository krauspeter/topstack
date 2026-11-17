# ADR-0006: Live-Daten über WebSocket, Steuergerät über MQTT

- Status: angenommen
- Datum: 2026-11-15

## Kontext
Live-Ansicht in unter 2 Sekunden (N-04). Das Steuergerät (Phase 6) ist ein ESP32 im WLAN.

## Entscheidung
- Browser bekommen Live-Daten über einen WebSocket (`/ws`) direkt vom Backend.
- Das Steuergerät spricht MQTT mit Mosquitto. Das Backend ist MQTT-Client und übersetzt zwischen MQTT und den gleichen Ereignissen wie aus der App.
- Ereignisse vom Steuergerät haben `source = "hardware"`, sonst gleiches Format.

## Alternativen
- MQTT über WebSocket auch im Browser: ein Protokoll, aber Rechteprüfung pro Turnier wird schwieriger.
- Bluetooth direkt zum Handy: geht in Safari nicht.

## Folgen
Zwei Kanäle, aber jeder mit dem passenden Werkzeug. MQTT-Topics sind ab Phase 1 festgelegt, damit Phase 6 parallel starten kann.
