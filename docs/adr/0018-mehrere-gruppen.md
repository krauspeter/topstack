# ADR-0018: Mehrere Gruppen in App und API

- Status: angenommen (27.11.2026)
- Datum: 2026-11-27

## Kontext
Seit v1.0 ist das Datenmodell mehrgruppenfähig (ADR-0010), die Oberfläche kennt aber nur eine Gruppe: Turnier-Start und Startseite nehmen `me.groups[0]`, Gruppen legt nur `seed_group` an, Rollen prüft der Server nur an wenigen Stellen (`admin` beim Einladen und Abbrechen, `viewer` beim Mitspielen). v1.1 öffnet TopStack für weitere Gruppen auf Einladung (Festlegungen vom 22.11.2026 in der Roadmap, Phase 5).

## Entscheidung
- **Aktive Gruppe in der App:** Die App merkt sich die zuletzt genutzte Gruppe pro Gerät (IndexedDB) und zeigt einen Umschalter, sobald man in mehr als einer Gruppe ist. Startseite, Turnier-Start, Rangliste und Statistik arbeiten mit der aktiven Gruppe. Kein `me.groups[0]` mehr.
- **Die URL trägt die Gruppe, nicht der Server:** Alle gruppenbezogenen Endpunkte bleiben unter `/api/v1/groups/{gid}/…`. Es gibt keinen Gruppenzustand in der Sitzung. Laufende Turniere verschiedener Gruppen sind dadurch gleichzeitig möglich.
- **Rechte an einer Stelle:** Eine Funktion `group_access(db, user, gid)` liefert Mitgliedschaft, Rolle und Spieler und wirft `403`/`404`. Die Regeln stehen als Tabelle in `server/topstack/domain/groups.py`:
  - **Admin:** Gruppe bearbeiten, Regeln ändern, Rollen vergeben, archivieren, löschen, Altdaten importieren, Spieler zusammenführen.
  - **Mitglied:** alles wie bisher, dazu Gruppenlinks erzeugen.
  - **Zuschauer:** Live-Ansicht, Rangliste, Statistik; keine Profile, kein Mitspielen, keine Links.
- **Archiviert und gelöscht:** `play_group.archived_at` macht die Gruppe nur lesbar (der Server lehnt Schreibzugriffe mit `409` ab). `play_group.deleted_at` blendet sie aus. Nach 30 Tagen löscht ein nächtlicher Lauf sie endgültig; bis dahin kann ein Admin sie wiederherstellen.
- **Letzter Admin:** Verlässt der letzte Admin die Gruppe, wird das Mitglied mit dem ältesten `joined_at` Admin. Die Prüfung läuft in derselben Transaktion.
- **Regeln ab der nächsten Saison:** Änderungen an `group_rules` landen als `pending_rules` (jsonb) an der Gruppe und werden beim Start der nächsten Saison übernommen. Abweichungen für ein einzelnes Turnier bleiben in `tournament.settings`.
- **Zuschauer-Link:** Ein Token wie bei der Einladung (`invitation` mit neuer Art `spectator`) gilt bis 6 Uhr am nächsten Morgen und öffnet nur die Live-Ansicht eines Turniers, ohne Anmeldung und ohne Spielernamen-Profile.

## Alternativen
- **Aktive Gruppe am Server (Sitzung):** einfachere Endpunkte, aber zwei Geräte oder Tabs mit verschiedenen Gruppen würden sich gegenseitig umschalten.
- **Rechte pro Endpunkt verstreut prüfen (wie bisher):** schwer zu überblicken, sobald drei Rollen und archivierte Gruppen dazukommen.
- **Sofort wirksame Regeländerungen:** würden laufende Saisons nachträglich verändern.

## Folgen
- Migration 0005: `play_group.archived_at`, `deleted_at`, `pending_rules`, `image`; `invitation.kind`.
- Bestehende Endpunkte bekommen die neue Rechteprüfung; dafür gibt es API-Tests je Rolle.
- Die Gruppe „Draft-Runde“ bleibt unverändert die erste Gruppe aller bisherigen Nutzer.
