# TopStack – Schnittstellen

Version der Schnittstelle: `v1` (Präfix `/api/v1`). Die genaue OpenAPI-Beschreibung erzeugt FastAPI unter `/api/v1/docs`; dieses Dokument ist der abgestimmte Entwurf dafür.

Alle Zeiten in ISO 8601 UTC. Alle IDs sind UUIDs. Fehler als [RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457) (`application/problem+json`).

## 1. REST-API

### Anmeldung

| Methode | Pfad | Zweck |
| --- | --- | --- |
| POST | `/auth/magic-link` | Magic-Link an E-Mail senden; Body `{email, invitation?}`, Antwort immer `202` |
| POST | `/auth/magic-link/verify` | Link einlösen, setzt Sitzungs-Cookie; Body `{token, invitation?}`, `410` wenn abgelaufen oder benutzt |
| POST | `/auth/passkey/register/options` · `/register/verify` | Passkey anlegen |
| POST | `/auth/passkey/login/options` · `/login/verify` | Mit Passkey anmelden |
| POST | `/auth/logout` | Sitzung beenden |
| GET | `/me` | Eigenes Profil, Gruppen, Rollen |
| PATCH | `/me` | Anzeigename, Lieblingsfarben |
| PUT · DELETE | `/me/avatar` | Profilbild setzen (`{preset}` aus der Vorauswahl oder `{image}` als Data-URL, JPEG/PNG/WebP, höchstens 300 kB) oder entfernen; Antwort ist `/me` |
| GET | `/avatars/{uid}` | Eigenes Bild eines Kontos (angemeldet, Cache einen Tag; die Adresse trägt `?v=` mit dem Zeitpunkt der Änderung) |

Geändert in AP-3 (19.11.2026): Der Link in der Mail zeigt auf die App (`/anmelden?token=…&einladung=…`), die ihn per `POST /auth/magic-link/verify` einlöst. Ein `GET` würden Link-Prüfer in Mailprogrammen schon vor dem Klick aufrufen und den einmaligen Link verbrauchen. Neue Konten entstehen nur mit gültiger Einladung; unbekannte Adressen ohne Einladung bekommen keine Mail, die Antwort ist trotzdem `202`. Höchstens 5 Links pro Adresse in 15 Minuten. Passkeys: Die `…/options`-Aufrufe liefern die WebAuthn-Optionen als JSON und setzen ein kurzlebiges Cookie mit der ID der Challenge (Tabelle `webauthn_challenge`, 5 Minuten, einmal nutzbar); `…/verify` erwartet die Antwort von `navigator.credentials.create` bzw. `.get` als JSON. Relying Party ist der Hostname von `TOPSTACK_PUBLIC_ORIGIN`.

### Gruppen und Spieler

Seit Phase 5 (AP-1, ADR-0018). Fremde und gelöschte Gruppen antworten mit `404`, fehlende Rechte mit `403`, Schreiben in archivierten Gruppen mit `409`. Rollen: Admin (alles), Mitglied (mitspielen, Profile sehen), Zuschauer (Live, Rangliste, Statistik).

