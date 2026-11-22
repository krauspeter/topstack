# Heimserver einrichten

Stand: 22.11.2026 · gehört zu [Phase 3](README.md), Arbeitspaket AP-2; Backups aus [Phase 4](../phase4/README.md), AP-1 · Hintergrund: [ADR-0007](../adr/0007-betrieb-minipc-docker.md)

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
docker compose exec -T api python -m topstack.scripts.vapid_keys >> .env
grep -c '^VAPID_' .env        # muss 2 sein
```

`-T` ist wichtig: Ohne hängt Docker unsichtbare Zeilenende-Zeichen an, und die Schlüssel funktionieren nicht. Zeigt `grep` `4`, standen schon leere `VAPID_`-Zeilen in der `.env`: die beiden **leeren** mit `nano .env` löschen. Dann neu starten:

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

Die API spielt fehlende Datenbank-Migrationen beim Start selbst ein (ADR-0014). Automatisches Ausrollen aus der CI kommt in Phase 4 (AP-3).

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

## Vor dem Spieleabend: Datenbank sichern

Ab Phase 4 sichert der Heimserver jede Nacht automatisch (siehe nächster Abschnitt). Vor einem echten Turnier trotzdem einmal von Hand sichern:

```bash
~/topstack/infra/ops/backup.sh backup manual
```

Die Datei landet unter `BACKUP_DIR/manual/` und, sobald R2 eingerichtet ist, verschlüsselt in R2. Sie liegt bewusst **außerhalb** von `~/topstack`, damit sie nie ins Repository gelangt; sie enthält E-Mail-Adressen der Mitspieler und gehört nicht in Chats oder Issues.

## Backups einrichten (Phase 4, AP-1)

Hintergrund: [ADR-0016](../adr/0016-betrieb-backup-monitoring-deployment.md). Jede Nacht um 03:30 ein `pg_dump`, lokal unter `BACKUP_DIR` und verschlüsselt in Cloudflare R2. Aufbewahrt werden 7 tägliche, 4 wöchentliche und 6 monatliche Backups, dazu 10 von Hand oder vor Deployments. Am 1. jedes Monats spielt ein Test das neueste Backup in eine Wegwerf-Datenbank ein und vergleicht es mit dem Manifest.

### 1. Cloudflare R2 (auf dem PC im Browser)

1. Cloudflare-Dashboard → **R2 Object Storage** → freischalten. Cloudflare verlangt eine Zahlungsmethode, 10 GB im Monat bleiben kostenlos.
2. **Create bucket**: Name `topstack-backups`, bei **Location** „Specify jurisdiction“ → **European Union (EU)**. Die Daten bleiben damit in der EU.
3. Im Bucket → **Settings** → **Object lifecycle rules** → **Add rule**: alle Objekte nach **200 Tagen** löschen. Das Skript räumt selbst auf; die Regel ist nur das Netz, falls es das einmal nicht tut.
4. R2 → **Manage API tokens** → **Create Account API token**: Name `topstack-heimserver`, Berechtigung **Object Read & Write**, **Apply to specific buckets only** → `topstack-backups`.
5. Angezeigt werden **Access Key ID**, **Secret Access Key** und die Endpoints. Alle drei in den Passwort-Manager. Gebraucht wird der Endpoint für die EU: `https://<Account-ID>.eu.r2.cloudflarestorage.com`. Den Secret Access Key zeigt Cloudflare nur einmal.

### 2. Schlüssel für die Verschlüsselung erzeugen (auf dem Heimserver)

Das Backup-Image muss einmal geholt werden. Ist es das erste Mal, ist das Paket auf GitHub noch privat und `pull` meldet „denied“: GitHub → Profil → **Packages** → `topstack-backup` → **Package settings** → **Change visibility** → **Public**.

```bash
cd ~/topstack/infra
docker compose --env-file .env --profile ops pull backup
docker compose --env-file .env --profile ops run --rm -T --no-deps --entrypoint age-keygen backup
```

