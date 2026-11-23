# ADR-0017: Staging-Umgebung beta.topstack.win

- Status: angenommen (23.11.2026)
- Datum: 2026-11-23

## Kontext
Ab v1.0 bekommt die echte App nur noch Release-Versionen (`latest`, ADR-0016). Neue Stände und Pull Requests sollen trotzdem vor dem Release im Browser und auf dem Handy ausprobiert werden können, ohne die echte Gruppe, ihre Rangliste oder ihre Push-Abos zu berühren. Bisher landen Testturniere und Testspieler in der echten Datenbank. Randbedingungen: ein Mini-PC (ADR-0007), kein offener Port (Cloudflare Tunnel), keine Geheimnisse im Repo (ADR-0009), dasselbe Image für alle Umgebungen.

## Entscheidung
- **Subdomain statt Pfad:** `beta.topstack.win` statt `topstack.win/beta`. Unter demselben Ursprung würden sich Service Worker, IndexedDB, Sitzungs-Cookies, Push-Abos und Passkeys mit der echten App vermischen; außerdem ist die App für den Wurzelpfad gebaut.
- **Zweiter Stack auf dem Heimserver:** eigener Klon `~/topstack-beta` mit eigener `.env`, Compose-Projekt `topstack-beta` aus `infra/docker-compose.staging.yml` mit Web, API und eigener PostgreSQL. Kein eigener Tunnel: Der Tunnel der Produktion erreicht den Web-Dienst `beta-caddy` über das gemeinsame Netz `topstack-edge`.
- **Dasselbe Image:** Die Umgebung kommt beim Start aus der Umgebung (`TOPSTACK_ENVIRONMENT=staging`, `TOPSTACK_PUBLIC_ORIGIN`). Die App zeigt danach ein Beta-Band und heißt „TopStack Beta“; Manifest und Icons liefert die Staging-Caddyfile aus `/srv/app/beta`.
- **Automatisch aktuell:** derselbe `deploy.sh` mit `TOPSTACK_STACK=staging` und eigenem Timer; Kanal `main` oder `pr-<Nummer>`. Die CI baut dafür zu jedem PR aus dem eigenen Repo Images `pr-<Nummer>`; `scripts/stage.sh` schaltet am PC um, nach dem Merge springt Staging von selbst zurück.
- **Schutz:** Cloudflare Access vor `beta.topstack.win`, kein Push, Anmeldelinks nur an Adressen aus `MAIL_ALLOWLIST`, `X-Robots-Tag: noindex`. Kein Backup, Monitor ohne Alarm in der Nacht.

## Alternativen
- **Pfad `/beta` auf der echten Domain:** siehe oben, vermischt Speicher, Cookies und Passkeys.
- **Eigener Rechner oder Mietserver:** mehr Kosten und Pflege für eine Umgebung, die nur Peter und ein paar Tester nutzen.
- **Vorschau-Umgebung pro PR (mehrere gleichzeitig):** zu viel für einen Mini-PC; ein umschaltbarer Stand reicht.

## Folgen
- Bis v1.0 folgen Produktion und Staging beide `main` und teilen sich auf dem Heimserver die Image-Namen `…:main`; ein Rollback auf Staging wirkt dann auch auf den nächsten Durchlauf der Produktion. Ab v1.0 sind beide getrennt.
- Migrationen aus einem nicht gemergten PR bleiben in der Staging-Datenbank; dann wird sie neu angelegt.
- In ghcr.io sammeln sich `pr-…`-Images; Aufräumen kommt später.
- Später möglich: nächtlich das letzte Backup der Produktion einspielen; eigener MQTT-Bereich fürs Steuergerät (v3.0).
