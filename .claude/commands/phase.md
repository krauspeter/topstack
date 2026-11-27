---
description: Eine neue Phase planen (z. B. /phase 5) – Roadmap lesen, Fragen klären, Plan anlegen
argument-hint: Nummer der Phase
---

Plane **Phase $ARGUMENTS** von TopStack nach dem Ablauf in CLAUDE.md („Eine neue Phase beginnen“).

1. Lies in `docs/roadmap.md` den Abschnitt zu Phase $ARGUMENTS (Inhalt, Festlegungen, Gate) sowie die Anforderungen und Use Cases, die dazu gehören. Lies zum Vorbild `docs/phase4/README.md` und die ADRs, die das Thema berühren.
2. Schau dir den aktuellen Code an, der betroffen ist (Datenmodell in `server/topstack/db/models.py` und `docs/schema.sql`, passende Services, Bildschirme), damit der Plan auf dem echten Stand aufsetzt.
3. Sammle offene Fragen und stell sie Peter als kurze Multiple-Choice-Fragen, höchstens 10 auf einmal, jeweils mit einer Empfehlung. Erst danach weiter.
4. Leg `docs/phase$ARGUMENTS/README.md` an: Ziel und Gate, Entscheidungen mit Datum, Arbeitspakete AP-0, AP-1, … mit Schätzung in Stunden und Abhängigkeiten (Mermaid-Diagramm), Aufgaben als Checklisten, Testfälle fortlaufend nummeriert ab der nächsten freien TC-Nummer, Risiken. Architekturentscheidungen als neue ADR in `docs/adr/` (nächste freie Nummer).
5. Aktualisiere `docs/roadmap.md` (Status der Phase) und, falls nötig, `scripts/backlog.tsv`.
6. Branch `docs/phase$ARGUMENTS-plan`, Commit auf Englisch mit Beschreibung, PR mit deutscher Beschreibung, CI abwarten. Danach mit Peter AP-0 starten.
