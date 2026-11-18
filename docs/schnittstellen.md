# TopStack – Schnittstellen

Version der Schnittstelle: `v1` (Präfix `/api/v1`). Die genaue OpenAPI-Beschreibung erzeugt FastAPI unter `/api/v1/docs`; dieses Dokument ist der abgestimmte Entwurf dafür.

Alle Zeiten in ISO 8601 UTC. Alle IDs sind UUIDs. Fehler als [RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457) (`application/problem+json`).

## 1. REST-API

### Anmeldung

| Methode | Pfad | Zweck |
| --- | --- | --- |
| POST | `/auth/magic-link` | Magic-Link an E-Mail senden |
| GET | `/auth/magic-link/{token}` | Link einlösen, setzt Sitzungs-Cookie |
| POST | `/auth/passkey/register/options` · `/register/verify` | Passkey anlegen |
| POST | `/auth/passkey/login/options` · `/login/verify` | Mit Passkey anmelden |
| POST | `/auth/logout` | Sitzung beenden |
| GET | `/me` | Eigenes Profil, Gruppen, Rollen |
| PATCH | `/me` | Anzeigename, Avatar, Lieblingsfarben |

### Gruppen und Spieler

| Methode | Pfad | Zweck | Wer |
| --- | --- | --- | --- |
| GET | `/groups/{gid}` | Gruppe mit Regeln | Mitglied |
| PATCH | `/groups/{gid}/rules` | Regeln ändern | Admin |
| POST | `/groups/{gid}/invitations` | Einladungslink erzeugen | Admin |
| POST | `/invitations/{token}/accept` | Einladung annehmen (UC-02) | angemeldet |
| GET | `/groups/{gid}/players` | Spielerliste | Mitglied |

### Turniere

| Methode | Pfad | Zweck | UC |
| --- | --- | --- | --- |
| POST | `/groups/{gid}/tournaments` | Turnier starten (`set_code` Pflicht) | UC-03 |
| GET | `/tournaments/{tid}` | Turnier mit Teilnehmern, Runden, Matches | – |
| POST | `/tournaments/{tid}/entries` | Mitglieder einladen | UC-04 |
| DELETE | `/tournaments/{tid}/entries/{pid}` | Teilnehmer vor der Auslosung entfernen | UC-04 |
| POST | `/tournaments/{tid}/guest-link` | QR-Code-/Link-Token für Gäste | UC-05 |
| POST | `/guest/{token}` | Gast tritt mit Namen bei | UC-05 |
| POST | `/tournaments/{tid}/seating` | Draftplätze auslosen (erneut = neu auslosen) | UC-06 |
| PUT | `/tournaments/{tid}/entries/{pid}/colors` | Farben melden, z. B. `"UB"` | UC-07 |
| POST | `/tournaments/{tid}/rounds/next` | Nächste Runde starten (bei Runde 1 wird der Spielplan erzeugt) | UC-08, UC-15 |
| GET | `/tournaments/{tid}/suggestions` | Offene Matches für freie Spieler | UC-09 |
| POST | `/matches/{mid}/pull-forward` | Match vorziehen | UC-09 |
| POST | `/tournaments/{tid}/pause` · `/resume` | Pausieren und fortsetzen | UC-16 |
| GET | `/tournaments/{tid}/standings` | Turniertabelle | – |

### Matches, Spiele, Ereignisse

| Methode | Pfad | Zweck | UC |
| --- | --- | --- | --- |
| POST | `/matches/{mid}/start` | Match starten, `tracker_mode` = `shared` / `dual` | UC-10 |
| PUT | `/matches/{mid}/games/{gameId}` | Spiel anlegen/abschließen (ID vom Gerät, idempotent) | – |
| POST | `/games/{gameId}/events` | Stapel von Ereignissen hochladen (idempotent) | UC-10, UC-11 |
| GET | `/games/{gameId}/events?after_seq=` | Ereignisse nachladen | UC-11 |
| PUT | `/matches/{mid}/result` | Ergebnis bestätigen oder direkt eintragen | UC-12, UC-13 |
| PATCH | `/matches/{mid}/result` | Ergebnis korrigieren (wird protokolliert) | UC-14 |

**Ereignis-Stapel (`POST /games/{gameId}/events`)**

```json
{
  "events": [
    {
      "id": "0193a1b2-7c4e-7a10-9c2b-5d1e6f7a8b90",
      "player_id": "3f1c…",
      "type": "life",
      "delta": -3,
      "device_id": "pwa-6b2f",
      "seq": 17,
      "client_ts": "2027-01-20T19:42:11.250Z",
      "source": "app"
    }
  ]
}
```

Antwort `200`: `{ "accepted": ["0193…"], "duplicates": [] }`. Bekannte IDs landen in `duplicates`, das ist kein Fehler.

Ereignisarten: `game_start`, `die_roll` (`value` 1–20), `life` (`delta` ≠ 0), `undo` (`undo_of`), `game_end`.

### Rangliste und Statistik

| Methode | Pfad | Zweck |
| --- | --- | --- |
| GET | `/groups/{gid}/leaderboard?season=&from=&to=` | Rangliste (Punkte, Summe und Schnitt der Matchpunkte) |
| GET | `/groups/{gid}/stats` | Gruppenstatistik |
| GET | `/players/{pid}/stats` | Spielerstatistik |
| GET | `/players/{pid}/head-to-head/{otherId}` | Direktvergleich |

### Push

