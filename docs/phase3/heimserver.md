# Heimserver einrichten

Stand: 18.11.2026 · gehört zu [Phase 3](README.md), Arbeitspaket AP-2 · Hintergrund: [ADR-0007](../adr/0007-betrieb-minipc-docker.md)

Ziel: TopStack läuft auf dem Mini-PC und ist unter `https://topstack.win` erreichbar, ohne dass am Router ein Port geöffnet wird.

```
Handy ──HTTPS──▶ Cloudflare ──Tunnel──▶ cloudflared ──▶ Caddy ──▶ App (statisch)
                                                          └──▶ API ──▶ PostgreSQL
```

Der Mini-PC (Beelink EQ14, Hostname `heimserver`) läuft mit Debian 13. Entscheidung E3: Das System bleibt, wie es ist; Docker wurde am 19.11.2026 nachinstalliert. Alle Befehle laufen **auf dem Heimserver** (Prompt `peter@heimserver`), außer es steht ausdrücklich „auf dem PC“ dabei.

---

## 1. Docker installieren

Prüfen, ob Docker schon läuft:

```bash
docker --version
docker compose version
```

Fehlt Docker, über die offizielle Paketquelle installieren (so am 19.11.2026 auf Debian 13 gemacht):

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER   # danach einmal ab- und wieder anmelden
docker run --rm hello-world     # Test
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
chmod 600 .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 32)/" .env
nano .env        # nur noch CF_TUNNEL_TOKEN eintragen
```

Das Datenbank-Passwort wird so erzeugt, ohne je auf dem Bildschirm zu erscheinen. PostgreSQL übernimmt es nur beim allerersten Start; später ändern ist aufwendiger. Prüfen ohne Geheimnisse anzuzeigen: `grep -c eyJ .env` muss `1` ergeben.

Ausfüllen:

| Variable | Wert |
| --- | --- |
| `TOPSTACK_PUBLIC_ORIGIN` | `https://topstack.win` |
| `POSTGRES_PASSWORD` | wird oben per `sed` gesetzt |
| `CF_TUNNEL_TOKEN` | Token aus Schritt 4 |

Ab AP-3 und AP-8 kommen weitere Werte dazu: der API-Schlüssel von Resend für die Magic-Link-Mails (Entscheidung E2) und die VAPID-Schlüssel für Push (siehe „Push einrichten“ unter Abschnitt 5).

Passwortdatei für den MQTT-Broker anlegen (wird erst in Phase 6 genutzt, muss aber existieren):

```bash
docker run --rm -v "$PWD":/work eclipse-mosquitto:2 \
  mosquitto_passwd -c -b /work/mosquitto.passwd topstack "$(openssl rand -hex 24)"
sudo chown 1883:1883 mosquitto.passwd   # Mosquitto läuft im Container als Benutzer 1883
sudo chmod 600 mosquitto.passwd
```

## 4. Cloudflare Tunnel

Voraussetzung: Die Domain `topstack.win` ist bei Cloudflare eingetragen. Der Dienst `cloudflared` steht seit PR #55 in `infra/docker-compose.yml`. Diese Schritte laufen **auf dem PC im Browser**.

1. Im Cloudflare-Dashboard zu **Networking → Tunnels** gehen, **Create a tunnel**, Name `topstack`. Ein eigener Tunnel nur für TopStack, damit kein anderer Connector Anfragen an `caddy` bekommt, das er nicht kennt.
2. Als Umgebung **Docker** wählen und aus dem angezeigten Befehl nur den Teil nach `--token` kopieren. Das ist `CF_TUNNEL_TOKEN` in der `.env`. Den Befehl nicht ausführen.
3. **Continue** bleibt grau, bis sich ein Connector meldet. Das ist normal: Seite über **Networking → Tunnels** verlassen, der Tunnel steht dort als „Inactive“.
4. Tunnel öffnen → **Routes** → **Add route** → **Published application**: Subdomain leer, Domain `topstack.win`, Service URL `http://caddy:80`.
5. Unter **DNS → Records** prüfen: Der CNAME `topstack.win` muss auf `<Tunnel-ID>.cfargotunnel.com` des Tunnels `topstack` zeigen (ID unter **Overview → Tunnel details**). Ein alter Eintrag eines früheren Tunnels führt zu Fehler 1033.

