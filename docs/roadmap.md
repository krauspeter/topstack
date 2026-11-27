# TopStack – Roadmap

Stand: 27.11.2026 · **v1.0.1 läuft in der Produktion, Phasen 0 bis 4 sind abgeschlossen. Phase 5 (v1.1: Gruppen & Altdaten) ist geplant und beginnt am 28.11.2026, Plan in [`docs/phase5/README.md`](phase5/README.md).**

Diese Datei ist die Quelle für Plan, Anforderungen und Festlegungen. Sie ersetzt die frühere Fassung im Claude-Projekt „TopStack“ (Stand 23.11.2026). Die Pläne der einzelnen Phasen liegen unter `docs/phase<N>/README.md`, Architekturentscheidungen unter `docs/adr/`.

## Vision & Ziele

TopStack ist eine selbst gehostete App für MTG-Spielgruppen, zunächst für Draft, später für weitere Formate: Sie zählt im Spiel die Lebenspunkte, speichert danach die Turnierergebnisse und führt eine dauerhafte Rangliste. Später kommt ein eigenes Steuergerät als physischer Life-Counter dazu.

- **Im Spiel:** schneller Life-Tracker auf jedem Handy, auch ohne Internet.
- **Nach dem Spiel:** ein Turnierergebnis ist in unter 2 Minuten erfasst.
- **Langfristig:** Rangliste pro Saison und gesamt, für alle Freunde einsehbar.
- **Öffentlich:** Ab v4.0 können fremde Gruppen TopStack selbst nutzen, auch über App Store und Google Play.
- **Hardware:** Embedded-Controller mit Tastern und Display, an das System angebunden.
- **Portfolio:** Ein Projekt zeigt Embedded, Backend, Frontend, DevOps und später KI.

Annahmen für den Zeitplan: etwa 6 Stunden pro Woche neben dem Job. Betrieben wird alles auf dem Heimserver; vor dem öffentlichen Start (v4.0) kommt ein Mietserver dazu.

## Zeitplan & Meilensteine

Reihenfolge der Releases (festgelegt am 22.11.2026): v1.0 → v1.1 → v1.2 → v1.3 → v1.4 → v2.0 → v2.1 → v3.0 (Hardware) → v3.1 (Design) → v4.0 (öffentlicher Start).

| Phase | Version | Zeitraum | Inhalt | Wer nutzt es | Gate |
| --- | --- | --- | --- | --- | --- |
| 0 · Anforderungserhebung | – | Nov 2026 · **abgeschlossen** | Use Cases, Anforderungsliste, Punkteregeln mit den Freunden | – | G0 · Go der Gruppe am 15.11.2026 |
| 1 · Architektur & Design | – | 15. bis 17.11.2026 · **abgeschlossen** | Tech-Stack, Datenmodell, Wireframes, Repo und CI | – | G1 · erreicht am 17.11.2026 |
| 2 · MVP Life-Tracker | v0.1 | 17. bis 18.11.2026 · **abgeschlossen** | Offline-PWA: Life-Tracker, Würfeln, Draftplätze auslosen | Peter | G2 · übersprungen (18.11.2026) |
| 3 · Backend, Turniere & Rangliste | v0.x | 18. bis 21.11.2026 · **abgeschlossen** | Heimserver, Draft-Turniere mit Einladung, Live-Verlauf, Statistik | Peter und Testspieler | G3 · entfallen (27.11.2026) |
| 4 · Beta & Betrieb | **v1.0** | 21. bis 27.11.2026 · **abgeschlossen** | Backups, Monitoring, automatisches Deployment, Staging, Versionen, Feedback, Rollout | die Gruppe | G4 · erreicht am 27.11.2026 (v1.0.0 und v1.0.1 am 25.11.2026) |
| 5 · Gruppen & Altdaten | **v1.1** | ab 28.11.2026 · **gestartet** · ca. 11 Wochen, v1.1.0 Ende Jan, v1.1.1 Mitte Feb 2027 | Gruppen, Altdaten-Import, Elo, Head-to-Head, Awards, Tisch-Modus | + befreundete Gruppen per Einladung | G5 · Altdaten importiert, zweite Gruppe kann starten |
| 6 · Terminumfrage & Ausgaben | **v1.2** | Apr bis Mitte Mai 2027 · 5–6 Wochen | Spieleabende planen: Abstimmung, Kalender-Export, Erinnerung; Ausgaben teilen | alle Gruppen (auf Einladung) | G6 · Spieleabend per Terminumfrage geplant |
| 7 · Sealed | **v1.3** | Mitte Mai bis Mitte Jun 2027 · 3–4 Wochen | Sealed-Turniere: Set, Booster-Anzahl, Deckbau-Timer, keine Draftplätze | alle Gruppen | G7 · Sealed-Turnier gespielt |
| 8 · Constructed | **v1.4** | Mitte Jun bis Jul 2027 · 6–7 Wochen | Constructed-Turniere mit Format, Schweizer System, optional Top-Cut | alle Gruppen | G8 · Constructed-Turnier mit Schweizer System gespielt |
| 9 · Sprachen, Statistik & KI | **v2.0** | Aug bis Okt 2027 · 10–12 Wochen | Englisch und Portugiesisch, Themes, Datenexport, erweiterte Statistik, KI-Zusammenfassung, KI-Prognose | alle Gruppen | G9 · App mehrsprachig, KI-Zusammenfassung nach einem Turnier |
| 10 · Commander | **v2.1** | Nov 2027 bis Jan 2028 · 8–10 Wochen | Commander mit 3–6 Spielern, Commander-Schaden, Scryfall | alle Gruppen | G10 · Commander-Spiel mit 4 Spielern läuft |
| 11 · Hardware / Steuergerät | **v3.0** | Feb bis Mai 2028 · 8–12 Wochen | ESP32-Controller mit Display, MQTT-Anbindung, Gehäuse | alle mit Controller | G11 · Spieleabend komplett mit dem Controller |
| 12 · Design & Marke | **v3.1** | Jun bis Aug 2028 · 8–10 Wochen | Redesign aller Bildschirme, Logo und App-Icon, Design System, Store-Material, Onboarding | alle Gruppen | G12 · Alles im neuen Design, Store-Material fertig |
| 13 · Öffentlicher Start & App-Stores | **v4.0** | Sep bis Nov 2028 · 10–12 Wochen | Offene Registrierung, Recht und Datenschutz, Lasttest, Betrieb für Fremde, Android- und iOS-App in den Stores | **jeder, auch fremde Gruppen** | G13 · App in beiden Stores, erste fremde Gruppe aktiv |

Eine Phase beginnt erst, wenn ihr Gate erreicht ist. Die Hardware kommt nach allen Spielformaten und vor dem öffentlichen Start (22.11.2026). Bei mehr Zeit kann Phase 11 früher parallel laufen, weil sie nur die Ereignis-Schnittstelle aus Phase 1 braucht. Phase 5 darf früher beginnen als geplant, wenn Peter Zeit hat.

**Wann kommen fremde Nutzer dazu? (festgelegt am 22.11.2026)**

- **v1.0:** nur die eigene Gruppe, Zugang nur per Einladung.
- **v1.1 bis v1.4:** weitere Gruppen, aber nur auf Einladung.
- **v2.0 bis v3.1:** wie v1.x; Englisch und Portugiesisch bereiten den öffentlichen Start vor.
- **v4.0:** öffentlicher Start. Jeder kann sich registrieren und eine Gruppe anlegen, die App steht im App Store und bei Google Play.

