# Heimserver einrichten

Stand: 18.11.2026 · gehört zu [Phase 3](README.md), Arbeitspaket AP-2 · Hintergrund: [ADR-0007](../adr/0007-betrieb-minipc-docker.md)

Ziel: TopStack läuft auf dem Mini-PC und ist unter `https://topstack.win` erreichbar, ohne dass am Router ein Port geöffnet wird.

```
Handy ──HTTPS──▶ Cloudflare ──Tunnel──▶ cloudflared ──▶ Caddy ──▶ App (statisch)
                                                          └──▶ API ──▶ PostgreSQL
```

Die Befehle sind für Linux (z. B. Ubuntu Server) geschrieben. Auf Windows mit Docker Desktop funktionieren sie in Git Bash genauso, nur die Installation in Schritt 1 ist anders.

---

## 1. Docker installieren

Prüfen, ob Docker schon läuft:

```bash
docker --version
docker compose version
```

Fehlt es, auf Ubuntu:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # danach einmal ab- und wieder anmelden
```

## 2. Repo auf den Heimserver holen

```bash
cd ~
git clone https://github.com/krauspeter/topstack.git
cd topstack/infra
```

## 3. Geheimnisse anlegen

Die Datei `.env` liegt nur auf dem Server, nie im Repo (ADR-0009).

```bash
cp .env.example .env
nano .env
```

Ausfüllen:

| Variable | Wert |
| --- | --- |
| `TOPSTACK_PUBLIC_ORIGIN` | `https://topstack.win` |
| `POSTGRES_PASSWORD` | langes Zufallspasswort, z. B. aus `openssl rand -base64 32` |
| `CF_TUNNEL_TOKEN` | Token aus Schritt 4 |

Ab AP-3 und AP-8 kommen weitere Werte dazu (E-Mail-Zugang, VAPID-Schlüssel). Sie werden dann in `.env.example` ergänzt.

Passwortdatei für den MQTT-Broker anlegen (wird erst in Phase 6 genutzt, muss aber existieren):

```bash
docker run --rm -v "$PWD":/work eclipse-mosquitto:2 \
  mosquitto_passwd -c -b /work/mosquitto.passwd topstack "$(openssl rand -base64 24)"
```

## 4. Cloudflare Tunnel

Voraussetzung: Die Domain `topstack.win` ist bei Cloudflare eingetragen, und `infra/docker-compose.yml` enthält den Dienst `cloudflared` (in deiner lokalen Kopie schon ergänzt, kommt mit AP-2 ins Repo).

1. Im Cloudflare-Dashboard zu **Zero Trust → Networks → Tunnels** gehen und **Create a tunnel** wählen (Typ *Cloudflared*). Falls der Tunnel `heimserver` schon existiert, diesen öffnen.
2. Als Umgebung **Docker** wählen und aus dem angezeigten Befehl nur den Teil nach `--token` kopieren. Das ist `CF_TUNNEL_TOKEN` in der `.env`.
3. Unter **Public Hostname** eintragen:
   - Subdomain: leer, Domain: `topstack.win`
   - Service: `HTTP`, URL: `caddy:80`
4. Speichern. Die Bezeichnungen im Dashboard können sich ändern; gemeint ist immer: Hostname `topstack.win` zeigt auf `http://caddy:80`.

## 5. Starten

```bash
cd ~/topstack/infra
docker compose --env-file .env pull
docker compose --env-file .env up -d
docker compose ps
```

Alle Dienste sollten `running` bzw. `healthy` zeigen. Logs ansehen:

```bash
docker compose logs -f api
docker compose logs -f cloudflared
```

## 6. Prüfen

```bash
curl -s https://topstack.win/api/v1/health
```

Erwartet: `{"status":"ok", …}`. Danach `https://topstack.win` auf dem Handy öffnen und die App installieren (siehe [TESTEN.md](../../TESTEN.md)).

Prüfen, dass von außen nichts offen ist (vom Handy im Mobilfunknetz, nicht im WLAN): Nur `https://topstack.win` antwortet, die Datenbank und MQTT sind nicht erreichbar (Testfall TC-83).

## 7. Aktualisieren

Nach jedem Merge in `main` baut die CI ein neues API-Image in ghcr.io.

```bash
cd ~/topstack
git pull
cd infra
docker compose --env-file .env pull
docker compose --env-file .env up -d
```

Die API spielt fehlende Datenbank-Migrationen beim Start selbst ein (ADR-0014). Automatisches Ausrollen aus der CI kommt in Phase 4.

## 8. Wenn etwas nicht geht

| Problem | Ursache | Lösung |
| --- | --- | --- |
| `POSTGRES_PASSWORD fehlt in .env` | `.env` fehlt oder wird nicht gelesen | Befehle mit `--env-file .env` im Ordner `infra` ausführen |
| Cloudflare zeigt Fehler 1033 oder 502 | Tunnel läuft nicht oder zeigt auf falschen Dienst | `docker compose logs cloudflared`; Public Hostname muss `http://caddy:80` sein |
| Seite lädt, aber leer | App-Dateien fehlen im Volume `app-dist` | wird in AP-2 gelöst (App-Build in Caddy) |
| `api` startet neu und neu | Datenbank nicht erreichbar oder Migration schlägt fehl | `docker compose logs api` |
| `mosquitto.passwd` ist ein Ordner | Datei fehlte beim ersten Start, Docker hat einen Ordner angelegt | Ordner löschen, Schritt 3 wiederholen |

Noch nicht dabei und für **Phase 4** geplant: nächtliche Backups mit Wiederherstellungstest, Monitoring mit Uptime Kuma, automatisches Deployment.