## 5. Starten

```bash
cd ~/topstack/infra
docker compose --env-file .env pull
docker compose --env-file .env up -d
docker compose ps
```

`pull` holt zwei eigene Images aus ghcr.io: `topstack-web` (Caddy mit der fertigen App) und `topstack-api`. Beim ersten Start legt die API über `alembic upgrade head` alle Tabellen an. Alle Dienste sollten `running` bzw. `healthy` zeigen. Logs ansehen:

```bash
docker compose logs -f api
docker compose logs -f cloudflared
```

### Eigene Gruppe anlegen (einmalig)

```bash
docker compose --env-file .env exec api python -m topstack.scripts.seed_group \
  --group "Draft-Runde" --admin-email du@example.org --admin-name Peter
```

Legt die Gruppe mit Standardregeln, dich als Admin und die Saison 2027 an. Ein zweiter Aufruf ändert nichts.

### Push einrichten (AP-8, einmalig)

Die Schlüssel entstehen auf dem Heimserver und bleiben dort. Auf dem **Heimserver (SSH)**:

```bash
cd ~/topstack/infra
docker compose exec api python -m topstack.scripts.vapid_keys >> .env
grep -c '^VAPID_' .env        # muss 4 sein, wenn die leeren Zeilen aus .env.example noch drin sind
```

Stehen `VAPID_PUBLIC_KEY=` und `VAPID_PRIVATE_KEY=` doppelt in der `.env`, die beiden **leeren** Zeilen mit `nano .env` löschen, sodass `grep -c '^VAPID_' .env` danach `2` zeigt. Dann neu starten:

```bash
docker compose up -d
```

Den privaten Schlüssel nie in den Chat, ein Ticket oder ein Bildschirmfoto geben. Geht er verloren oder wird er bekannt: neue Schlüssel erzeugen, alte Zeilen ersetzen, neu starten. Alle müssen Push dann im Profil einmal neu aktivieren.

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
| Cloudflare zeigt Fehler 1033, obwohl `cloudflared` „Registered tunnel connection“ meldet | DNS-CNAME zeigt auf einen alten Tunnel (so am 19.11.2026) | **DNS → Records**: CNAME `topstack.win` auf `<ID von topstack>.cfargotunnel.com` ändern; Route `topstack.win` im alten Tunnel löschen |
| Cloudflare zeigt Fehler 1033, Logs ohne „Registered“ | Tunnel nicht verbunden | `docker compose logs cloudflared`; bei QUIC-Problemen `--protocol http2` vor `run` im `command` ergänzen; bei „Unauthorized“ Token neu eintragen |
| Cloudflare zeigt Fehler 502 | Route zeigt auf falschen Dienst | Service URL der Route muss `http://caddy:80` sein |
| `mqtt` steht auf `Restarting (13)` | Mosquitto (Benutzer 1883) darf `mosquitto.passwd` nicht lesen | `sudo chown 1883:1883 mosquitto.passwd`, dann `docker compose restart mqtt` |
| `pull` meldet „denied“ für `topstack-web` oder `topstack-api` | Das Paket auf GitHub ist privat | GitHub → Profil → **Packages** → Paket → **Package settings** → **Change visibility** → **Public** |
| App zeigt nach einem Update noch die alte Version | Service Worker hat die alte App zwischengespeichert | App schließen und neu öffnen; die neue Version lädt beim zweiten Start |
| `api` startet neu und neu, Log zeigt `alembic` | Migration schlägt fehl | `docker compose logs api`; die API startet bewusst erst nach erfolgreicher Migration |
| `api` startet neu und neu | Datenbank nicht erreichbar oder Migration schlägt fehl | `docker compose logs api` |
| `mosquitto.passwd` ist ein Ordner | Datei fehlte beim ersten Start, Docker hat einen Ordner angelegt | Ordner löschen, Schritt 3 wiederholen |

Noch nicht dabei und für **Phase 4** geplant: nächtliche Backups mit Wiederherstellungstest, Monitoring mit Uptime Kuma, automatisches Deployment.