## Anforderungen (Phase 0, Stand 22.11.2026)

**Fokus: Draft-Turniere.** Ablauf eines Turniers:

1. **Start:** Jeder Spieler kann ein Turnier starten und wählt das Set (Pflichtfeld). Einladung per Link, QR-Code oder aus der Spielerliste, Gäste sind erlaubt.
2. **Plätze:** Der Turnierstarter lost die Draftplätze zufällig aus, damit ist die Anmeldung geschlossen. Runde Tischgrafik mit Passrichtung je Booster.
3. **Draft & Deckbau:** Pick- und Deckbau-Timer zuschaltbar. Nach dem Deckbau trägt jeder seine Farben ein (kein Archetyp). Runde 1 wird manuell gestartet.
4. **Paarungen:** Jeder gegen jeden in festen Runden, die ersten Paarungen zufällig. Bei ungerader Spielerzahl pausiert jemand. Sind mehrere Spieler frei, schlägt die App ein offenes Match vor, längste Pause zuerst.
5. **Match:** Best-of-3, Zeitlimit zuschaltbar. Beide würfeln W20, der höhere Wurf entscheidet, wer Spiel 1 beginnt; danach entscheidet der Verlierer. Der Life-Tracker zählt nur Lebenspunkte, auf einem gemeinsamen oder auf beiden Handys. Ein Spielsieg geht automatisch ins Match.
6. **Ergebnis:** Einer der beiden Spieler trägt ein, beide dürfen bis Turnierende korrigieren. Unentschieden sind möglich. Die nächste Runde kann jeder Teilnehmer starten.
7. **Live:** Alle Eingeladenen sehen laufende Matches, Pausen, offene Matches, die Tabelle und die Lebenspunkte. Push bei „Du bist dran“, neuer Runde und Turnierende.
8. **Wertung:** 3/1/0 Punkte pro Match, Tiebreaker siehe Punkteregeln. Das Turnier endet, wenn alle Matches gespielt sind.
9. **Langzeit:** Rangliste mit Punkten nach Platzierung, Summe der Matchpunkte, Durchschnitt pro Turnier und Elo. Statistiken zu Turniersiegen, Platzierungen, Siegquoten, Head-to-Head und Farben.

Bewusst nicht vorgesehen: Archetypen, Fotos, Mulligans. Gift und weitere Zähler kommen für Commander (v2.1), Drop für das Schweizer System (v1.4), statt Preisen werden die Ausgaben eines Abends geteilt (v1.2).

| ID | Anforderung | Priorität | Stand |
| --- | --- | --- | --- |
| F-01 | Jeder Spieler kann ein Draft-Turnier starten, Set ist Pflichtfeld | Must | v1.0 |
| F-02 | Einladen per Link, QR-Code oder aus der Spielerliste, Gäste erlaubt | Must | v1.0 |
| F-03 | Turnierstarter lost Draftplätze zufällig aus, danach ist die Anmeldung geschlossen | Must | v1.0 |
| F-04 | Runde Tischgrafik mit Passrichtung je Booster | Must | v1.0 |
| F-05 | Pick- und Deckbau-Timer, zuschaltbar | Could | offen |
| F-06 | Farben (WUBRG) nach dem Deckbau erfassen, für alle sofort sichtbar | Must | v1.0 |
| F-07 | Jeder gegen jeden in festen Runden, bei ungerader Zahl pausiert ein Spieler | Must | v1.0 |
| F-08 | Freie Spieler bekommen ein offenes Match vorgeschlagen, längste Pause zuerst | Must | v1.0 |
| F-09 | Best-of-3, W20-Wurf: der Gewinner wählt, wer Spiel 1 beginnt; danach entscheidet der Verlierer | Must | v1.0 |
| F-10 | Life-Tracker nur für Lebenspunkte; pro Match wählbar: ein gemeinsames Handy oder jeder sein eigenes | Must | v1.0 |
| F-11 | Spielsieg geht automatisch ins Matchergebnis | Must | v1.0 |
| F-12 | Match-Zeitlimit, zuschaltbar | Must | v1.0 |
| F-13 | Ergebnis trägt ein Spieler ein, Beteiligte korrigieren bis Turnierende, Unentschieden möglich | Must | v1.0 |
| F-14 | Nächste Runde kann jeder Teilnehmer starten | Must | v1.0 |
| F-15 | Live-Ansicht: laufende Matches, Pausen, offene Matches, Tabelle, Lebenspunkte | Must | v1.0 |
| F-16 | Turniertabelle mit 3/1/0 Punkten, Tiebreaker: direkter Vergleich, dann Spieldifferenz | Must | v1.0 |
| F-17 | Push bei „Du bist dran“, neuer Runde und Turnierende | Must | v1.0 |
| F-18 | Rangliste: Punkte nach Platzierung, Summe und Durchschnitt der Matchpunkte | Must | v1.0 |
| F-19 | Elo-Wertung | Should | v1.1 |
| F-20 | Weitere Formate: Sealed v1.3, Constructed v1.4, Commander v2.1 | Must | geplant |
| F-21 | Hardware-Controller anbinden | Could | v3.0 |
| F-22 | Langzeitstatistik: Turniersiege, Platzierungen, Match- und Spiel-Siegquote, Head-to-Head | Must | Basis v1.0, Head-to-Head v1.1 |
| F-23 | Schweizer System als Paarungsart neben Jeder gegen jeden | Must (v1.4) | geplant |
| F-24 | Offene Registrierung und Gruppe ohne Einladung anlegen | Must (v4.0) | geplant |
| F-25 | Android- und iOS-App in den Stores | Must (v4.0) | geplant |
| F-26 | Sealed-Turniere: Set, Booster-Anzahl einstellbar, ohne Draftplätze | Must (v1.3) | geplant |
| F-27 | Ausgaben eines Spieleabends eintragen und auf die Teilnehmer verteilen, Bezahlt abhaken | Must (v1.2) | geplant |
| F-28 | Mehrere Turniere gleichzeitig pro Gruppe | Must (v1.4) | geplant |
| N-01 | Life-Tracker läuft bei Verbindungsabbruch weiter und synchronisiert danach | Must | v1.0 |
| N-02 | Bedienung mit einer Hand, große Tasten, Bildschirm bleibt an | Must | v1.0 |
| N-03 | Läuft auf iOS und Android ohne App-Store (PWA), Daten auf dem Heimserver mit täglichem Backup | Must | v1.0 (iPhone noch nicht auf echtem Gerät getestet) |
| N-04 | Live-Ansicht aktualisiert sich bei allen in unter 2 Sekunden | Should | v1.0 |
| N-05 | Betrieb für fremde Nutzer: Lasttest, DSGVO, Konto in der App löschbar | Must (v4.0) | geplant |

**Punkteregeln (festgelegt am 15.11.2026)**

Ranglistenpunkte pro Turnier: Punkte = Spielerzahl − Platz + 1, dazu +2 für Platz 1 und +1 für Platz 2. Jeder Platz bekommt Punkte, der letzte immer 1.