Die Ausgabe hat drei Zeilen: `# created: …`, `# public key: age1…` und `AGE-SECRET-KEY-1…`.

- **Alle drei Zeilen** als eine Notiz in den Passwort-Manager, Titel „TopStack Backup-Schlüssel“. Zusätzlich ausdrucken und sicher aufbewahren: Ohne diesen Schlüssel sind die Backups in R2 wertlos.
- Der Schlüssel wird **nirgends** auf dem Server gespeichert. Danach das Terminal leeren: `clear`.
- Nur der öffentliche Schlüssel (`age1…`) kommt in die `.env`.

### 3. `.env` ergänzen (auf dem Heimserver)

```bash
cd ~/topstack/infra
id -u; id -g          # meist 1000 und 1000
nano .env
```

Unten anfügen bzw. ausfüllen (Vorlage in `.env.example`):

```
BACKUP_DIR=/home/peter/topstack-backups
BACKUP_UID=1000
BACKUP_GID=1000
BACKUP_OFFSITE=on
BACKUP_AGE_RECIPIENT=age1…
R2_BUCKET=topstack-backups
R2_ENDPOINT=https://<Account-ID>.eu.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
```

Den Pfad bei `BACKUP_DIR` an den eigenen Benutzernamen anpassen (`echo $HOME`). Die von Hand gesicherten Dateien aus Phase 3 dürfen im selben Ordner liegen bleiben.

### 4. Erstes Backup und Test (auf dem Heimserver)

```bash
cd ~/topstack/infra
ops/backup.sh backup manual
ops/backup.sh list
ops/backup.sh restore-test
```

Erwartet: „fertig: topstack-…-manual“, die Datei erscheint unter `manual` lokal **und** in R2, der Test endet mit „Wiederherstellungstest bestanden“ und „R2-Kopie ✓“.

### 5. Timer einrichten (einmalig, auf dem Heimserver)

```bash
~/topstack/infra/ops/install-timers.sh
```

Fragt nach dem `sudo`-Passwort und zeigt danach die beiden Timer mit dem nächsten Lauf. Später prüfen:

```bash
systemctl list-timers 'topstack-*'
journalctl -u topstack-backup.service -n 30        # Ausgabe des letzten Backups
journalctl -u topstack-restore-test.service -n 30  # Ausgabe des letzten Tests
```

Bis AP-2 (Monitoring) meldet sich ein fehlgeschlagenes Backup nicht von selbst. Bis dahin ab und zu mit `ops/backup.sh list` nachsehen.

### Ernstfall: auf dem Heimserver zurückspielen

Überschreibt den aktuellen Stand. Das Skript fragt nach, sichert den aktuellen Stand vorher noch einmal und stoppt die API während des Einspielens.

```bash
cd ~/topstack/infra
ops/backup.sh list
ops/restore.sh daily/topstack-<Zeitpunkt>-nightly.dump
```

## Ernstfall: auf einem anderen Rechner wiederherstellen

Für den Fall, dass der Mini-PC weg ist, und als Probe für Gate G4 (TC-94). Gebraucht wird nur: das Repo von GitHub, das Backup aus R2 und der Schlüssel aus dem Passwort-Manager. Probe-Rechner ist der Windows-PC mit Docker Desktop (Entscheidung vom 21.11.2026). So am 22.11.2026 erfolgreich durchgespielt. Alle Befehle **auf dem PC in Git Bash**.

**Wichtig:** Alles liegt in `C:\topstack-probe`, **nicht** im OneDrive-Ordner. Backup und Schlüssel enthalten Spielerdaten bzw. öffnen sie und dürfen nicht in die Cloud synchronisiert werden.

**Vorbereiten**

1. Docker Desktop installieren (Windows AMD64, mit WSL 2) und starten, bis „Engine running“ erscheint.
2. In jeder neuen Git-Bash-Sitzung zuerst, sonst schreibt Git Bash Pfade wie `/backups/…` in Windows-Pfade um:
   ```bash
   export MSYS_NO_PATHCONV=1
   ```
