# ADR-0008: Anmeldung mit Passkey und Magic-Link

- Status: angenommen
- Datum: 2026-11-15

## Kontext
Zugang nur auf Einladung, danach dauerhaft angemeldet. Freunde sollen sich kein Passwort merken müssen. Google-Login und Passwort kommen erst in v1.1.

## Entscheidung
- v1.0: Passkeys (WebAuthn, Bibliothek `webauthn` für Python) und Magic-Link per E-Mail als Rückfall.
- Sitzung als HttpOnly-, Secure-, SameSite=Lax-Cookie, serverseitig in der Tabelle `session` gespeichert, 1 Jahr gültig mit gleitender Verlängerung.
- Gäste bekommen kein Konto, nur einen turniergebundenen Gast-Token.

## Folgen
Passkeys sind an die Domain gebunden. Ein Domainwechsel macht alle Passkeys ungültig, deshalb Domain früh festlegen.