| Platz | 4 Spieler | 5 Spieler | 6 Spieler | 7 Spieler | 8 Spieler |
| --- | --- | --- | --- | --- | --- |
| 1. | 6 | 7 | 8 | 9 | 10 |
| 2. | 4 | 5 | 6 | 7 | 8 |
| 3. | 2 | 3 | 4 | 5 | 6 |
| 4. | 1 | 2 | 3 | 4 | 5 |
| 5. | – | 1 | 2 | 3 | 4 |
| 6. | – | – | 1 | 2 | 3 |
| 7. | – | – | – | 1 | 2 |
| 8. | – | – | – | – | 1 |

Reihenfolge in der Turniertabelle bei Punktgleichheit: 1. Matchpunkte (3/1/0); 2. direkter Vergleich, bei drei oder mehr Gleichen eine Mini-Tabelle aus deren Matches untereinander; 3. Spieldifferenz; 4. mehr gewonnene Spiele; 5. W20-Wurf in der App.

**Use Cases**

| ID | Use Case | Akteur | Ablauf | Version |
| --- | --- | --- | --- | --- |
| UC-01 | Gruppe anlegen | Nutzer | Name und Regeln festlegen, wird automatisch Admin, lädt per Link ein | v1.1 |
| UC-02 | Gruppe beitreten | Nutzer | Einladungslink öffnen, anmelden oder registrieren, sofort Mitglied | v1.0 |
| UC-03 | Turnier starten | Mitglied | Draft und Set wählen, Gruppenvorgaben pro Turnier änderbar; nur ein laufendes Turnier pro Gruppe | v1.0 |
| UC-04 | Spieler einladen | Turnierstarter | Mitglieder aus der Liste (Zusage nötig), andere per Link oder QR-Code; Entfernen vor der Auslosung möglich | v1.0 |
| UC-05 | Gast tritt bei | Gast | QR-Code scannen, Namen eingeben, direkt Angebot für ein Profil (Angebot offen für v1.1) | v1.0 |
| UC-06 | Draftplätze auslosen | Turnierstarter | Animation für alle am Tisch, Tischgrafik, Anmeldung zu; neu auslosen möglich | v1.0 |
| UC-07 | Farben melden | Spieler | Farben (WUBRG) nach dem Deckbau wählen, sofort für alle sichtbar | v1.0 |
| UC-08 | Spielplan erzeugen | System | Beim Start von Runde 1 kompletter Plan jeder gegen jeden, für alle sichtbar | v1.0 |
| UC-09 | Match vorziehen | Spieler | App schlägt freien Spielern ein offenes Match vor, einer bestätigt | v1.0 |
| UC-10 | Match starten | Spieler | Jeder würfelt seinen W20 selbst mit Animation, danach öffnet der Life-Tracker | v1.0 |
| UC-11 | Zweites Handy koppeln | Gegner | Öffnet dasselbe Match, jeder zählt nur seine eigenen Lebenspunkte, beide sehen alles live | v1.0 |
| UC-12 | Matchergebnis übernehmen | Spieler | Nach dem letzten Spiel bestätigt einer das Ergebnis, die Tabelle aktualisiert sich | v1.0 |
| UC-13 | Ergebnis ohne Tracker eintragen | Spieler | Ergebnis direkt eingeben, wenn auf Papier gezählt wurde | v1.0 |
| UC-14 | Ergebnis korrigieren | Beteiligter Spieler | Änderung bis Turnierende, wird protokolliert, Gegner bekommt eine Nachricht | v1.0 |
| UC-15 | Nächste Runde starten | Teilnehmer | Auch bei offenen Matches, dann mit Warnung | v1.0 |
| UC-16 | Turnier pausieren und fortsetzen | Teilnehmer | Turnier an einem anderen Abend weiterspielen | v1.0 |
| UC-17 | Turnier abschließen | System | Siegerehrung mit Animation, Ranglistenpunkte; Awards und Teilen-Bild ab v1.1 | v1.0 |
| UC-18 | Gast in Profil umwandeln | Gast | Profil anlegen, bisherige Ergebnisse werden übernommen | v1.1 |
| UC-19 | Alt-Turnier nachtragen | Gruppen-Admin | Datum, Set, Teilnehmer, Platzierungen und Matches eingeben, Markierung „importiert“ | v1.1 |
| UC-20 | CSV-Import | Gruppen-Admin | Vorlage füllen, hochladen, Vorschau prüfen, übernehmen | v1.1 |
| UC-21 | Spieleabend planen | Mitglied | Termine vorschlagen, Ja/Vielleicht/Nein, Ersteller legt fest, Kalender-Export, Erinnerung | v1.2 |
| UC-22 | Constructed-Turnier starten | Mitglied | Turnierart Constructed und Format wählen, keine Draftplätze; jeder gegen jeden oder Schweizer System; Farben bei der Anmeldung | v1.4 |
| UC-23 | Schweizer Runde paaren | System | Paarung nach Punkten, keine Wiederholung, Bye als Matchsieg; Rundenzahl aus der Spielerzahl | v1.4 |
| UC-24 | Ohne Einladung registrieren | Neuer Nutzer | App aus dem Store oder über die Webseite, Konto anlegen, eigene Gruppe gründen oder per Link beitreten | v4.0 |
| UC-25 | Inhalt oder Gruppe melden | Nutzer | Anstößigen Gruppennamen, Profil oder Missbrauch melden; Betreiber prüft und sperrt | v4.0 |
| UC-26 | Sealed-Turnier starten | Mitglied | Turnierart Sealed und Set wählen, Booster-Anzahl festlegen, keine Auslosung; Farben nach dem Deckbau | v1.3 |
| UC-27 | Ausgaben teilen | Teilnehmer | Posten eintragen (Booster, Essen, Trinken); Booster gleich auf alle, übrige auf die ausgewählten; Bezahltes abhaken | v1.2 |

**Weitere Festlegungen**