| Methode | Pfad | Zweck | Wer |
| --- | --- | --- | --- |
| POST | `/groups` | Gruppe anlegen (`name`); Standardregeln, Saison fürs laufende Jahr, Ersteller wird Admin; höchstens 5 eigene | angemeldet |
| GET | `/groups/{gid}` | Gruppe mit Rolle, Regeln, `pending_rules` (nur Admins), `archived`, `has_image` und `can_*`-Rechten | alle Rollen |
| PATCH | `/groups/{gid}` | Umbenennen | Admin |
| PUT · DELETE | `/groups/{gid}/image` | Gruppenbild als Data-URL (JPEG, PNG, WebP, höchstens 1 MB; die App verkleinert auf 512 px) setzen oder entfernen | Admin |
| GET | `/groups/{gid}/image` | Gruppenbild | alle Rollen |
| PATCH | `/groups/{gid}/rules` | Regeln ändern; Antwort `applied_now`: sofort nur ohne Turniere, sonst ab der nächsten Saison | Admin |
| DELETE | `/groups/{gid}/rules/pending` | Vorgemerkte Regeln verwerfen | Admin |
| GET | `/groups/{gid}/members` | Mitglieder mit Konto und Rolle | Admin, Mitglied |
| PUT | `/groups/{gid}/members/{uid}/role` | Rolle ändern; mindestens ein Admin bleibt | Admin |
| PUT | `/groups/{gid}/players/{pid}/avatar` | Wesen für einen Spieler ohne Konto (`{preset}` oder `null`) | Admin |
| DELETE | `/groups/{gid}/members/me` | Gruppe verlassen; Antwort `new_admin`, wenn der letzte Admin ging | alle Rollen |
| POST · DELETE | `/groups/{gid}/archive` | Archivieren (nur ohne offenes Turnier) oder zurückholen | Admin |
| DELETE | `/groups/{gid}` | In den Papierkorb (nur ohne offenes Turnier); nach 30 Tagen endgültig gelöscht | Admin |
| GET | `/me/deleted-groups` | Eigene gelöschte Gruppen mit `purge_on` | angemeldet |
| POST | `/groups/{gid}/restore` | Aus dem Papierkorb holen | Admin |
| POST | `/groups/{gid}/invitations` | Gruppenlink erzeugen (alle Mitglieder); mit `player_id` persönlicher Link für einen Spieler ohne Konto (nur Admins) | Admin, Mitglied |
| GET | `/groups/{gid}/invitations` | Offene Links mit Ersteller, Ablauf, Nutzungen; Admins sehen alle, Mitglieder ihre eigenen | Admin, Mitglied |
| DELETE | `/groups/{gid}/invitations/{id}` | Link zurückziehen (Ersteller oder Admin) | Admin, Mitglied |
| POST | `/groups/{gid}/players/merge` | Spieler ohne Konto (`source_id`) in einen anderen (`target_id`) übernehmen; ohne `apply` nur Vorschau mit Zahl der Turniere und Matches; verweigert, wenn beide im selben Turnier stehen | Admin |
| POST | `/groups/{gid}/imports/csv` | Altdaten als CSV (`tournaments_csv`, optional `matches_csv`, `source`); ohne `apply` nur Vorschau mit Fehlern je Datei und Zeile, mit `apply` ein Importlauf (ADR-0019) | Admin |
| POST | `/groups/{gid}/imports/manual` | Ein Turnier von Papier (`held_on`, `set_code`, `entries` mit Platz, optional `matches`), sonst wie oben | Admin |
| GET | `/groups/{gid}/imports` | Importläufe mit Quelle, Zahl der Turniere und neuen Ehemaligen | Admin |
| DELETE | `/groups/{gid}/imports/{id}` | Importlauf zurücknehmen: seine Turniere und ungenutzte Ehemalige verschwinden | Admin |
| GET | `/invitations/{token}` | Gruppenname und Ablauf für die Einladungsseite; archivierte und gelöschte Gruppen `410` | öffentlich |
| POST | `/invitations/{token}/accept` | Einladung annehmen (UC-02); wer ausgetreten war, bekommt seinen alten Spieler zurück | angemeldet |
| GET | `/groups/{gid}/players` | Spielerliste; mit `?all=true` (Admins) auch Gäste und Ehemalige | Admin, Mitglied |

### Spieler der Gruppe

| Methode | Pfad | Zweck |
| --- | --- | --- |
| GET | `/groups/{gid}/players` | Mitglieder und vorgemerkte Spieler (ohne Gäste) |
| POST | `/groups/{gid}/players` | Vorgemerkten Spieler ohne Konto anlegen, nur Admin (ADR-0015) |

`POST /groups/{gid}/invitations` nimmt optional `player_id`: ein persönlicher Link (einmal nutzbar), mit dem ein Freund den vorgemerkten Spieler samt Ergebnissen übernimmt.

Turnier-Antworten enthalten `actions`: was der angemeldete Nutzer im aktuellen Status darf (`invite`, `respond`, `seat`, `start_draft`, `report_colors`, `cancel`). Die App zeigt danach ihre Knöpfe.

### Turniere

