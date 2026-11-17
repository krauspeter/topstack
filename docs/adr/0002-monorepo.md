# ADR-0002: Monorepo mit app, server, firmware, docs

- Status: angenommen
- Datum: 2026-11-15

## Kontext
App, Backend und Firmware teilen sich das Ereignisformat und die Schnittstellen. Ein Entwickler, wenig Zeit.

## Entscheidung
Ein öffentliches GitHub-Repo `topstack` mit den Ordnern `app/`, `server/`, `firmware/`, `infra/`, `docs/`, `scripts/`. Die CI baut nur die Teile, die sich geändert haben (Pfadfilter).

## Alternativen
- Mehrere Repos: saubere Trennung, aber Schnittstellenänderungen brauchen mehrere PRs.

## Folgen
Eine Schnittstellenänderung ist ein PR. Das Repo zeigt im Portfolio das ganze System an einer Stelle.
