# ADR-0021: Stabile Updates der PWA, Cloudflare Access nur vor der API

- Status: angenommen (28.11.2026)
- Datum: 2026-11-28
- Ergänzt: [ADR-0012](0012-sync-app-server.md), [ADR-0017](0017-staging.md)

## Kontext
Am 27. und 28.11.2026 zeigte Beta auf PC und Handy tagelang „Update #164“, obwohl der Server längst #192 und neuer lieferte. Ursache:

1. Beta liegt komplett hinter Cloudflare Access (ADR-0017). Läuft die Access-Sitzung ab, leitet Cloudflare **jede** Anfrage zur Anmeldung um, auch `sw.js`, `index.html` und die JavaScript-Dateien.
2. Der Service Worker (vite-plugin-pwa, `autoUpdate`) holt eine neue Version nur, wenn er `sw.js` laden kann. Die Umleitung lässt das Update still scheitern, und die App zeigt weiter die Version aus dem Zwischenspeicher.
3. Die App prüft nie selbst, ob der Server neuer ist. Der Knopf „Seite neu laden“ führte nicht zuverlässig aus dieser Lage heraus; geholfen hat nur, die Website-Daten von Hand zu löschen.

Die Caddy-Header sind richtig (`sw.js` und `index.html` mit `no-cache`, gehashte Dateien unveränderlich). Die Produktion hat kein Access, kann aber auf anderen Wegen (Netzfehler beim Update, App lange im Hintergrund) ebenfalls auf einem alten Stand hängen bleiben.

## Entscheidung (Befragung vom 28.11.2026)
- **Cloudflare Access nur vor der API** (S1): Auf `beta.topstack.win` schützt Access nur noch `/api/*` und `/ws`. Die App-Dateien (`/`, `/assets/*`, `/sw.js`, Manifest, Icons, Schriften) sind ohne Anmeldung ladbar. Das ist vertretbar, weil der Code ohnehin im öffentlichen Repo liegt; alle Daten bleiben hinter Access, `X-Robots-Tag: noindex` bleibt.
- **Veraltete App erkennen** (S2): Die App vergleicht ihre eingebaute Update-Nummer (`BUILD.pr`) mit `build.pr` aus `/api/v1/health`, beim Start und beim Zurückkehren in die App. Zusätzlich fragt sie den Service Worker beim Öffnen und alle 30 Minuten aktiv nach einer neuen `sw.js` (`registration.update()`).
- **Hinweis mit Knopf** (S3): Liegt eine neue Version bereit, erscheint „Neue Version da – jetzt laden“. Während eines laufenden Matches (Life-Tracker offen) kommt der Hinweis erst nach Matchende (N-06). Der Knopf aktiviert den wartenden Service Worker und lädt die Seite einmal neu.
- **Abgelaufene Access-Anmeldung** (S5): Die App erkennt die Umleitung der API, zeigt einen Hinweis und führt mit einem Knopf sicher zur Cloudflare-Anmeldung und danach an dieselbe Stelle zurück. Was offline geht (Life-Tracker, freies Match), läuft weiter.
- **Notausgang „App zurücksetzen“** (S4) im Profil und im Offline-Hinweis: meldet den Service Worker ab und leert seine Zwischenspeicher, lädt neu. **Spielstände und Outbox in IndexedDB bleiben erhalten**, die Anmeldung (Cookie) auch.
- **Prüfung** (S6): E2E-Test „veraltete App“ (neuere Update-Nummer → Hinweis → Neuladen; Access abgelaufen → Hinweis und Weg zur Anmeldung); Smoke-Test in der CI, dass `sw.js`, `index.html` und `/assets` im Staging-Stack mit den richtigen Cache-Headern kommen; Uptime-Kuma-Monitor „Beta App“ auf `https://beta.topstack.win/sw.js` ohne Anmeldung.
- **Kein Melden des Gerätestands** an den Server (S7): Hinweis und Notausgang reichen für eine Gruppe.
- **Priorität** (S8): sofort, als AP-14 vor AP-7, damit Tests auf Beta verlässlich sind und v1.1.0 den Schutz schon hat.

## Alternativen
- **Längere Access-Sitzung:** macht das Problem seltener, löst es nicht.
- **Sofort automatisch neu laden:** würde ein laufendes Match oder eine Eingabe unterbrechen.
- **Reset-Seite ohne App (`/reset` mit `Clear-Site-Data`):** würde auch die Spielstände in IndexedDB löschen; der Knopf in der App kann gezielter löschen.

## Folgen
- Peter stellt die Access-Anwendung „TopStack Beta“ in Cloudflare auf die Pfade `/api/*` und `/ws` um (Anleitung in `docs/phase3/heimserver.md`, Abschnitt Staging). Erledigt am 28.11.2026; dabei fiel auf, dass Cloudflare mit der Standard-„Browser Cache TTL“ (4 h) das `no-cache` für `sw.js` und `push-sw.js` überschrieb. Seitdem steht sie auf „Respect Existing Headers“ (Produktion und Beta).
- Neue Uptime-Kuma-Überwachung für `beta.topstack.win/sw.js`.
- Die Anforderung steht als N-07 in der Roadmap, die Umsetzung als AP-14 im Phase-5-Plan (Testfälle TC-163 bis TC-167).