| Methode | Pfad | Zweck | UC |
| --- | --- | --- | --- |
| POST | `/groups/{gid}/tournaments` | Turnier starten; `set_code` = Name des Drafts oder Set-Kürzel, 2 bis 20 Zeichen. Optional `rules` mit `games_to_win` (1–3), `starting_life`, `match_time_limit_min`, `match_points_win`/`_draw`/`_loss` für dieses Turnier; gespeichert wird nur, was von den Gruppenregeln abweicht (AP-3). Die Antwort jedes Turniers enthält `rules` mit den gültigen Werten und `custom`. Fehlt die Saison für heute, beginnt hier die nächste und übernimmt vorgemerkte Regeln (ADR-0018) | UC-03 |
| GET | `/tournaments/{tid}` | Turnier mit Teilnehmern, Runden, Matches | – |
| GET | `/groups/{gid}/tournaments` | Turniere der Gruppe, offenes zuerst, höchstens 20 | – |
| POST | `/tournaments/{tid}/entries` | Mitglieder und vorgemerkte Spieler einladen (`{player_ids}`); vorgemerkte sind sofort zugesagt | UC-04 |
| PUT | `/tournaments/{tid}/entries/me` | Eigene Einladung zusagen oder absagen (`{accept}`) | UC-04 |
| DELETE | `/tournaments/{tid}/entries/{pid}` | Teilnehmer vor der Auslosung entfernen | UC-04 |
| POST | `/tournaments/{tid}/guest-link` | QR-Code-/Link-Token für Gäste, 12 Stunden gültig; App-Seite `/gast/<token>` | UC-05 |
| GET | `/guest/{token}` | Öffentlich: Gruppe, Set, ob die Anmeldung offen ist | UC-05 |
| POST | `/guest/{token}` | Gast tritt mit Namen bei (`{display_name}`), ohne Konto; Antwort mit `claim_url`: persönlicher Link (30 Tage), mit dem er sich ein Profil anlegt und seine Ergebnisse behält | UC-05, UC-18 |
| POST | `/tournaments/{tid}/seating` | Draftplätze auslosen (erneut = neu auslosen); Antwort enthält `seating.seed` und `seating.draw` für die gleiche Animation auf allen Handys | UC-06 |
| POST | `/tournaments/{tid}/draft` | Draft beginnen (`seated` → `drafting`) | – |
| PUT | `/tournaments/{tid}/entries/{pid}/colors` | Farben melden, z. B. `"UB"`, farblos `""`; für Gäste und vorgemerkte Spieler auch durch Starter oder Admin | UC-07 |
| POST | `/tournaments/{tid}/cancel` | Abbrechen: vor Runde 1 Starter oder Admin, danach nur Admin (ADR-0013) | – |
| DELETE | `/tournaments/{tid}` | Abgebrochenes Turnier löschen (Starter oder Admin) oder abgeschlossenes, fehlerhaftes Turnier (nur Admin); Gäste des Turniers werden mit gelöscht | – |
| POST | `/tournaments/{tid}/rounds/next` | Runde 1 starten (erzeugt den ganzen Spielplan jeder gegen jeden, Pause bei ungerader Zahl) oder nächste Runde; jeder Teilnehmer. Fehlende Farben oder offene Matches: `409` mit `code` `missing_colors` (`names`) bzw. `open_matches` (`count`), mit `{ "confirm": true }` trotzdem | UC-08, UC-15 |
| POST | `/tournaments/{tid}/matches/{mid}/start` | Match aus einer späteren Runde vorziehen, wenn beide frei sind; der Vorschlag steht in `GET /tournaments/{tid}` als `suggestion` | UC-09 |
| PUT | `/tournaments/{tid}/matches/{mid}/result` | Ergebnis ohne Tracker eintragen (`{games_a, games_b, games_drawn}`), Best-of-3, Unentschieden erlaubt; mit `version` korrigieren bis Turnierende, Protokoll in `match_correction` | UC-12 bis UC-14 |
| POST | `/tournaments/{tid}/finish` | Abschluss, wenn alle Matches gespielt sind; schreibt Endplätze und Ranglistenpunkte. `409` mit `code` `open_matches` oder `needs_roll` | UC-17 |
| POST | `/matches/{mid}/pull-forward` | Match vorziehen | UC-09 |
| POST | `/tournaments/{tid}/pause` · `/resume` | Pausieren und fortsetzen | UC-16 |
| – | Turniertabelle | steht in `GET /tournaments/{tid}` als `standings` (mit `needs_roll`, `roll`, `final_place`, `ranking_points`) | – |

### Matches, Spiele, Ereignisse

| Methode | Pfad | Zweck | UC |
| --- | --- | --- | --- |
| POST | `/tournaments/{tid}/matches/{mid}/tracker` | Match mit dem Life-Tracker starten (`{mode: "shared" \| "dual"}`), idempotent; Antwort wie `GET` | UC-10 |
| GET | `/tournaments/{tid}/matches/{mid}/tracker` | Spieler, Startleben, nötige Spielsiege (`games_to_win`, AP-3), Zeitlimit, Stand des Matches und alle Ereignisse; zum Koppeln des zweiten Handys und zum Nachladen | UC-11 |
| PUT | `/tournaments/{tid}/matches/{mid}/tracker/seats/{pid}` | Modus `dual`: dieses Handy zählt für `pid` (`{device_id, force}`); `409`, wenn schon ein anderes Handy zählt. `GET …/tracker` zeigt `seats` und `tie` | UC-11 |
| PUT | `/tournaments/{tid}/matches/{mid}/tracker/seats/{pid}/roll` | Modus `dual`: eigener W20 vor Spiel 1 (`{device_id, value}`), erst wenn beide da sind; Gleichstand setzt `tie` und beide würfeln neu | UC-10 |
| POST | `/tournaments/{tid}/matches/{mid}/events` | Stapel aus der Outbox (idempotent, bis 500 Ereignisse, mehrere Spiele möglich); Spiele entstehen beim `game_start` | UC-10, UC-11 |
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

