# TopStack testen – Anleitung

So prüfst du jederzeit den aktuellen Stand der App: am Computer, auf dem Handy und mit den automatischen Tests.

Alle Befehle sind für **Git Bash** unter Windows geschrieben.

---

## 0. Kurzfassung

```bash
cd /d/OneDrive/Projekte/git/Projects/topstack
git switch main
git pull
cd app
npm install
npm run dev -- --host
```

Dann `http://localhost:5173` am PC öffnen oder die angezeigte `Network`-Adresse auf dem Handy.

---

## 1. Neuesten Stand holen

Jedes neue Git-Bash-Fenster startet in deinem Benutzerordner. Wechsle deshalb immer zuerst ins Projekt:

```bash
cd /d/OneDrive/Projekte/git/Projects/topstack
```

**Den gemergten Stand testen (empfohlen):**

```bash
git switch main
git pull
```

**Einen Branch testen, der noch nicht gemergt ist:**

```bash
git branch            # zeigt alle lokalen Branches, * = aktueller
git switch feat/name-des-branches
```

**Wo stehe ich gerade?**

```bash
git status            # aktueller Branch und geänderte Dateien
git log --oneline -5  # die letzten 5 Commits
```

Danach in den App-Ordner wechseln und die Pakete aktualisieren. Das ist nur nötig, wenn sich `package.json` geändert hat, schadet aber nie:

```bash
cd app
npm install
```

> **Tipp:** Im Explorer den Ordner `topstack\app` öffnen, Rechtsklick → **„Open Git Bash here“**. Dann bist du gleich am richtigen Ort.

---

## 2. Am Computer testen

```bash
npm run dev
```

- `http://localhost:5173` in Chrome öffnen.
- **Handy-Ansicht:** `F12`, dann `Strg+Umschalt+M`, oben ein Gerät wählen (z. B. iPhone 14 oder Pixel 7).
- Änderungen am Code erscheinen sofort, ohne Neuladen.
- Beenden mit `Strg+C` im Terminal.

---

## 3. Auf dem Handy testen

### Variante A: Im WLAN (schnell)

```bash
npm run dev -- --host
```

1. Im Terminal steht eine Zeile wie `Network: http://192.168.178.23:5173/`.
2. Diese Adresse auf dem Handy öffnen. Handy und PC müssen im **selben WLAN** sein.
3. Fragt Windows nach der Firewall: Zugriff für **private Netzwerke** erlauben.

Gut für Layout, Tippen und Abläufe. **Nicht** möglich: App installieren, „Bildschirm bleibt an“, Offline. Dafür braucht es HTTPS (Variante B).

### Variante B: Als echte App über HTTPS (auch für Freunde)

Einmalig installieren (PowerShell):

```powershell
winget install Cloudflare.cloudflared
```

**Terminal 1** (im Ordner `app`):

```bash
npm run build
npm run preview
```

**Terminal 2** (neues Fenster, Ordner egal):

```bash
cloudflared tunnel --url http://localhost:4173
```

- Nach ein paar Sekunden erscheint eine Adresse wie `https://xyz-abc.trycloudflare.com`.
- **iPhone:** in Safari öffnen → Teilen-Symbol → **„Zum Home-Bildschirm“**.
- **Android:** in Chrome öffnen → Menü ⋮ → **„App installieren“**.
- Die Adresse gilt nur, solange **beide** Fenster offen sind, und ist bei jedem Start neu.
- Nach einer Codeänderung `Strg+C` in Terminal 1 und `npm run build` und `npm run preview` erneut ausführen.

---

## 4. Automatische Tests lokal ausführen

Im Ordner `app`:

| Befehl | Prüft | Dauer |
| --- | --- | --- |
| `npm run lint` | Code-Stil und typische Fehler | Sekunden |
| `npm run typecheck` | TypeScript-Typen | Sekunden |
| `npm test` | Unit-Tests der Spiellogik (Match, Würfel, Auslosung, Zeitlimit) | Sekunden |
| `npm run build` | Ob die App sich bauen lässt | ca. 30 s |
| `npm run test:e2e` | Klickt die App wie ein Mensch durch (iPhone- und Android-Ansicht) | ca. 1 min |

**Alles auf einmal (wie die CI):**

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

**Einmalig vor dem ersten End-to-End-Test:** die Test-Browser installieren:

```bash
npx playwright install
```

