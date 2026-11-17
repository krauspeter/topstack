# TopStack – Architektur

Stand: Phase 1 (Architektur & Design), Start 15.11.2026.
Entscheidungen und Begründungen stehen als ADRs in [`docs/adr/`](adr/).

## Überblick

```mermaid
flowchart LR
    subgraph Spieltisch
        P1[Handy A<br/>PWA]
        P2[Handy B<br/>PWA]
        HW[Steuergerät<br/>ESP32]
    end

    subgraph Heimserver["Heimserver (Mini-PC, Docker Compose)"]
        CADDY[Caddy<br/>Reverse Proxy]
        API[Backend-API<br/>FastAPI]
        DB[(PostgreSQL)]
        MQ[Mosquitto<br/>MQTT-Broker]
    end

    CF[Cloudflare Tunnel]
    KI[KI-Rechner<br/>Ryzen 5 / GTX 1060<br/>ab Phase 8]

    P1 & P2 -- HTTPS / WebSocket --> CF --> CADDY
    CADDY --> API
    API --> DB
    API <--> MQ
    HW -- MQTT über WLAN --> MQ
    KI -. REST .-> API
```

**Grundregeln**

1. **Der Server ist die einzige Wahrheit.** Handys und Steuergerät sprechen nie direkt miteinander. Dadurch braucht das Steuergerät kein Bluetooth (geht in Safari ohnehin nicht).
2. **Offline zuerst im Spiel.** Der Life-Tracker schreibt jedes Ereignis zuerst lokal (IndexedDB) und synchronisiert danach. Fällt Server oder WLAN aus, läuft das Spiel weiter.
3. **Ereignisse statt Endstände.** Lebenspunkte werden als unveränderliche Ereignisse gespeichert. Der Spielstand ist immer die Summe der Ereignisse. Das ermöglicht Rückgängig, Kurven, Awards und später KI.
4. **Mehrgruppenfähig von Anfang an.** v1.0 nutzt eine Gruppe, aber jede Tabelle hängt an `group_id`. v1.1 braucht keinen Umbau.
5. **Domänenlogik ohne Framework.** Spielplan, Tabelle, Tiebreaker und Ranglistenpunkte liegen als reines Python in `server/topstack/domain/` und sind ohne Datenbank testbar.

## Komponenten

| Komponente | Ordner | Technik | Aufgabe |
| --- | --- | --- | --- |
| App | `app/` | React 18, TypeScript, Vite, vite-plugin-pwa, IndexedDB (Dexie) | Life-Tracker, Turnierablauf, Live-Ansicht, Rangliste |
| Backend | `server/` | Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Pydantic | REST-API, WebSocket, Domänenlogik, Push |
| Datenbank | `infra/` | PostgreSQL 16 | Alle dauerhaften Daten |
| Broker | `infra/` | Mosquitto 2 | Ereignisse vom Steuergerät, Live-Daten an das Steuergerät |
| Proxy | `infra/` | Caddy 2 | TLS, statische App-Dateien, `/api` und `/ws` an das Backend |
| Firmware | `firmware/` | PlatformIO, ESP32 (Arduino-Framework), Unity-Tests | Steuergerät ab Phase 6 |
| Doku | `docs/` | Markdown, Mermaid | Architektur, ADRs, Schnittstellen, Datenmodell |

## Datenfluss: ein Lebenspunkt

```mermaid
sequenceDiagram
    participant A as Handy A (PWA)
    participant IDB as IndexedDB
    participant API as Backend
    participant DB as PostgreSQL
    participant WS as WebSocket-Abonnenten
    participant MQ as MQTT

    A->>IDB: Ereignis speichern (UUID, seq, Zeit)
    A->>A: Anzeige sofort aktualisieren
    A->>API: POST /api/games/{id}/events (Stapel)
    API->>DB: INSERT … ON CONFLICT (id) DO NOTHING
    API-->>A: 200 + bestätigte IDs
    API->>WS: game.events (an alle im Turnier)
    API->>MQ: topstack/{tisch}/state (falls Steuergerät gekoppelt)
```

Doppelte Ereignisse sind harmlos: Die ID wird auf dem Gerät erzeugt, der Server ignoriert bekannte IDs. Deshalb darf die App bei Verbindungsabbruch beliebig oft neu senden.

## Weitere Dokumente

- [Datenmodell](datenmodell.md) und [Schema als SQL](schema.sql)
- [Schnittstellen: REST, WebSocket, MQTT](schnittstellen.md)
- [ADRs](adr/)
