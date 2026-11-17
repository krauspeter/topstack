# ADR-0007: Betrieb auf dem Mini-PC mit Docker Compose, Caddy und Cloudflare Tunnel

- Status: angenommen
- Datum: 2026-11-15

## Kontext
Selbst gehostet, rund um die Uhr, wenig Strom. Keine offenen Ports am Router.

## Entscheidung
- TopStack läuft auf dem Mini-PC (Heimserver). Der Ryzen-PC wird erst ab Phase 8 für KI-Training genutzt.
- Alle Dienste in Docker Compose: `caddy`, `api`, `db`, `mqtt`, später `backup` und Monitoring.
- Fernzugriff über Cloudflare Tunnel auf eine eigene Domain; Caddy liefert die App aus und leitet `/api` und `/ws` weiter.
- Images werden in der CI gebaut und in die GitHub Container Registry (ghcr.io) geschoben.

## Alternativen
- Ryzen-PC als Server: mehr Leistung, aber deutlich höherer Dauerstromverbrauch.
- Port-Freigabe mit DynDNS: einfacher, aber angreifbar.

## Folgen
Die Domain wird vor Phase 3 gebraucht (Passkeys hängen an der Domain).
