# ADR-0012: Synchronisation zwischen App und Server

- Status: vorgeschlagen
- Datum: 2026-11-18

## Kontext
In Phase 2 speichert die App jedes Match nur lokal in IndexedDB. In Phase 3 sollen Turnier-Matches auf dem Heimserver landen, live bei allen sichtbar sein und auch dann weiterlaufen, wenn WLAN oder Server kurz weg sind (N-01, N-04). ADR-0005 legt fest, dass Lebenspunkte unveränderliche Ereignisse mit Geräte-UUIDv7 sind und der Server idempotent speichert.

Offene Punkte aus Phase 2:
- Die App vergibt lokale Spieler-IDs (`p1`, `p2`), der Server arbeitet mit `player.id` (UUID).
- Ein Spielende hat in der App keinen Grund; der Server kennt `game.end_reason`.
- Ein Unentschieden nach Zeitablauf ist in der App `game_end` mit `playerId = null`.

## Entscheidung

**Outbox in der App**
- Jedes Ereignis wird zuerst lokal gespeichert und zusätzlich in eine Tabelle `outbox` in IndexedDB geschrieben.
- Ein Sync-Dienst sendet die Outbox als Stapel an `POST /api/v1/games/{gameId}/events`, sobald eine Verbindung besteht: sofort nach jeder Änderung (gebündelt über 300 ms), beim Wiederverbinden und beim Öffnen der App.
- Bestätigte IDs (`accepted` und `duplicates`) werden aus der Outbox gelöscht. Unbestätigte bleiben und werden später erneut gesendet; doppelte Sendungen sind harmlos.
- Die Anzeige hängt nie vom Server ab: Der Spielstand wird immer lokal aus den Ereignissen berechnet.

**IDs**
- Turnier-Matches benutzen von Anfang an die Server-IDs: `match.id`, `player.id`. Die App lädt sie beim Start des Matches.
- `game.id` und alle Ereignis-IDs erzeugt die App (UUIDv7), damit ein Spiel offline beginnen kann. `PUT /matches/{mid}/games/{gameId}` ist idempotent.
- Lokale Matches ohne Turnier (wie in Phase 2) behalten ihre lokalen IDs und werden **nicht** hochgeladen.

**Spielende**
- Das Ereignis `game_end` bekommt in der App ein Feld `reason`: `life_zero`, `concede`, `time` oder `manual`.
- Beim Hochladen setzt der Server `game.winner_player_id` und `game.end_reason`. Unentschieden = `winner_player_id IS NULL` und `end_reason = 'time'`.
- Das Matchergebnis (`games_a`, `games_b`, `games_drawn`) berechnet der Server aus den Spielen (F-11). Die App zeigt es an, schreibt es aber nicht selbst.

**Zwei Handys (UC-11)**
- Jedes Handy sendet nur Ereignisse für den eigenen Spieler (ADR-0005) und empfängt die des Gegners über den WebSocket (`game.events`).
- `game_start` und `game_end` darf jedes der beiden Handys senden. Kommt dasselbe Spielende zweimal, gilt das erste; ein widersprüchliches zweites wird mit `409 Conflict` abgelehnt und in der App als Hinweis gezeigt.

**Wiederverbinden**
- Nach einem Abbruch lädt die App `GET /games/{gameId}/events?after_seq=` pro Gerät nach, führt die Ereignisse mit `mergeEvents` zusammen und abonniert neu.

## Alternativen
- **Direkt an den Server schreiben, ohne lokale Kopie:** einfacher, aber bei Funkloch geht das Spiel verloren (verletzt N-01).
- **Hintergrund-Sync per Service Worker (Background Sync API):** wird von Safari auf dem iPhone nicht unterstützt; die Outbox im Vordergrund funktioniert überall.
- **Lokale Matches nachträglich zuordnen:** möglich, aber fehleranfällig (welcher lokale Spieler ist welcher Server-Spieler?). Kann bei Bedarf später als eigener Use Case kommen.

## Folgen
- Neue Dexie-Tabelle `outbox`, Version 2 der lokalen Datenbank mit Migration.
- `GameEvent` in der App bekommt `reason` für `game_end`; der Reducer in TypeScript und Python muss weiter identisch getestet werden.
- Der Server braucht eine Validierung pro Ereignis: Spieler gehört zum Match, Gerät zählt nur eigenen Spieler im Modus `dual`, `seq` steigt.
