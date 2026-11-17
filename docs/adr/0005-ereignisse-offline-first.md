# ADR-0005: Lebenspunkte als Ereignisse, offline zuerst

- Status: angenommen
- Datum: 2026-11-15

## Kontext
Der Life-Tracker muss bei Funkloch weiterlaufen (N-01). Zwei Handys können dasselbe Match zählen (UC-11), später auch das Steuergerät. Rückgängig, Lebenspunkte-Kurve, Awards und KI brauchen den Verlauf.

## Entscheidung
- Jede Änderung ist ein unveränderliches Ereignis `{id, game_id, player_id, type, delta, seq, device_id, client_ts, source}`.
- `id` ist eine UUIDv7, auf dem Gerät erzeugt. Der Server speichert idempotent (`ON CONFLICT DO NOTHING`).
- Rückgängig ist ein eigenes Ereignis `undo` mit Verweis auf das rückgängig gemachte Ereignis, nichts wird gelöscht.
- Jedes Gerät zählt nur die Lebenspunkte des eigenen Spielers (UC-11). Damit gibt es keine Schreibkonflikte; die Reihenfolge pro Gerät ergibt sich aus `seq`.
- Der Spielstand wird aus den Ereignissen berechnet (Reducer, in App und Backend gleich).

## Alternativen
- Nur Endstand speichern: einfach, aber kein Verlauf, keine Kurve, keine KI-Daten.
- CRDT-Bibliothek: mächtig, aber für „jeder zählt seine eigenen Punkte“ unnötig.

## Folgen
Etwas mehr Daten (geschätzt < 200 Ereignisse pro Spiel, unkritisch). Reducer muss in TypeScript und Python identisch getestet werden.