**Testbericht ansehen**, wenn ein End-to-End-Test rot ist:

```bash
npx playwright show-report
```

Der Bericht zeigt Screenshots und eine Aufzeichnung des Fehlers.

> Beim `git push` laufen Lint, Typecheck, Unit-Tests und Build automatisch (Pre-Push-Hook), wenn `pre-commit` eingerichtet ist.

---

## 5. Stand auf GitHub prüfen

- **CI-Läufe:** https://github.com/krauspeter/topstack/actions
  Grüner Haken = alles bestanden. Roter Kreis = anklicken, dann den roten Schritt aufklappen.
- **Offene Pull Requests:** https://github.com/krauspeter/topstack/pulls
- **Neuen Branch hochladen und mergen:**
  1. `git push -u origin feat/name-des-branches`
  2. Auf GitHub **„Compare & pull request“** → **„Create pull request“**
  3. Warten, bis die Checks grün sind → **„Merge pull request“** → **„Confirm merge“** → **„Delete branch“**
  4. Lokal: `git switch main` und `git pull`

---

## 6. Was du beim Testen durchklicken solltest

Eine kurze Checkliste für einen vollständigen Durchlauf:

- [ ] **Neues Match:** Namen, Farben (W U B R G), Startleben, Zeitlimit wählen
- [ ] **W20-Wurf:** beide würfeln; bei Gleichstand neu; der Gewinner wählt, wer beginnt
- [ ] **Lebenspunkte:** Tippen ±1, Halten ±5, Anzeige der letzten Änderung (z. B. „−7“)
- [ ] **Rückgängig** (↶) nimmt die letzte Änderung zurück
- [ ] **Neu laden** (oder App schließen und öffnen): Spielstand ist noch da
- [ ] **0 Leben:** App schlägt den Sieg vor
- [ ] **Spiel 2:** Der Verlierer wählt, wer beginnt
- [ ] **Menü (⋯):** Aufgeben, Match abbrechen
- [ ] **Zeitlimit:** Countdown läuft, nach Ablauf Hinweis und „Spiel unentschieden beenden“
- [ ] **Siegerbildschirm:** Ergebnis, Spieldauer, Rückspiel
- [ ] **Draftplätze:** Namen eintragen, auslosen, auf den Tisch tippen für Booster 2 und 3
- [ ] **Handy:** Bildschirm bleibt an, App funktioniert im Flugmodus (nur Variante B)

---

## 7. Spielstand zurücksetzen

- **In der App:** Menü (⋯) → **„Match abbrechen“**
- **Am PC (alles löschen):** `F12` → **Application** → **Storage** → **„Clear site data“**
- **iPhone:** Einstellungen → Safari → Erweitert → Website-Daten → Eintrag löschen
- **Android:** Chrome → ⋮ → Einstellungen → Website-Einstellungen → Alle Websites → Eintrag → Daten löschen

---

## 8. Häufige Fehler

| Meldung | Ursache | Lösung |
| --- | --- | --- |
| `Could not read package.json ... C:\Users\Peter\package.json` | Terminal steht im falschen Ordner | `cd /d/OneDrive/Projekte/git/Projects/topstack/app` |
| `command not found: cloudflared` | Noch nicht installiert oder Terminal zu alt | `winget install Cloudflare.cloudflared`, Git Bash neu öffnen |
| `Blocked request. This host is not allowed` | Vite kennt die Tunnel-Adresse nicht | Neuesten Stand holen (`git pull`), dort ist es erlaubt |
| Handy erreicht die WLAN-Adresse nicht | Firewall oder anderes WLAN | Zugriff für private Netzwerke erlauben, gleiches WLAN prüfen |
| `Port 5173 is in use` | Läuft schon in einem anderen Fenster | Anderes Fenster mit `Strg+C` beenden |
| Alte Version auf dem Handy | Service Worker hält den alten Stand | Seite zweimal neu laden oder App schließen und wieder öffnen |
| `Executable doesn't exist` bei `test:e2e` | Test-Browser fehlen | `npx playwright install` |

---

## 9. Rückmeldung geben

Screenshot machen, kurz beschreiben, was stören oder fehlen, und in den Chat mit Claude im Projekt „MTG App“ schicken. Kleine Layout-Änderungen werden direkt umgesetzt, größere Wünsche in der Roadmap eingeplant.