3. Repo frisch holen:
   ```bash
   mkdir -p /c/topstack-probe/backups && cd /c/topstack-probe
   git clone https://github.com/krauspeter/topstack.git
   cd topstack/infra
   ```
4. Im Browser: Cloudflare → R2 → `topstack-backups` → `daily` → die neueste `.dump.age` **und** die gleichnamige `.json` herunterladen und nach `C:\topstack-probe\backups` verschieben.
5. Den Schlüssel aus dem Passwort-Manager in eine Datei schreiben, **nicht** mit Notepad:
   ```bash
   cat > /c/topstack-probe/backups/key.txt
   ```
   Einfügen, Enter, Strg+D. Prüfen: `grep -c AGE-SECRET-KEY /c/topstack-probe/backups/key.txt` ergibt `1`. Entscheidend ist die Zeile `AGE-SECRET-KEY-1…`; die beiden Kommentarzeilen mit `#` sind optional. Die R2-Zugangsdaten werden für die Probe nicht gebraucht.
6. Minimale `.env` (ohne Tunnel, ohne echte Geheimnisse) und Passwortdatei für MQTT, das die API beim Start braucht:
   ```bash
   printf 'POSTGRES_PASSWORD=probe\nTOPSTACK_PUBLIC_ORIGIN=http://localhost\nCF_TUNNEL_TOKEN=unbenutzt\nBACKUP_DIR=C:/topstack-probe/backups\nBACKUP_OFFSITE=off\n' > .env
   docker run --rm -v "$(pwd -W)":/work eclipse-mosquitto:2 mosquitto_passwd -c -b /work/mosquitto.passwd topstack probe
   ```

**Wiederherstellen**

7. Stack ohne Tunnel starten, dann die API anhalten:
   ```bash
   docker compose --env-file .env up -d --wait caddy api db mqtt
   docker compose --env-file .env stop api
   ```
8. Entschlüsseln und einspielen:
   ```bash
   f=$(cd /c/topstack-probe/backups && ls *.dump.age | head -1)
   docker compose --env-file .env --profile ops run --rm -T --entrypoint age backup -d -i /backups/key.txt -o /backups/probe.dump "/backups/$f"
   docker compose --env-file .env --profile ops run --rm -T backup restore /backups/probe.dump
   docker compose --env-file .env start api
   ```

**Prüfen**

9. Die Zahlen müssen mit `counts` in der `.json` übereinstimmen:
   ```bash
   docker compose --env-file .env exec -T db psql -U topstack -Atc \
     "select 'app_user', count(*) from app_user union all select 'player', count(*) from player union all select 'tournament', count(*) from tournament union all select 'match', count(*) from match union all select 'game_event', count(*) from game_event"
   grep counts /c/topstack-probe/backups/*.json
   ```
10. `http://localhost` öffnen und mit der eigenen E-Mail-Adresse anmelden. Es wird keine Mail verschickt; der Link steht im Log:
    ```bash
    docker compose --env-file .env logs api | grep -A6 "nicht verschickt"
    ```
    Den Link `http://localhost/anmelden?token=…` im selben Browser öffnen. Ein Passkey geht hier nicht, er ist an `topstack.win` gebunden. Profil, Gruppe, Turniere und Rangliste müssen wie auf `https://topstack.win` aussehen.

**Aufräumen**

11. Stack mit Daten löschen, dann den ganzen Probe-Ordner samt Schlüssel (`rm` in Git Bash umgeht den Papierkorb):
    ```bash
    docker compose --env-file .env --profile ops down -v
    cd /c && rm -rf /c/topstack-probe && ls /c/topstack-probe 2>/dev/null || echo "Probe-Ordner gelöscht"
    ```

**Ausweichlösung**, falls Docker Desktop nicht geht: dieselben Schritte auf dem Heimserver in einem frischen Klon unter `/tmp/topstack-probe`, mit eigenem Projektnamen (`docker compose -p topstack-probe …`) und ohne die bestehende `.env`. Port 80 ist dort belegt, deshalb in Schritt 7 nur `db` starten und nur mit `psql` prüfen.
