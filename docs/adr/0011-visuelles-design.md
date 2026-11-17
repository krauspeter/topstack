# ADR-0011: Visuelles Design „Dunkel & Gold“, weitere Themes später

- Status: angenommen
- Datum: 2026-11-17

## Kontext
Für v1.0 wurden vier Designrichtungen als Wireframes verglichen (Life-Tracker, Live-Ansicht, Rangliste):
A Dunkel & Gold, B Pergament, C Arcade, D Minimal hell.

## Entscheidung
- v1.0 nutzt **A · Dunkel & Gold**: dunkler Grund (#121218), Flächen #1e1e28, Linien #3a3a48, Text #f2f0ea, gedämpfter Text #a6a3b3, Akzent Gold #e8c26a, Schrift Inter.
- Farben, Schriften, Radien und Abstände liegen von Anfang an als Design-Tokens (CSS-Variablen) an einer Stelle, nie fest im Komponenten-Code.
- B, C und D bleiben als mögliche wählbare Themes in den Einstellungen im Backlog.

## Folgen
Ein späteres Theme ist nur ein weiterer Satz Tokens. Kontraste müssen pro Theme geprüft werden (Text mindestens 4.5:1).
