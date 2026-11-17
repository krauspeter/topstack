# ADR-0003: Frontend als React-PWA mit TypeScript und Vite

- Status: angenommen
- Datum: 2026-11-15

## Kontext
Die Gruppe nutzt iPhones und Android gemischt. Kein App-Store (N-03). Der Life-Tracker muss offline laufen (N-01) und mit einer Hand bedienbar sein (N-02).

## Entscheidung
React 18 mit TypeScript, gebaut mit Vite, als PWA über `vite-plugin-pwa` (Workbox). Lokale Daten in IndexedDB über Dexie. Tests mit Vitest, End-to-End mit Playwright. Bildschirm bleibt über die Wake-Lock-API an.

## Alternativen
- Svelte: weniger Code, aber seltener in Stellenanzeigen.
- Native Apps / React Native: App-Store nötig, doppelter Aufwand.

## Folgen
- Ein Code für alle Handys, gut fürs Portfolio.
- iOS-Grenzen: Web Push nur bei installierter App (ab iOS 16.4), kein Web Bluetooth. Deshalb früh auf dem iPhone testen.
