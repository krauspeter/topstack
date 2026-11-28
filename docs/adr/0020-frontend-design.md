# ADR-0020: Frontend-Design mit dem Plugin „frontend-design“, Weiterentwicklung von „Dunkel & Gold“

- Status: angenommen (28.11.2026)
- Datum: 2026-11-28
- Ergänzt: [ADR-0011](0011-visuelles-design.md)

## Kontext
Bis v1.0 entstand die Oberfläche nebenbei aus den Wireframes von Phase 1. Ab Phase 5 kommen viele neue Bildschirme dazu (Elo, Head-to-Head, Awards, Teilen-Bild, Tisch-Modus), und die bestehenden sollen besser aussehen, ohne auf das große Redesign v3.1 zu warten. Claude Code bringt dafür das Plugin `frontend-design` mit. Die Vorgaben stammen aus einer Befragung mit 30 Fragen am 28.11.2026.

## Entscheidung

**Einsatz und Ablauf**
- Das Plugin `frontend-design` gilt ab sofort (ab AP-5) für **neue Bildschirme von Phase 5** und für die **schrittweise Überarbeitung bestehender Bildschirme** (F1, F4).
- **Erst Entwurf, dann bauen** (F3): Vor einem neuen oder überarbeiteten Bildschirm zeigt Claude 1–2 Entwürfe als Seite zum Anschauen; Peter wählt, dann wird gebaut.
- Reihenfolge der Überarbeitung (F21): Turnier-Ansicht, Startseite, Rangliste & Statistik, Profil & Gruppe. Der **Life-Tracker** bekommt nur Feinschliff, die Bedienung bleibt (F22).

**Stil**
- **„Dunkel & Gold“ wird weiterentwickelt**, nicht ersetzt (F2): ausdrucksstärker in Typografie, Tiefe und Details. **Nur dunkel**, kein helles Erscheinungsbild vor den Themes in v2.0 (F9).
- Stimmung **edel und ruhig**, wie ein gutes Spielbrett; Gold markiert weiterhin genau einen nächsten Schritt (F5, ADR-0011).
- **Magic dezent** (F6): Manafarben und Mana-Symbole, keine Kartenrahmen oder Fantasy-Texturen (Fan Content Policy).
- **Schriften** (F7): Inter für Text und Zahlen, dazu eine markante Display-Schrift für Überschriften und große Zahlen (z. B. Lebenspunkte). Selbst gehostet, offline verfügbar.
- **Farben** (F8): Außer Gold und Grautönen nur die Manafarben (WUBRG) für Spieler. Keine Gruppen-Akzentfarbe vor v3.1.
- **Tonfall** (F30): Du, freundlich und knapp, wie heute.

**Bedienung und Geräte**
- **Barrierefreiheit WCAG AA** (F10): Kontrast mindestens 4,5:1, Bedienung per Tastatur und Screenreader, sichtbarer Fokus.
- **Hauptaktion unten** im Daumenbereich, Tippflächen mindestens 48 px (F11).
- **Navigation über eine untere Tab-Leiste** (F19): Start, Turniere, Rangliste, Profil; im Life-Tracker und in Vollbild-Abläufen (Würfeln, Auslosung) ausgeblendet. Ersetzt die heutigen Knöpfe auf der Startseite und viele „Zurück“-Knöpfe.
- **Hauptgerät Android-Handy** (F17); iPhone, Tablet und Desktop müssen funktionieren, werden aber nicht eigens optimiert.
- **Mobile-first** (F18): schmale Spalte; Tabellen, Statistik und Altdaten-Import nutzen am breiten Bildschirm mehr Breite. **Querformat nur im Life-Tracker** (F20).

**Bewegung und Rückmeldung**
- **Animation gezielt an Höhepunkten** (F13, F14): Siegerehrung und Awards, Würfeln und Auslosung. Sonst ruhig; keine Seitenübergänge, keine animierten Lebenspunkte.
- **„Bewegung reduzieren“** im System wird respektiert (F12).
- **Vibration wie bisher**, keine Töne (F15).
- **Ladezustände als Platzhalter-Gerüst** (Skeleton) statt „Lade …“ (F16).
- **Leere Zustände** nennen den nächsten Schritt mit Knopf; kein Onboarding-Tutorial vor v3.1 (F28).

**Technik**
- **Eigene CSS-Tokens** in `app/src/styles.css` und `app/src/theme.ts` bleiben, ausgebaut zu einem kleinen Satz wiederverwendbarer Komponenten; kein Tailwind, keine Komponentenbibliothek (F25).
- **Icons** (F26): eine einheitliche Linien-Icon-Sammlung (Lucide) für Navigation und Aktionen, die bestehenden Mana-Symbole und eigene SVGs (Logo, Besonderes).
- **Bilder** (F27): Gruppenbild und Avatare; Kartenbilder über Scryfall, sobald sie mit v2.1 kommen. Keine Fotos oder Illustrationen sonst.
- **Diagramme als eigenes SVG** (F23, F24): Tabellen bleiben, dazu kleine Linien- und Balkendiagramme (Elo-Verlauf, Platzierungen); keine Diagramm-Bibliothek.
- **Qualitätsprüfung** (F29): Jede PR mit sichtbaren Änderungen zeigt Vorher/Nachher-Screenshots auf Handy-Größe; dazu **visuelle Regressionstests** mit Playwright in der CI.

## Alternativen
- **Redesign v3.1 vorziehen:** zu groß neben den Funktionen von Phase 5.
- **Tailwind oder Komponentenbibliothek:** schneller beim Bauen, aber Umbau aller Bildschirme und größeres Paket für die Offline-PWA.
- **Helles Erscheinungsbild jetzt:** doppelte Pflege der Kontraste, Themes sind für v2.0 geplant.

## Folgen
- Neues Paket `lucide-react` für Icons (nur die genutzten Icons landen im Bundle) und eine selbst gehostete Display-Schrift.
- Die untere Tab-Leiste verändert die Navigation aller Bildschirme; sie kommt als eigener PR mit Entwurf vorab.
- Visuelle Regressionstests brauchen Referenz-Screenshots im Repo und feste Testdaten; sie laufen nur auf Android (Pixel 7), damit die Bilder stabil bleiben.
- Die Antworten im Einzelnen (F1–F30) stehen im Phase-5-Plan, Abschnitt 6.