- **Gruppen:** Jeder Nutzer kann Gruppen anlegen. Ein Profil gilt für alle Gruppen, die Statistik läuft je Gruppe. Rollen: Admin, Mitglied, Zuschauer. Jede Gruppe stellt Saisonlänge, Platzierungspunkte, Matchpunkte, Startleben und Matchformat selbst ein.
- **Saison:** Standard ist ein Kalenderjahr, einstellbar bis zu einer „ewigen“ Saison. Am Saisonende wird die Rangliste archiviert, Elo bleibt erhalten. Die Saison 2027 der „Draft-Runde“ beginnt schon am 01.12.2026 (27.11.2026), damit der Draftabend am 27.12.2026 zählt.
- **Profile & Anmeldung:** Anzeigename, Avatar, Lieblingsfarben. Anmeldung per Passkey und Magic-Link; Google-Konto oder Benutzername und Passwort nur, wenn jemand sie braucht; danach dauerhaft angemeldet. Beim Löschen werden Ergebnisse anonymisiert. Zugang bis v3.x nur auf Einladung.
- **Gäste & Ehemalige:** Gäste zählen nur im jeweiligen Turnier. Ehemalige Spieler aus den Altdaten zählen in der ewigen Tabelle. Zuschauer sehen den Live-Verlauf per öffentlichem Link ohne Anmeldung (v1.1).
- **Draft:** 3 Booster pro Spieler. Die Tischgrafik schaltet per Tippen Booster und Passrichtung weiter.
- **Life-Tracker:** Tippen ±1, langes Drücken ±5, kurze Anzeige der letzten Änderung, Vibration, Deckfarben frei kombinierbar aus WUBRG oder farblos (C). Bei 0 Leben schlägt die App den Sieg vor, dazu ein Aufgeben-Button. Spieldauer wird gemessen; die Lebenspunkte-Kurve kommt in v1.1.
- **Zeitlimit:** Nach Ablauf ein Hinweis und 5 Extra-Züge. Ein 1:1 bei Zeitablauf ist ein Unentschieden.
- **Turnier abbrechen (18.11.2026):** Vor Runde 1 dürfen Turnierstarter und Gruppen-Admin abbrechen. Ab Runde 1 bricht der Admin direkt ab, oder Starter bzw. Admin beantragen einen Abbruch, der gilt, sobald mehr als die Hälfte der Teilnehmer bestätigt hat; für Gäste und Spieler ohne Konto bestätigen Starter oder Admin stellvertretend. Abgebrochene Turniere zählen nicht.
- **Pause-Ansicht:** Live-Lebenspunkte der anderen Matches, aktuelle Tabelle, eigene Statistik gegen den nächsten Gegner.
- **Startseite (seit v1.0, 24.11.2026):** Karte zum laufenden Turnier, in dem man mitspielt, mit nächstem Schritt (Match starten, vorziehen, nächste Runde); Gold liegt dann auf der Karte, sonst auf „Freies Match“. Beendete Turniere bleiben 24 Stunden sichtbar.
- **Awards & Erfolge:** Längstes und kürzestes Spiel, Comeback, lustige Awards, Langzeit-Erfolge und „Bester der letzten 3 Drafts“ (v1.1).
- **Statistik:** Im Profil Siegquoten, Platzierungskurve, Lieblings- und Erfolgsfarben, Elo-Verlauf. Head-to-Head als Tabelle und als Direktvergleich. Für die Gruppe beste Farbkombination je Set, meiste Turniersiege, ewige Tabelle, Statistik pro Set. Filter nach Saison und Zeitraum; ab v1.3 nach Turnierart, ab v1.4 nach Format.
- **Elo:** Start 1000, pro Match (Unentschieden 0,5), pro Gruppe und global. K-Faktor 32, in den ersten 10 Matches 40. Matches gegen Gäste zählen nicht, Altdaten fließen nicht ein. Ab v1.3/v1.4 getrennt nach Turnierart plus Gesamt-Elo, ab v2.1 ein eigenes Commander-Elo.
- **Benachrichtigungen:** Push und in der App. Ereignisse: Du bist dran, neue Runde, Turnierende, Einladung, Ergebnis korrigiert, Abbruch beantragt (alle seit v1.0), neuer Erfolg, in der Rangliste überholt (später). Jedes Ereignis einzeln abschaltbar.
- **Altdaten:** Liegen in Excel, Google Sheets und auf Papier. Import per CSV oder manuell, nur durch den Gruppen-Admin.
- **Oberfläche:** Deutsch (Englisch und Portugiesisch in v2.0), Dark Mode, Tisch-Modus fürs Tablet (v1.1).
- **Betrieb:** Gruppen können ihre Daten exportieren (v2.0). Fällt der Heimserver aus, reicht es, wenn der Life-Tracker weiterläuft. Vorerst kostenlos.

**Umfang nach Versionen (22.11.2026)**

| Version | Ziel | Inhalt |
| --- | --- | --- |
| v1.0 (25.11.2026) | Die Gruppe spielt Draft | Kompletter Draft-Ablauf, Life-Tracker mit 1 oder 2 Handys, Live-Ansicht, Push, Siegerehrung, Rangliste, Basis-Statistik, Turnier-Karte auf der Startseite, Feedback-Knopf; Betrieb mit Backup, Monitoring, Deployment, Staging |
| v1.1 | Mehrere Gruppen, Geschichte | Gruppen mit Rollen und eigenen Regeln, archivieren, Zuschauer-Link, Gast in Profil umwandeln, Altdaten-Import, Elo, Head-to-Head, Awards, Teilen-Bild, Lebenspunkte-Kurve, Tisch-Modus; in zwei Releases v1.1.0 und v1.1.1 (27.11.2026) |
| v1.2 | Spieleabende planen | Terminumfrage, Set-Abstimmung, Kalender-Export (.ics), Erinnerung, Turnier aus dem Termin, Ausgaben teilen |
| v1.3 | Sealed | Turnierart Sealed, Deckbau-Timer, Filter nach Turnierart; Cube als Draft-Variante |
| v1.4 | Constructed | Format, Schweizer System mit Drop, Top-Cut, mehrere Turniere gleichzeitig, Deckname und Deckliste-Link |
| v2.0 | Sprachen, Statistik & KI | Englisch und Portugiesisch, Themes, Datenexport, erweiterte Statistik, KI-Zusammenfassung, KI-Prognose |
| v2.1 | Commander | 3–6 Spieler, 40 Leben, Commander-Schaden, Gift, Monarch, Initiative, Energie, Erfahrung, Pods, Commander-Elo, Scryfall |
| v3.0 | Steuergerät | ESP32-Controller mit Display, MQTT, Gehäuse, Ereignisquelle „Hardware“ |
| v3.1 | Design & Marke | Redesign auf Basis „Dunkel & Gold“, Logo, App-Icon, Design System, Animationen, Onboarding, Store-Material, Landingpage |
| v4.0 | Öffentlicher Start | Offene Registrierung, Melden und Sperren, Recht, Konto löschen, Lasttest, Mietserver, Android- und iOS-App |

**CSV-Vorlage für Altdaten**

Zwei Dateien: eine Zeile pro Spieler und Turnier, dazu optional eine Zeile pro Match; `turnier_id` verbindet beide. Ehemalige Spieler werden beim Import als „Ehemaliger Spieler“ angelegt. Datum als JJJJ-MM-TT, Set als offizielles Kürzel, Namen in beiden Dateien gleich.

```csv
turnier_id,datum,set,spieler,platz
2016-03-12-1,2016-03-12,SOI,Anna,1
2016-03-12-1,2016-03-12,SOI,Ben,2
2016-03-12-1,2016-03-12,SOI,Chris,3
```

```csv
turnier_id,runde,spieler_a,spieler_b,spiele_a,spiele_b
2016-03-12-1,1,Anna,Ben,2,1
2016-03-12-1,2,Anna,Chris,2,0
2016-03-12-1,3,Ben,Chris,1,1
```

## Abgeschlossene Phasen (Kurzfassung)