Jedes Ereignis trägt zusätzlich `game_id`; `game_end` trägt `reason` (`life_zero`, `concede`, `time`, `manual`).

Antwort `200`: `{ "accepted": ["0193…"], "duplicates": [], "rejected": [{ "id": "…", "detail": "…" }], "match": { "status", "games_a", "games_b", "games_drawn", "version" } }`. Bekannte IDs landen in `duplicates`, das ist kein Fehler. Widersprüchliche Ereignisse landen in `rejected`, der Rest des Stapels wird trotzdem gespeichert (ADR-0012).

Ereignisarten: `game_start`, `die_roll` (`value` 1–20), `life` (`delta` ≠ 0), `undo` (`undo_of`), `game_end`.

### Rangliste und Statistik

| Methode | Pfad | Zweck |
| --- | --- | --- |
| GET | `/groups/{gid}/seasons` | Saisons der Gruppe, neueste zuerst, mit `current` |
| GET | `/groups/{gid}/leaderboard?season=&from=&to=` | Rangliste: Rang, Ranglistenpunkte, Turniere, Turniersiege, Summe und Schnitt der Matchpunkte. Ohne `season` gesamt; `from`/`to` (JJJJ-MM-TT) nach Turnierdatum. Sortiert nach Punkten, Matchpunkten, Schnitt, Turniersiegen; gleiche Werte teilen sich den Rang |
| GET | `/groups/{gid}/players/{pid}/stats?season=&from=&to=` | Spielerstatistik: Turniersiege, Platzierungen, Match- und Spiel-Siegquote, Farben (einzeln und als Kombination), Bilanz gegen jeden Gegner, Bilanz je eigener Farbkombination (`with_colors`, beste Siegquote zuerst) und gegen die Farbkombination der Gegner inkl. Gästen (`vs_colors`, meiste Niederlagen zuerst; seit 28.11.2026 als Kombination, nicht mehr einzeln) |
| GET | `/groups/{gid}/head-to-head` | Alle Paarungen in beide Richtungen mit Siegen, Unentschieden, Niederlagen, Spielen und Zahl der Altdaten-Matches (AP-6) |
| GET | `/groups/{gid}/head-to-head/{a}/{b}` | Direktvergleich: Bilanz aus Sicht von `a`, Spiele, Elo beider, letzte 10 Begegnungen (neueste zuerst, Altdaten markiert) |
| – | Gruppenstatistik, Direktvergleich | ab v1.1 (Head-to-Head, Statistik pro Set) |

Es zählen nur abgeschlossene Turniere der Gruppe; Gäste stehen nicht in der Rangliste, ihre Matches zählen aber für die Gegner (TC-72, TC-73). Nur Mitglieder der Gruppe dürfen abfragen.

### Push

| Methode | Pfad | Zweck |
| --- | --- | --- |
| GET | `/push/vapid-key` | Öffentlicher VAPID-Schlüssel (`{key}`, `null` = Push nicht eingerichtet) |
| POST | `/push/subscriptions` | Abo speichern, Format wie `PushSubscription.toJSON()`; gleicher Endpunkt = kein zweites Abo |
| DELETE | `/push/subscriptions?endpoint=` | Abo dieses Geräts löschen |
| GET | `/me/notifications` | Anzahl Geräte mit Abo und alle Ereignisse mit `enabled` |
| PUT | `/me/notifications/{event}` | Ereignis ein-/ausschalten (`{enabled}`): `your_turn`, `new_round`, `tournament_end`, `invitation`, `result_corrected`, `cancel_requested` |
| POST | `/push/test` | Testnachricht an alle eigenen Geräte; `503`, wenn VAPID fehlt |

Wer etwas selbst auslöst, bekommt dazu keine Nachricht. Bei einer neuen Runde bekommt jeder Spieler mit Match „Du bist dran“ (mit Gegner), wer Pause hat „Neue Runde“. Abgelaufene Abos (404/410 vom Push-Dienst) werden beim Senden gelöscht.

## 2. WebSocket

Pfad `/ws`, Anmeldung über das Sitzungs-Cookie; ohne gültige Sitzung schließt der Server mit Code `4401`. Gäste ohne Konto haben keinen WebSocket. Nachrichten sind JSON mit `type`.

