# Changelog

All notable changes to TopStack are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
App and server share one version. Until the release night the versions are `0.9.x`
(beta); the release night gets `1.0.0`.

Every pull request adds a line under **Unreleased**. `scripts/release.sh` turns that
section into a release; a short German "Was ist neu" for the app lives in
`app/src/whatsNew.ts`.

## [Unreleased]

### Fixed

- The app no longer hangs unnoticed on an old version (ADR-0021): it compares
  its update number with the server on start, on return and every 30 minutes,
  asks the service worker for updates and shows "Neue Version da" with a button,
  not during a match; "App zurücksetzen" in the profile clears the app cache
  and keeps game state and sign-in; the Cloudflare notice now leads straight to
  the sign-in (#200)
- Stats "Gegen Farben" count the opponent's whole colour combination (e.g. BR)
  instead of each colour separately, like your own colours (#198)
- Tournament rules form: more space between fields, left aligned, match points
  side by side; labels and values are no longer cut off (#198)

### Added

- Head-to-head (design B): the leaderboard gets a third view "Duelle" with your
  record against every opponent, a bar of wins, draws and losses and your
  nemesis marked; a duel shows the score like a scoreboard, both Elo ratings
  and all meetings, legacy ones marked; also reachable from a player's stats (#197)
- Elo in the app (design B, ADR-0020): the leaderboard switches between points
  and an Elo ladder with a mini trend per player; a player's stats compare their
  Elo with yours, show what a win or loss against them would change and list
  the last matches with their Elo change; display font Big Shoulders Display (#196)
- Elo rating (ADR-0019): computed from all matches since v1.0 without guests and
  legacy data, per group and globally per account; the leaderboard and player
  stats return it with its history; table elo_rating is dropped (#195)
- Several groups (ADR-0018): create up to five groups, rename them, set a group
  image, give members the roles admin, member or viewer, archive a group (read
  only) or delete it (30 days in the trash, then gone); the app remembers the
  active group on each device and has a switcher in tournaments and the
  leaderboard (#188)
- Group rules can be changed in the app; once a group has tournaments, changes
  wait for the next season, which the next tournament start now begins by
  itself (#188)
- Every member can create group invitation links; open links are listed in the
  group screen and can be revoked; admins get a "personal link" button next to
  players without an account (#190)
- Guests get a personal link right after joining a tournament to create a
  profile and keep their results (UC-05, UC-18) (#190)
- Admins merge duplicate players in the app (preview first) or with
  `admin.sh merge-player`; all results move to the remaining player (#190)
- Tournament starters can set match format (best-of-1, -3 or -5), starting life,
  time limit and match points for one tournament; the tournament screen shows
  what differs from the group, and the tracker, results, table and
  leaderboard use these rules (#191)
- Legacy data import for group admins (ADR-0019): CSV with preview and error
  list, a form for single paper tournaments, and undo per import run; imported
  tournaments are marked and count in the leaderboard (#192)

### Changed

- One access check for all group endpoints; viewers see the live view,
  leaderboard and stats but no player lists, and cannot start tournaments
  (#188)
- Invitations into archived or deleted groups are refused; members who left a
  group rejoin with their old player and results (#188)

## [1.0.1] - 2026-11-25

### Added

- Admin script: `seasons` and `season-start` move the start of a season and
  take in tournaments without a season, so the draft evening on 27.12. counts
  for season 2027; `finish-tournament` closes a hanging tournament by dropping
  its open matches; `deploy-lock on|off|status` for the draft evening (#162)

### Changed

- Award ceremony with a podium (2nd, 1st, 3rd) that rises step by step, a
  crown for the winner and confetti in the winner's deck colours; ranking
  points next to each name; no motion with "reduce motion" (#162)

### Fixed

- Staging stays on a pull request when GitHub cannot tell whether it is
  closed, and the deploy log now says so; the CI check for the switch back to
  main no longer depends on the GitHub API (#163)

## [1.0.0] - 2026-11-25

First stable release for the draft group. The same code as
1.0.0-rc.1; everything since 0.9.0:

### Known limitations

- Not yet tested on a real iPhone, only in iPhone emulation; the test follows
  in v1.0.1 (#156)

### Added

- Admin script for the home server (`infra/ops/admin.sh`): list players and
  tournaments, delete test tournaments and players without an account (refused
  while they are in a tournament), create personal invitation links; every
  `--apply` takes a backup first (#155)
- Start screen card for a running tournament you play in: set, round, your
  place, points and record, and the next step (start your match, live life
  totals, next round, bye with the next opponent, final place); it updates
  live. Gold marks that next step, otherwise "Freies Match" (#153)
- Pull your next match forward or start the next round right from the start
  screen card, with a short confirmation; during a bye the card lists the
  running matches with life totals (#154)
- Portfolio README in German and English with screenshots generated by
  Playwright, an architecture diagram, the list of ADRs and how testing,
  deployment and backups work (#152)
- Feedback button: friends report bugs and wishes from the app without a GitHub
  account; the server turns them into issues with an anonymous ID per account,
  keeps an optional screenshot on the home server and retries when GitHub is
  unreachable (#146)
- Staging at `beta.topstack.win`: a second stack on the home server with its own
  database that follows `main`; pull requests get images `pr-<number>` and can be
  shown there before the merge with `scripts/stage.sh`; the app shows a beta band
  and installs as "TopStack Beta"; no push, sign-in mails only to an allowlist (#145)

### Changed

- The tournament card keeps a gold frame while the tournament runs and
  "Freies Match" stays grey; finished tournaments stay on the start screen
  for 24 hours instead of until midnight. The API returns `finished_at` in
  the tournament list and view (#154)
- "Neues Match" on the start screen is now "Freies Match" to set it apart
  from tournament matches (#153)

### Fixed

- When the server cannot be reached, the start screen says so and offers
  "Erneut versuchen" instead of silently dropping the account buttons; it
  also retries when the network comes back. On staging an expired Cloudflare
  Access session is recognised and "Seite neu laden" signs in again (#157)
- Opening a sign-in link on staging with an expired Cloudflare Access session
  no longer reports "Keine Verbindung": the link stays valid and "Bei
  Cloudflare anmelden und weiter" signs in there and redeems it (#158)

- Deployment: a single timeout from ghcr.io no longer raises an alert; images
  are pulled up to three times, 30 seconds apart (#147)

## [1.0.0-rc.1] - 2026-11-25

### Known limitations

- Not yet tested on a real iPhone, only in iPhone emulation; the test follows
  in v1.0.1 (#156)

### Added

- Admin script for the home server (`infra/ops/admin.sh`): list players and
  tournaments, delete test tournaments and players without an account (refused
  while they are in a tournament), create personal invitation links; every
  `--apply` takes a backup first (#155)
- Start screen card for a running tournament you play in: set, round, your
  place, points and record, and the next step (start your match, live life
  totals, next round, bye with the next opponent, final place); it updates
  live. Gold marks that next step, otherwise "Freies Match" (#153)
- Pull your next match forward or start the next round right from the start
  screen card, with a short confirmation; during a bye the card lists the
  running matches with life totals (#154)
- Portfolio README in German and English with screenshots generated by
  Playwright, an architecture diagram, the list of ADRs and how testing,
  deployment and backups work (#152)
- Feedback button: friends report bugs and wishes from the app without a GitHub
  account; the server turns them into issues with an anonymous ID per account,
  keeps an optional screenshot on the home server and retries when GitHub is
  unreachable (#146)
- Staging at `beta.topstack.win`: a second stack on the home server with its own
  database that follows `main`; pull requests get images `pr-<number>` and can be
  shown there before the merge with `scripts/stage.sh`; the app shows a beta band
  and installs as "TopStack Beta"; no push, sign-in mails only to an allowlist (#145)

### Changed

- The tournament card keeps a gold frame while the tournament runs and
  "Freies Match" stays grey; finished tournaments stay on the start screen
  for 24 hours instead of until midnight. The API returns `finished_at` in
  the tournament list and view (#154)
- "Neues Match" on the start screen is now "Freies Match" to set it apart
  from tournament matches (#153)

### Fixed

- When the server cannot be reached, the start screen says so and offers
  "Erneut versuchen" instead of silently dropping the account buttons; it
  also retries when the network comes back. On staging an expired Cloudflare
  Access session is recognised and "Seite neu laden" signs in again (#157)
- Opening a sign-in link on staging with an expired Cloudflare Access session
  no longer reports "Keine Verbindung": the link stays valid and "Bei
  Cloudflare anmelden und weiter" signs in there and redeems it (#158)

- Deployment: a single timeout from ghcr.io no longer raises an alert; images
  are pulled up to three times, 30 seconds apart (#147)

## [0.9.0] - 2026-11-23

### Added

- Versions and changelog: one version for app and server, `scripts/release.sh`,
  automatic tag, images and GitHub release after merging a release PR; the start
  screen shows the version and a one-time "Was ist neu" after an update (#143)
- Automatic deployment: the home server pulls new images every 5 minutes, takes a
  backup first, rolls back on failure and does not retry a bad state; deploy lock
  for game nights; push notification via ntfy (#140)
- Monitoring: `/api/v1/health` returns 503 without the database; Uptime Kuma,
  healthchecks.io and ntfy alerts (#139)
- Backups: nightly `pg_dump` with retention 7/4/6, encrypted copy in Cloudflare R2
  (`age`), monthly restore test, restore on another machine documented (#136, #137)
- Profile shows who belongs to each group, including players without an account (#135)
- Rankings and basic statistics, including colour records (#122, #123)
- Web Push for "your turn", new round and tournament end (#119, #120)
- Live view and break view over WebSocket; the start screen shows the running update
  (#114, #115, #118)
- Life tracker on the server: outbox, sync and two phones per match (#111, #112,
  #116, #117)
- Draft tournaments: start, invite, guests, seat draw, colours, schedule, pulling
  matches forward, results with corrections, cancelling and the award ceremony
  (#61, #62, #64, #107, #108, #109, #110)
- Sign-in with magic link and passkey, group invitations (#58, #59, #60)
- Home server: app and API at `https://topstack.win` via Cloudflare Tunnel, database
  migrations on start (#53, #54, #55, #56, #57)
- Offline life tracker as PWA: best-of-3, d20 roll, time limit, multicolour and
  colourless decks, undo, seat draw with pass direction (#49, #50, #51)

[Unreleased]: https://github.com/krauspeter/topstack/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/krauspeter/topstack/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/krauspeter/topstack/compare/v0.9.0...v1.0.0
[1.0.0-rc.1]: https://github.com/krauspeter/topstack/compare/v0.9.0...v1.0.0-rc.1
[0.9.0]: https://github.com/krauspeter/topstack/releases/tag/v0.9.0