- **Phase 0 · Anforderungen (bis 15.11.2026):** Use Cases, Anforderungsliste, Punkteregeln; Go der Gruppe (G0).
- **Phase 1 · Architektur (15.–17.11.2026):** ADR-0001 bis ADR-0011, Datenmodell (`docs/schema.sql`, `docs/datenmodell.md`), Schnittstellen (`docs/schnittstellen.md`: REST unter `/api/v1`, WebSocket `/ws`, MQTT `topstack/v1/…`), Monorepo mit CI, Wireframes (https://claude.ai/artifact/H55gWgEyhdhtCXiXgdAB1u), Design „Dunkel & Gold“ (Grund #121218, Flächen #1e1e28, Gold #e8c26a, Schrift Inter). Domain `topstack.win`.
- **Phase 2 · MVP Life-Tracker (17.–18.11.2026):** Offline-PWA mit Life-Tracker, W20, Best-of-3, Zeitlimit, Auslosung mit Tischgrafik, Ereignisprotokoll, Wake Lock. Anleitung `TESTEN.md`.
- **Phase 3 · Backend & Turniere (18.–21.11.2026):** Plan `docs/phase3/README.md`, Testplan `docs/phase3/testplan.md`, Heimserver `docs/phase3/heimserver.md`; ADR-0012 bis ADR-0015. Anmeldung (Magic-Link, Passkey), Turniere mit Einladung, Gästen, Auslosung, Spielplan, Vorziehen, Ergebnissen, Korrektur, Abbruch und Abschluss, Life-Tracker am Server mit zwei Handys, Live-Ansicht, Web Push, Rangliste und Basis-Statistik. G3 entfiel am 27.11.2026.
- **Phase 4 · Beta & Betrieb (21.–27.11.2026):** Plan `docs/phase4/README.md`, ADR-0016 und ADR-0017. Nächtliche Backups mit Kopie in R2 und Wiederherstellungstest, Monitoring (Uptime Kuma, healthchecks.io, ntfy), automatisches Deployment mit Rollback und Deploy-Sperre, Staging `beta.topstack.win`, Semantic Versioning mit `CHANGELOG.md` und Release-Workflow, Feedback-Knopf (legt GitHub-Issues an), README fürs Portfolio, Admin-Skript. Eingeschoben: Turnier-Karte auf der Startseite, „Freies Match“, Offline-Hinweis. v1.0.0 und v1.0.1 am 25.11.2026. Offen ohne Gate: iPhone-Test, Push im echten Turnier, Draftabend am 27.12.2026 (siehe „Nach Phase 4“ im Phase-4-Plan).

## Phase 5 – Release v1.1: Gruppen & Altdaten

Dauer etwa 11 Wochen ab 28.11.2026 (vorgezogen am 27.11.2026). v1.1 öffnet TopStack für weitere Gruppen, aber nur auf Einladung, und holt die Altdaten herein. **Plan mit Arbeitspaketen, Testfällen und den Entscheidungen vom 27.11.2026: [`docs/phase5/README.md`](phase5/README.md)**, dazu ADR-0018 und ADR-0019. Zwei Releases: v1.1.0 (bis Head-to-Head und Zuschauer-Link, Gate G5) und v1.1.1 (Awards, Teilen-Bild, Kurve, Tisch-Modus).

- [ ] Mehrere Gruppen mit Rollen (Admin, Mitglied, Zuschauer) und eigenen Regeln (UC-01)
- [ ] Auswahl der Gruppe beim Turnier-Start und Knopf „Persönlicher Link“ bei Spielern ohne Konto (aus Phase 4 zurückgestellt; der Server kann persönliche Links schon, ADR-0015)
- [ ] Zuschauer-Link ohne Anmeldung
- [ ] Gast in Profil umwandeln (UC-18); dabei das direkte Angebot nach dem Beitritt als Gast (UC-05)
- [ ] Doppelte Spieler zusammenführen (Admin-Skript oder App; aus Phase 4 zurückgestellt)
- [ ] Altdaten-Import per CSV und manuell, Markierung „importiert“ (UC-19, UC-20)
- [ ] Elo-Wertung: Start 1000, pro Match, pro Gruppe und global
- [ ] Head-to-Head als Tabelle und als Direktvergleich zweier Spieler
- [ ] Awards, Langzeit-Erfolge, „Bester der letzten 3 Drafts“
- [ ] Teilen-Bild nach dem Turnier, Lebenspunkte-Kurve
- [ ] Tisch-Modus fürs Tablet
- ~~Google-Login sowie Benutzername und Passwort~~: gestrichen am 27.11.2026, niemand in der Gruppe braucht es (Issue bleibt im Backlog)
- [x] Vorab: Backlog-Skript (`scripts/backlog.tsv`) an den Versionsplan vom 22.11.2026 angepasst (27.11.2026); GitHub-Aufräumen in AP-0

**Festgelegt (Befragung vom 22.11.2026)**

- **Gruppen:** Jeder eingeladene Nutzer darf Gruppen anlegen, höchstens 5. Mehrere Admins möglich; verlässt der letzte Admin die Gruppe, wird das älteste Mitglied Admin. Alle Mitglieder dürfen einladen; Einladungslinks gelten 7 Tage und sind mehrfach nutzbar, persönliche Links einmalig. Gruppen lassen sich archivieren (nur lesbar) oder löschen (30 Tage wiederherstellbar). Gruppenbild ja, Akzentfarbe in v3.1.
- **Rollen:** Zuschauer sehen Live-Ansicht, Rangliste und Statistik, aber keine Profile. Die Rolle Zuschauer gilt dauerhaft, der öffentliche Zuschauer-Link nur für einen Abend.
- **Regeln:** Geänderte Gruppenregeln gelten ab der nächsten Saison. Der Turnierstarter darf für ein Turnier Matchformat, Zeitlimit, Startleben und Punkte abweichend einstellen.
- **Mehrere Gruppen:** Die App öffnet die zuletzt genutzte Gruppe mit Umschalter. Ein Spieler darf gleichzeitig in laufenden Turnieren verschiedener Gruppen sein.
- **Altdaten:** Pflicht sind Datum, Teilnehmer und Platz; Matches und Set optional, ein unbekanntes Set heißt „unbekannt“. Importierte Turniere zählen in die Saison ihres Datums und in die ewige Tabelle. Der Admin verknüpft Ehemalige mit Konten. Ein Import lässt sich pro Importlauf zurücknehmen. Die Papier-Daten trägt Peter bis Ende v1.1 ein. Wie viele Alt-Turniere es gibt, ist noch offen.
- **Gäste:** Hat ein Gast schon ein Konto, führt der Admin beide zusammen.
- **Head-to-Head:** ab dem ersten Match.
- **Teilen-Bild:** Podium, Set und Datum, Awards.
- **Tisch-Modus:** Tabelle, laufende Matches, Timer und Tischgrafik.
- **Awards:** automatisch aus den Daten und dazu eine Abstimmung „Spieler des Abends“. Comeback heißt: Sieg nach einem Tiefstand von 5 Leben oder weniger.

**Award-Vorschläge** (aus den Ereignisdaten berechenbar; die Gruppe wählt aus)

| Award | Wofür |
| --- | --- |
| Phönix | Sieg in einem Spiel nach einem Tiefstand von 5 Leben oder weniger (Comeback) |
| Zitterpartie | Spiel mit genau 1 Leben übrig gewonnen |
| Blitzsieg | Kürzestes gewonnenes Spiel des Abends |
| Marathon | Längstes Spiel des Abends |
| Dampfhammer | Größter einzelner Lebenspunkt-Verlust beim Gegner auf einen Schlag |
| Ungeschlagen | Turnier ohne verlorenes Match beendet |
| Glückspilz | Alle W20-Würfe des Abends gewonnen |
| Pechvogel | Alle W20-Würfe des Abends verloren |
| Regenbogen | Mit vier oder fünf Farben unter die ersten drei gekommen |
| Purist | Turnier mit einem einfarbigen Deck gewonnen |

**Gate G5:** Die Altdaten sind importiert, und eine zweite Gruppe kann TopStack nutzen.

## Phase 6 – Release v1.2: Terminumfrage & Ausgaben

Dauer etwa 5–6 Wochen, April bis Mitte Mai 2027. Die Tabellen `poll`, `poll_option` und `poll_vote` stehen schon im Schema; für die Ausgaben kommen neue Tabellen dazu.

**Terminumfrage (UC-21)**

- [ ] Jedes Mitglied kann eine Umfrage anlegen, mit höchstens 10 Terminvorschlägen
- [ ] Vorschlag mit Datum, Wochentag und Startzeit, Ende optional; Ort als Freitext
- [ ] Teilnehmer dürfen eigene Termine hinzufügen
- [ ] Abstimmen mit Ja, Vielleicht oder Nein; alle sehen, wer wie abgestimmt hat
- [ ] Gäste stimmen per Link mit ihrem Namen ab, Mitglieder angemeldet
- [ ] Frist optional, mit Erinnerung 24 h vor Ablauf
- [ ] Die App schlägt den besten Termin vor, der Ersteller bestätigt; Warnung bei weniger als 4 Zusagen
- [ ] Format und Set optional; über das Set kann als zweite Frage abgestimmt werden
- [ ] Kalender-Export als .ics pro Termin; bei Verschiebung oder Absage Push und neue .ics
- [ ] Zu- und Absagen auch nach dem Festlegen, mit Push an den Ersteller; keine Warteliste
- [ ] Erinnerung per Push am Vortag
- [ ] Aus dem festgelegten Termin direkt ein Turnier vorbereiten (Teilnehmer übernehmen)
- [ ] Später, nicht in v1.2: wiederkehrende Spieleabende

**Ausgaben teilen (F-27, UC-27)**

- [ ] Wer eingekauft hat, trägt Posten mit Betrag ein: Booster, Essen, Trinken, Sonstiges
- [ ] Booster werden gleich auf alle Teilnehmer des Abends verteilt; bei den übrigen Posten wählt man, wer mitzahlt
- [ ] Jeder sieht, wem er wie viel schuldet; Bezahltes wird abgehakt
- [ ] Offene Beträge pro Person in der Übersicht des Spieleabends

**Gate G6:** Ein echter Spieleabend wurde per Terminumfrage geplant, und seine Ausgaben wurden in der App verteilt.

## Phase 7 – Release v1.3: Sealed

Dauer etwa 3–4 Wochen, Mitte Mai bis Mitte Juni 2027. Sealed ist Limited wie Draft: Set als Pflichtfeld, Farben nach dem Deckbau, aber ohne Draftplätze und Passrichtung.

- [ ] Turnierart beim Start wählen: Draft oder Sealed (UC-26)
- [ ] Anzahl Booster pro Spieler einstellbar
- [ ] Ohne Draftplätze, Tischgrafik und Pick-Timer; Deckbau-Timer zuschaltbar
- [ ] Paarung jeder gegen jeden wie beim Draft
- [ ] Rangliste und Statistik nach Turnierart filterbar
- [ ] Datenmodell: `tournament` bekommt die Turnierart; Migration und ADR (gilt auch für v1.4)

**Festgelegt (Befragung vom 22.11.2026)**

- 6 Booster pro Spieler, einstellbar; keine Prerelease-Variante; Set ist Pflicht
- Deckbau-Timer standardmäßig 45 min; die App fragt die Deckgröße nicht ab
- Paarung jeder gegen jeden; das Schweizer System kommt erst mit v1.4
- Farben vor Runde 1: Warnung wie beim Draft
- Jedes Mitglied darf ein Sealed-Turnier starten
- Gemeinsame Limited-Rangliste für Draft und Sealed mit Filter, gleiche Ranglistenpunkte
- Farbstatistik getrennt nach Draft und Sealed, mit Gesamtsicht
- Cube kommt als Draft-Variante dazu (Cube-Name statt Set); keine weiteren Limited-Formate, keine Team-Varianten

**Gate G7:** Ein Sealed-Turnier wurde komplett gespielt.

## Phase 8 – Release v1.4: Constructed-Turniere

Dauer etwa 6–7 Wochen, Mitte Juni bis Juli 2027. Constructed nutzt denselben Life-Tracker mit zwei Spielern und 20 Leben.

- [ ] Turnierart Constructed (UC-22)
- [ ] Format statt Set: Standard, Pioneer, Modern, Legacy, Vintage, Pauper oder frei benennbar
- [ ] Ohne Draftplätze, Tischgrafik und Timer; Farben (WUBRG) werden bei der Anmeldung gemeldet
- [ ] Paarungsart wählbar: jeder gegen jeden oder Schweizer System (F-23, UC-23)
- [ ] Tiebreaker für das Schweizer System
- [ ] Top-Cut (Top 4 oder Top 8 im K.-o.-System) nach den Schweizer Runden
- [ ] Drop beim Schweizer System
- [ ] Mehrere Turniere gleichzeitig pro Gruppe (F-28)
- [ ] Das Schweizer System auch für Draft und Sealed anbieten
- [ ] Rangliste und Statistik nach Format filterbar; Farbstatistik je Format statt je Set
- [ ] Datenmodell: `tournament` bekommt Format und Paarungsart

**Festgelegt (Befragung vom 22.11.2026)**

- Formate der Gruppe: Standard, Pioneer, Modern, Pauper; feste Liste plus Freitext
- Optionaler Deckname und optionaler Link zur Deckliste (z. B. Moxfield)
- Farben bei der Anmeldung Pflicht; kein Deckwechsel zwischen den Runden
- Startleben 20, Zeitlimit standardmäßig 50 min, Sideboard-Timer optional (3 min)
- Schweizer System: Rundenzahl als Vorschlag aus der Spielerzahl, änderbar; erste Runde zufällig; Bye an den Spieler mit den wenigsten Punkten, der noch keinen hatte; offizielle Tiebreaker (Gegner-Matchquote, Spielquote, Gegner-Spielquote, Untergrenze 33 %); abgesprochenes Unentschieden als 1:1
- Drop nur beim Schweizer System; kein Einstieg nach Runde 1
- Top-Cut: Top 4 ab 8, Top 8 ab 16 Spielern; im Top-Cut wählt der besser Platzierte, wer beginnt; Ranglistenpunkte nach dem Endplatz
- Bei Draft und Sealed bleibt jeder gegen jeden der Standard, das Schweizer System ist wählbar
- Ranglisten getrennt für Limited und Constructed, dazu eine Gesamtwertung
- Meta-Übersicht pro Format: erfolgreiche Farben und Decks
- Gäste wie beim Draft
- Später, nicht in v1.4: Liga-Modus über mehrere Wochen

**Gate G8:** Ein Constructed-Turnier mit Schweizer System wurde komplett gespielt, und die Rangliste lässt sich nach Format filtern.

## Phase 9 – Release v2.0: Sprachen, Statistik & KI

Dauer etwa 10–12 Wochen, August bis Oktober 2027.

- [ ] Englisch und Portugiesisch, Sprache im Profil wählbar
- [ ] Wählbare Design-Themes aus den Wireframes: Pergament, Arcade, Minimal hell (ADR-0011)
- [ ] Datenexport der Gruppe als CSV oder Excel
- [ ] Siegquote pro Spieler, Farbkombination und Set bzw. Format, Spieldauer, Erzrivalen; Vergleich über Turnierarten
- [ ] KI-Zusammenfassung: kurzer Bericht nach jedem Turnier
- [ ] KI-Prognose: Siegwahrscheinlichkeit nach Farben und Spielern; erst logistische Regression, später auf der GTX 1060 des Ryzen-PCs

Grundlage sind die Ereignisdaten des Life-Trackers, später auch die des Steuergeräts. Altdaten haben keine Farben und fließen nur in die Spieler-Statistik ein.

**Festgelegt (Befragung vom 22.11.2026)**

- **Sprachen:** Gerätesprache als Start, im Profil änderbar; Portugiesisch aus Brasilien (pt-BR), Peter prüft; englische Magic-Begriffe bleiben; Set-Namen englisch mit Kürzel; auch Push-Texte und E-Mails übersetzt; Übersetzungen als Dateien im Repo (i18next)
- **Themes:** pro Nutzer
- **Export:** Turniere, Matches, Rangliste und Elo; jeder kann seine eigenen Daten exportieren (Auskunft nach DSGVO)
- **Statistik:** Die fünf wichtigsten neuen Statistiken wählt die Gruppe per Abstimmung. Anzeige ab 5 Spielen, darunter ausgegraut. Siegquote auch für Farbpaare je Set. Zwei Titel: Erzrivale (meiste Matches bei knapper Bilanz) und Angstgegner. Gruppenübergreifende Statistik nur für einen selbst sichtbar.
- **KI-Zusammenfassung:** Ton Sportreporter, pro Gruppe wählbar; Sprachmodell über eine API, ohne echte Namen; erscheint auf der Turnierseite, als Push und auf dem Teilen-Bild; wer nicht erwähnt werden will, stellt das im Profil ein
- **KI-Prognose:** vor dem Match, in der Pause-Ansicht, live und danach; pro Spieler abschaltbar; Merkmale Farben, Elo, Head-to-Head, Set und Startspieler; freigeschaltet ab 200 erfassten Spielen; Genauigkeit als Trefferquote der letzten 50 Matches; wöchentliches Training
- **Portfolio:** Notebook und Modellkarte im Repo, dazu ein Blogpost

**Gate G9:** Die App ist auf Englisch und Portugiesisch nutzbar, und nach einem Turnier erscheint die KI-Zusammenfassung.

## Phase 10 – Release v2.1: Commander

Dauer etwa 8–10 Wochen, November 2027 bis Januar 2028.

- [ ] Commander mit 3 bis 6 Spielern pro Match, Startleben 40
- [ ] Commander-Schaden je Gegner als neue Ereignisart
- [ ] Layout für mehrere Spieler um den Tisch, auch im Tisch-Modus
- [ ] Wertung für Mehrspieler-Matches (Sieger, Platzierung nach Ausscheiden)
- [ ] Kartenbilder und Set-Infos über die Scryfall-API, Commander als Karte auswählbar

**Festgelegt (Befragung vom 22.11.2026)**

- Bis 6 Spieler pro Match; Startleben 40, einstellbar (z. B. 30 für Brawl)
- Commander-Schaden pro gegnerischem Commander, Partner getrennt
- Gift für Commander; dazu Monarch, Initiative, Energie und Erfahrung
- Gezählt wird auf dem eigenen Handy oder auf einem Gerät in der Mitte; Layout mit Kacheln im Kreis
- Alle würfeln W20; Anzeige, wer am Zug ist, mit Zugzähler optional
- Wertung nach der Reihenfolge des Ausscheidens; Ausscheiden lässt sich per Undo zurücknehmen
- Zunächst freie Runden (Pods), Commander-Turniere später; Pods werden bei vielen Spielern ausgelost
- Eigenes Commander-Elo; Statistik zu meistgespielten Commandern und ihrer Siegquote
- Commander-Karte über Scryfall optional; Power-Level (Bracket) optional
- Zeitlimit optional, ohne Extra-Züge
- Scryfall: Set-Symbole auch bei Draft und Sealed; Set-Liste täglich auf dem Heimserver zwischengespeichert

**Gate G10:** Ein Commander-Spiel mit mindestens 4 Spielern läuft komplett in TopStack.

## Phase 11 – Release v3.0: Hardware / Steuergerät

Dauer 8–12 Wochen, Februar bis Mai 2028. Tisch-Controller mit Drehgebern pro Spieler und Display; schickt jede Änderung als Ereignis an den Heimserver. Verbindung über WLAN und MQTT statt Bluetooth, weil Safari auf dem iPhone kein Web Bluetooth kann; daher ESP32 (Alternative: Arduino Nano ESP32). Das Firmware-Grundgerüst mit Zähllogik und Puffer liegt in `firmware/`.

1. Hardware-Anforderungen: 2 Spieler, Drehgeber, zwei OLEDs, Akku mindestens 10 h
2. Schaltplan und Bauteile: ESP32, Drehgeber, OLED- oder E-Ink-Display, LiPo mit USB-C-Laden
3. Prototyp auf dem Steckbrett
4. Firmware: Zustandsautomat, Entprellung, MQTT-Protokoll (`topstack/v1/devices/{deviceId}/…`, JSON; Staging mit eigenem Bereich), Puffer bei Verbindungsabbruch, Watchdog, OTA, Unit-Tests ohne Hardware (PlatformIO + Unity)
5. Integration: Backend nimmt Hardware-Ereignisse an, App zeigt Quelle „Hardware“
6. Platine (KiCad) und Gehäuse aus dem 3D-Drucker

**Festgelegt (Befragung vom 22.11.2026)**

- Ein Gerät pro Match für 2 Spieler; Commander kommt später
- Bedienung über Drehgeber mit Druck, zwei OLED-Displays (eins pro Seite), Vibration
- Display zeigt Lebenspunkte, Spielstand im Best-of-3, Timer und Deckfarben; W20-Wurf am Gerät
- Akku mindestens 10 Stunden; funktioniert auch ohne Server und synchronisiert später
- Kopplung an ein Match über einen Code auf dem Display; WLAN-Einrichtung über einen eigenen Hotspot
- Gehäuse aus dem 3D-Drucker, spritzgeschützt; 4 Geräte, höchstens 40 € pro Stück
- Platine bestücken lassen; Hardware als Open Hardware unter CERN-OHL
- Firmware-Updates per OTA aus GitHub Releases; Anmeldung am MQTT-Broker mit Passwort pro Gerät und TLS
- Verkauf vielleicht später (dafür wäre die CE-Kennzeichnung nötig)
- Abnahme: kein einziges verlorenes Ereignis

**Gate G11:** Ein ganzer Spieleabend läuft mit dem Controller, alle Ereignisse kommen vollständig an.

## Phase 12 – Release v3.1: Design & Marke

Dauer etwa 8–10 Wochen (50–60 h), Juni bis August 2028. Vor dem öffentlichen Start bekommt TopStack einen einheitlichen, store-tauglichen Auftritt; gestaltet mit Claude Design.

- [ ] Stil „Dunkel & Gold“ (ADR-0011) weiterentwickeln, nicht ersetzen; neues ADR für das Redesign
- [ ] Logo, Wortmarke „TopStack“ und App-Icon (Stores, Homescreen, PWA)
- [ ] Design System mit Tokens und Komponenten, veröffentlicht (Portfolio)
- [ ] Schrift Inter bleibt, dazu eine Zierschrift für Überschriften
- [ ] Themes aus v2.0 ans neue Design anpassen; Gruppenbild und Akzentfarbe pro Gruppe
- [ ] Neu gestaltet: Life-Tracker (inkl. Commander), Turnierablauf, Rangliste und Statistik, Profil, Gruppen, Termine und Ausgaben; Handy hochkant und quer, Tablet, Desktop
- [ ] Animationen an Höhepunkten (Auslosung, Würfeln, Sieg, Siegerehrung); „Bewegung reduzieren“ schaltet sie ab
- [ ] Eigene Icons und Grafiken für leere Zustände; Soundeffekte optional, standardmäßig aus; Onboarding mit 3–4 Bildern
- [ ] Steuergerät in der gleichen Formensprache
- [ ] Barrierefreiheit: Kontrast WCAG AA, WUBRG immer mit Symbol
- [ ] Store-Screenshots (DE, EN, PT), Feature-Grafik, Vorschau-Video (15–30 s), Landingpage auf `topstack.win`

Vorgehen: Entwürfe und klickbarer Prototyp mit Claude Design → mit der Gruppe prüfen → Umsetzung mit Komponenten aus dem Design System → Test an einem Spieleabend → Rollout auf einmal mit v3.1.

**Gate G12:** Alle Bildschirme sind im neuen Design, ein Spieleabend läuft ohne Bedienprobleme, das Store-Material ist fertig, und das Design System ist veröffentlicht.

## Phase 13 – Release v4.0: Öffentlicher Start & App-Stores

Dauer etwa 10–12 Wochen, September bis November 2028. Ab hier können Gruppen und Nutzer mitmachen, die Peter nicht kennt.

- [ ] Offene Registrierung ohne Einladung, jeder kann eine Gruppe gründen (F-24, UC-24)
- [ ] Melden und Sperren von Gruppen und Profilen (UC-25); Admin-Skript um Sperren erweitern
- [ ] Rate-Limits für Anmeldung und Magic-Links, Limits beim E-Mail-Versand (Resend) prüfen
- [ ] Konto und alle Daten in der App selbst löschen (Pflicht bei Apple)
- [ ] Recht (vorher fachlich prüfen lassen): Impressum, Datenschutzerklärung und AGB auf DE, EN, PT; Verzeichnis der Verarbeitungen; Auftragsverarbeitung mit Cloudflare, Resend und Google; Hinweis auf die Fan Content Policy von Wizards of the Coast
- [ ] Lasttest mit k6 oder Locust
- [ ] Umzug auf einen Mietserver für höchstens 10 € im Monat, ADR „Betrieb ab v4.0“; der Heimserver bleibt für Staging, Entwicklung und KI
- [ ] Öffentliche Statusseite, Support-Adresse
- [ ] Native Hülle mit Capacitor; native Funktionen gegen Apples Guideline 4.2 (Push über APNs und FCM, Vibration, Bildschirm-an, Widget, Kopplung mit dem Steuergerät)
- [ ] Google Play: privates Entwicklerkonto, geschlossener Test mit mindestens 12 Testern über 14 Tage, danach Antrag auf Produktion
- [ ] Apple: Developer Program, Build über macOS-Runner in GitHub Actions, TestFlight, Review
- [ ] Store-Einträge in drei Sprachen; die PWA bleibt; Store-Builds in `release.yml`

**Festgelegt (Befragung vom 22.11.2026)**

- Zielgruppe zuerst DACH und Brasilien; kostenlos mit Spendenlink, ohne Werbung; privat oder Gewerbe vorher mit Beratung klären
- Mindestens Android 10 und iOS 16; Name „TopStack“ vor dem Store-Start prüfen, Marke später anmelden
- Keine Zusage zur Verfügbarkeit, öffentliche Statusseite; Support über Feedback-Knopf und E-Mail, Meldungen innerhalb einer Woche prüfen
- Grenzen pro Gruppe: 100 Spieler, 50 Turniere im Monat
- Registrierung mit E-Mail-Bestätigung, Bot-Schutz und Rate-Limit; Mindestalter 16 Jahre
- Inaktive Konten: nach 2 Jahren Erinnerung, dann Löschung mit anonymisierten Ergebnissen
- Nutzungsdaten nur eigene, ohne Cookies; Gruppen können sich öffentlich auffindbar machen; globale Rangliste nur fürs Elo und nur mit Zustimmung
- Onboarding mit kurzer Tour, Demo-Turnier und Video; bekannt machen über Reddit, Discord, Spieleläden und Mundpropaganda; eigene Rolle für Spieleläden später
- Endet der Betrieb, bekommen alle Gruppen vorher ihren Export
- Erfolg nach 6 Monaten: 10 aktive Gruppen

**Gate G13:** TopStack steht in App Store und Google Play, der Lasttest ist bestanden, und mindestens eine Gruppe ohne persönlichen Kontakt nutzt die App.

## Risiken & offene Fragen

| Risiko | Auswirkung | Gegenmaßnahme |
| --- | --- | --- |
| Zu wenig Zeit neben Job und Jobsuche | Projekt bleibt liegen | Kleine Phasen mit klaren Gates, MVP zuerst |
| Scope wächst | Releases rücken nach hinten | MoSCoW-Liste verbindlich, neue Ideen ins Backlog |
| Heimserver fällt aus | Rangliste nicht erreichbar | Life-Tracker läuft offline, externe Backups, Monitoring (ADR-0016) |
| iOS-Einschränkungen bei PWAs | Funktionen fehlen auf dem iPhone | iPhone-Test nachholen, Hardware über den Server, native App ab v4.0 |
| Freunde nutzen die App nicht | Keine Daten für Rangliste und KI | Früh einbinden, Erfassung unter 2 Minuten, Feedback-Knopf |
| Dependency-Update bricht den Build | Kein neues Image | Dependabot-PRs einzeln und nur bei grüner CI mergen |
| Staging verwechselt mit der echten App | Testdaten bei den Freunden | Eigene Subdomain mit Cloudflare Access, Beta-Band, keine Push-Nachrichten, Mail-Allowlist |
| Zu wenige Spiele für die KI-Prognose | Prognose ungenau | Als Beta starten; Zusammenfassung und Statistik brauchen weniger Daten |
| Apple lehnt die App als bloße Webseite ab (4.2) | iOS-Store-Start verzögert sich | Echte native Funktionen, TestFlight früh, PWA bleibt |
| Zu wenige Tester für Google Play | Kein Produktionszugang | Ab v3.0 Tester aus befreundeten Gruppen sammeln |
| Fremde Nutzer überfordern Server oder Betreiber | Ausfälle, Support, Haftung | Lasttest, Mietserver ab v4.0, Grenzen pro Gruppe, Recht prüfen lassen |

**Offene Fragen**

- [ ] Wie viele Alt-Turniere gibt es? (vor Phase 5 zählen)
- [ ] Welche Awards nimmt die Gruppe aus den Vorschlägen? (vor Phase 5)
- [ ] TopStack privat oder als Gewerbe betreiben (Beratung vor Phase 13)