Client → Server:

```json
{ "type": "subscribe", "topic": "tournament:<tid>" }
{ "type": "unsubscribe", "topic": "tournament:<tid>" }
{ "type": "pong" }
```

Abonnieren darf, wer das Turnier auch per REST sieht (Mitglieder der Gruppe). Antwort `{ "type": "subscribed", "topic" }` oder `{ "type": "error", "topic", "detail" }`.

Server → Client (jede Nachricht trägt `topic`):

| `type` | Inhalt | Auslöser |
| --- | --- | --- |
| `tournament.updated` | `{ tournament_id, reason }` | Jede Änderung am Turnier: Teilnehmer, Auslosung, Farben, Runde, Ergebnis, Korrektur, Pause, Abschluss, Abbruch, Löschen (`reason: "deleted"`) |
| `game.events` | `{ match_id, events: [...] }` | Neue Ereignisse aus dem Tracker, Format wie im REST-Stapel (Lebenspunkte live) |
| `ping` | – | Alle 25 Sekunden |

Die Nachrichten sind Hinweise: Die App lädt danach `GET /tournaments/{tid}` (Runden, Matches mit Lebenspunkten im laufenden Spiel, Tabelle, Pause-Ansicht) und im Tracker `GET …/tracker`. Ein eigenes `GET /tournaments/{tid}/live` und feinere Nachrichtenarten (`match.updated`, `round.started` …) entfallen dadurch (AP-7, 21.11.2026). Nach einem Verbindungsabbruch holt die App den Stand per REST nach und abonniert neu. Ziel: Ende-zu-Ende unter 2 Sekunden (N-04).

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
| POST | `/tournaments/{tid}/cancel` | Turnier abbrechen (`cancelled`, ADR-0013): vor Runde 1 durch Starter oder Admin, ab Runde 1 direkt nur durch den Admin | AP-5 |
| POST | `/tournaments/{tid}/cancel-request` | Abbruch per Abstimmung beantragen (Starter oder Admin, ab Runde 1); `409`, wenn schon ein Antrag offen ist | AP-5 |
| DELETE | `/tournaments/{tid}/cancel-request` | Antrag zurückziehen (Antragsteller oder Admin) | AP-5 |
| PUT, DELETE | `/tournaments/{tid}/cancel-request/vote` | Eigene Bestätigung abgeben oder zurücknehmen; Antwort enthält `cancel_vote` mit `confirmed`, `required`, `participants`, `i_voted`, `voters` | AP-5 |
| PUT, DELETE | `/tournaments/{tid}/cancel-request/votes/{pid}` | Starter oder Admin bestätigen für Gäste und Spieler ohne Konto (wie bei den Farben) | AP-5 |
| POST | `/tournaments/{tid}/tiebreak-roll` | W20-Wurf bei Gleichstand nach allen Tiebreakern | AP-5 |

**Präzisierungen**

- `PUT /matches/{mid}/games/{gameId}` nimmt `{ "number", "starting_player_id", "starting_life" }` beim Anlegen und `{ "winner_player_id", "end_reason" }` beim Abschluss. `end_reason` ist `life_zero`, `concede`, `time` oder `manual`; Unentschieden = `winner_player_id: null` mit `end_reason: "time"`.
- `game_end` im Ereignis-Stapel trägt `reason` mit denselben Werten (ADR-0012).
- `PUT` und `PATCH /matches/{mid}/result` verlangen die bekannte `version` des Matches. Passt sie nicht, antwortet der Server mit `409 Conflict` und dem aktuellen Match (ADR-0013).
- `POST /tournaments/{tid}/rounds/next` mit offenen Matches antwortet `409` mit `code: "open_matches"` und der Anzahl (`count`); mit `{ "confirm": true }` wird die Runde trotzdem gestartet (UC-15).
- Der WebSocket sendet alle 25 Sekunden `{ "type": "ping" }`; die App antwortet mit `pong`. Bleibt der Ping aus, baut die App neu auf.

Neu in Phase 5, AP-15 (28.11.2026): Profilbilder. Spieler-, Turnier-, Ranglisten- und Duell-Antworten tragen `avatar` (bei Matches `avatar_a`/`avatar_b`): `preset:<wesen>` (eines der 16 Wesen der App), die Adresse eines eigenen Bildes oder `null`; dann zeigt die App Initialen. Spieler mit Konto haben das Bild ihres Kontos in allen Gruppen, Spieler ohne Konto das Wesen, das ein Admin gewählt hat.