| Methode | Pfad | Zweck |
| --- | --- | --- |
| GET | `/push/vapid-key` | Öffentlicher VAPID-Schlüssel |
| POST | `/push/subscriptions` | Abo speichern |
| PUT | `/me/notifications/{event}` | Ereignis ein-/ausschalten |

## 2. WebSocket

Pfad `/ws`, Anmeldung über das Sitzungs-Cookie (Gäste: `?guest_token=`). Nachrichten sind JSON mit `type`.

Client → Server:

```json
{ "type": "subscribe", "topic": "tournament:<tid>" }
{ "type": "subscribe", "topic": "game:<gameId>" }
{ "type": "unsubscribe", "topic": "game:<gameId>" }
```

Server → Client:

| `type` | Inhalt | Auslöser |
| --- | --- | --- |
| `game.events` | `{ game_id, events: [...] }` | Neue Ereignisse (Lebenspunkte live) |
| `match.updated` | Match mit Status und Ergebnis | Start, Ergebnis, Korrektur |
| `round.started` | Runde mit Paarungen und Pause | Nächste Runde |
| `standings.updated` | Tabelle | Jedes Ergebnis |
| `seating.drawn` | Plätze mit Animations-Seed | Auslosung |
| `entry.colors` | Spieler und Farben | Farben gemeldet |
| `tournament.updated` | Status | Pause, Fortsetzen, Ende |

Nach einem Verbindungsabbruch holt die App den Stand per REST nach und abonniert neu. Ziel: Ende-zu-Ende unter 2 Sekunden (N-04).

## 3. MQTT (Steuergerät, ab Phase 6)

Broker Mosquitto, nur im Heimnetz erreichbar, Anmeldung pro Gerät mit Benutzer und Passwort, später TLS. Nutzlast JSON, UTF-8.

| Topic | Richtung | QoS | Retain | Inhalt |
| --- | --- | --- | --- | --- |
| `topstack/v1/devices/{deviceId}/status` | Gerät → Server | 1 | ja | `{ "online": true, "fw": "0.1.0", "battery": 87 }`, Last Will `{ "online": false }` |
| `topstack/v1/devices/{deviceId}/events` | Gerät → Server | 1 | nein | Ereignis im gleichen Format wie REST, `source: "hardware"` |
| `topstack/v1/devices/{deviceId}/ack` | Server → Gerät | 1 | nein | `{ "ids": ["…"] }` – Gerät löscht bestätigte Ereignisse aus seinem Puffer |
| `topstack/v1/devices/{deviceId}/binding` | Server → Gerät | 1 | ja | Aktuelles Spiel: `{ "game_id", "players": [{ "id", "name", "seat": "a" }] }` oder `{}` |
| `topstack/v1/games/{gameId}/state` | Server → Gerät | 0 | ja | `{ "life": { "<playerId>": 14, … }, "game_no": 2, "score": "1:0" }` |

Ablauf: Das Handy koppelt das Steuergerät per QR-Code mit dem Match (REST `POST /matches/{mid}/devices`). Der Server schreibt `binding`, das Gerät sendet ab dann Ereignisse. Bei WLAN-Ausfall puffert das Gerät mit fortlaufender `seq` und sendet nach, bis ein `ack` kommt.

## 4. Ergänzungen für Phase 3 (Entwurf, 18.11.2026)

Aus der Planung von [Phase 3](phase3/README.md) und ADR-0012 und ADR-0013. Sie werden mit dem jeweiligen Arbeitspaket in die Tabellen oben übernommen.

| Methode | Pfad | Zweck | AP |
| --- | --- | --- | --- |
| GET | `/groups/{gid}/tournaments?status=` | Turniere der Gruppe, offenes zuerst (Startseite der App) | AP-4 |
| POST | `/tournaments/{tid}/draft` | Draft beginnen (`seated` → `drafting`) | AP-4 |
| POST | `/tournaments/{tid}/cancel` | Turnier abbrechen (`cancelled`, ADR-0013) | AP-5 |
| GET | `/tournaments/{tid}/live` | Kompletter Live-Stand in einem Aufruf: Runden, Matches, Lebenspunkte, Tabelle. Für das Nachladen nach einem Verbindungsabbruch | AP-7 |
| POST | `/tournaments/{tid}/tiebreak-roll` | W20-Wurf bei Gleichstand nach allen Tiebreakern | AP-5 |

**Präzisierungen**

- `PUT /matches/{mid}/games/{gameId}` nimmt `{ "number", "starting_player_id", "starting_life" }` beim Anlegen und `{ "winner_player_id", "end_reason" }` beim Abschluss. `end_reason` ist `life_zero`, `concede`, `time` oder `manual`; Unentschieden = `winner_player_id: null` mit `end_reason: "time"`.
- `game_end` im Ereignis-Stapel trägt `reason` mit denselben Werten (ADR-0012).
- `PUT` und `PATCH /matches/{mid}/result` verlangen die bekannte `version` des Matches. Passt sie nicht, antwortet der Server mit `409 Conflict` und dem aktuellen Match (ADR-0013).
- `POST /tournaments/{tid}/rounds/next` mit offenen Matches antwortet `409` und einer Liste der offenen Matches; mit `{ "confirm_open_matches": true }` wird die Runde trotzdem gestartet (UC-15).
- Der WebSocket sendet alle 25 Sekunden `{ "type": "ping" }`; die App antwortet mit `pong`. Bleibt der Ping aus, baut die App neu auf.
