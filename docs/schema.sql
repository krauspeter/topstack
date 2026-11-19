-- TopStack – Datenbankschema (PostgreSQL 16)
-- Stand Phase 3 (AP-1). Lesbare Referenz; maßgeblich ist die Alembic-Kette in server/migrations.
-- Die CI vergleicht diese Datei mit einer migrierten Datenbank (ADR-0014).
-- Konventionen: snake_case, UUID-Primärschlüssel, Zeitstempel in UTC (timestamptz).

-- ---------------------------------------------------------------------------
-- Aufzählungen
-- ---------------------------------------------------------------------------
CREATE TYPE group_role        AS ENUM ('admin', 'member', 'viewer');
CREATE TYPE player_kind       AS ENUM ('member', 'guest', 'former');
CREATE TYPE tournament_format AS ENUM ('draft', 'commander');
CREATE TYPE tournament_status AS ENUM ('setup', 'seated', 'drafting', 'running', 'paused', 'finished', 'cancelled');
CREATE TYPE entry_status      AS ENUM ('invited', 'accepted', 'declined', 'removed');
CREATE TYPE round_status      AS ENUM ('planned', 'running', 'finished');
CREATE TYPE match_status      AS ENUM ('scheduled', 'running', 'finished');
CREATE TYPE tracker_mode      AS ENUM ('shared', 'dual', 'none');
CREATE TYPE game_end_reason   AS ENUM ('life_zero', 'concede', 'time', 'manual');
CREATE TYPE event_type        AS ENUM ('game_start', 'die_roll', 'life', 'undo', 'game_end');
CREATE TYPE event_source      AS ENUM ('app', 'hardware', 'table');

-- ---------------------------------------------------------------------------
-- Konten und Anmeldung
-- ---------------------------------------------------------------------------
CREATE TABLE app_user (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email            text UNIQUE,
    display_name     text NOT NULL,
    avatar_url       text,
    favorite_colors  text NOT NULL DEFAULT '' CHECK (favorite_colors ~ '^[WUBRG]*$'),
    locale           text NOT NULL DEFAULT 'de',
    created_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz            -- Löschen = anonymisieren, Ergebnisse bleiben
);

CREATE TABLE passkey_credential (
    id             bytea PRIMARY KEY,       -- WebAuthn credential ID
    app_user_id    uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    public_key     bytea NOT NULL,
    sign_count     bigint NOT NULL DEFAULT 0,
    transports     text[],
    created_at     timestamptz NOT NULL DEFAULT now(),
    last_used_at   timestamptz
);

CREATE TABLE magic_link (
    token_hash     bytea PRIMARY KEY,       -- nur Hash speichern
    email          text NOT NULL,
    expires_at     timestamptz NOT NULL,
    used_at        timestamptz
);

CREATE TABLE session (
    token_hash     bytea PRIMARY KEY,
    app_user_id    uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    created_at     timestamptz NOT NULL DEFAULT now(),
    expires_at     timestamptz NOT NULL,
    user_agent     text
);

-- Challenges für Passkeys (WebAuthn), 5 Minuten gültig, einmal nutzbar (AP-3, Migration 0002)
CREATE TABLE webauthn_challenge (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    purpose      text NOT NULL CHECK (purpose IN ('register', 'login')),
    challenge    bytea NOT NULL,
    app_user_id  uuid REFERENCES app_user(id) ON DELETE CASCADE,   -- nur bei 'register'
    expires_at   timestamptz NOT NULL
);

-- ---------------------------------------------------------------------------
-- Gruppen, Regeln, Saisons
-- ---------------------------------------------------------------------------
CREATE TABLE play_group (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name         text NOT NULL,
    created_by   uuid REFERENCES app_user(id) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_rules (
    group_id              uuid PRIMARY KEY REFERENCES play_group(id) ON DELETE CASCADE,
    season_mode           text NOT NULL DEFAULT 'calendar_year'
                          CHECK (season_mode IN ('calendar_year', 'months', 'eternal')),
    season_months         int CHECK (season_months BETWEEN 1 AND 120),
    match_points_win      int NOT NULL DEFAULT 3,
    match_points_draw     int NOT NULL DEFAULT 1,
    match_points_loss     int NOT NULL DEFAULT 0,
    placement_bonus       int[] NOT NULL DEFAULT '{2,1}',   -- Bonus für Platz 1, 2, …
    starting_life         int NOT NULL DEFAULT 20,
    games_to_win          int NOT NULL DEFAULT 2,            -- Best-of-3
    match_time_limit_min  int,                               -- NULL = aus
    extra_turns           int NOT NULL DEFAULT 5,
    boosters_per_player   int NOT NULL DEFAULT 3
);

CREATE TABLE membership (
    group_id     uuid NOT NULL REFERENCES play_group(id) ON DELETE CASCADE,
    app_user_id  uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    role         group_role NOT NULL DEFAULT 'member',
    joined_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, app_user_id)
);

-- Spieleridentität innerhalb einer Gruppe: Mitglied (mit Konto), Gast oder Ehemaliger (Altdaten)
CREATE TABLE player (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id      uuid NOT NULL REFERENCES play_group(id) ON DELETE CASCADE,
    app_user_id   uuid REFERENCES app_user(id) ON DELETE SET NULL,
    kind          player_kind NOT NULL,
    display_name  text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CHECK ((kind = 'member') = (app_user_id IS NOT NULL)),
    UNIQUE (group_id, app_user_id)
);

CREATE TABLE season (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id     uuid NOT NULL REFERENCES play_group(id) ON DELETE CASCADE,
    name         text NOT NULL,
    starts_on    date NOT NULL,
    ends_on      date,                     -- NULL = ewige Saison
    archived_at  timestamptz,
    CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE TABLE invitation (
    token_hash     bytea PRIMARY KEY,
    group_id       uuid NOT NULL REFERENCES play_group(id) ON DELETE CASCADE,
    tournament_id  uuid,                    -- gesetzt = Einladung in ein Turnier (Gäste)
    created_by     uuid REFERENCES app_user(id) ON DELETE SET NULL,
    expires_at     timestamptz NOT NULL,
    max_uses       int,
    uses           int NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- Turniere
-- ---------------------------------------------------------------------------
CREATE TABLE tournament (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id      uuid NOT NULL REFERENCES play_group(id) ON DELETE CASCADE,
    season_id     uuid REFERENCES season(id) ON DELETE SET NULL,
    format        tournament_format NOT NULL DEFAULT 'draft',
    set_code      text NOT NULL,            -- offizielles Set-Kürzel, z. B. 'DSK'
    status        tournament_status NOT NULL DEFAULT 'setup',
    started_by    uuid REFERENCES player(id) ON DELETE SET NULL,
    settings      jsonb NOT NULL DEFAULT '{}',  -- Abweichungen von group_rules, Timer
    imported      boolean NOT NULL DEFAULT false,
    held_on       date NOT NULL DEFAULT current_date,
    location      text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    finished_at   timestamptz,
    cancel_requested_by  uuid REFERENCES player(id) ON DELETE SET NULL,  -- Abbruch per Abstimmung (ADR-0013)
    cancel_requested_at  timestamptz,
    CHECK ((cancel_requested_by IS NULL) = (cancel_requested_at IS NULL))
);
-- nur ein offenes Turnier pro Gruppe (UC-03); abgebrochene zählen nicht
CREATE UNIQUE INDEX one_open_tournament_per_group
    ON tournament (group_id) WHERE status NOT IN ('finished', 'cancelled') AND NOT imported;

ALTER TABLE invitation
    ADD FOREIGN KEY (tournament_id) REFERENCES tournament(id) ON DELETE CASCADE;

CREATE TABLE tournament_entry (
    tournament_id   uuid NOT NULL REFERENCES tournament(id) ON DELETE CASCADE,
    player_id       uuid NOT NULL REFERENCES player(id) ON DELETE RESTRICT,
    status          entry_status NOT NULL DEFAULT 'invited',
    seat_no         int,                   -- Draftplatz ab 1, gesetzt bei der Auslosung
    colors          text CHECK (colors ~ '^[WUBRG]*$'),
    final_place     int,
    ranking_points  int,
    PRIMARY KEY (tournament_id, player_id),
    UNIQUE (tournament_id, seat_no)
);

-- Bestätigungen für einen Abbruch per Abstimmung (ADR-0013)
CREATE TABLE tournament_cancel_vote (
    tournament_id  uuid NOT NULL,
    player_id      uuid NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tournament_id, player_id),
    FOREIGN KEY (tournament_id, player_id)
        REFERENCES tournament_entry (tournament_id, player_id) ON DELETE CASCADE
);

CREATE TABLE round (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id  uuid NOT NULL REFERENCES tournament(id) ON DELETE CASCADE,
    number         int NOT NULL,
    status         round_status NOT NULL DEFAULT 'planned',
    bye_player_id  uuid REFERENCES player(id),  -- Pause bei ungerader Spielerzahl
    started_at     timestamptz,
    UNIQUE (tournament_id, number)
);

CREATE TABLE match (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id   uuid NOT NULL REFERENCES tournament(id) ON DELETE CASCADE,
    round_id        uuid NOT NULL REFERENCES round(id) ON DELETE CASCADE,
    player_a_id     uuid NOT NULL REFERENCES player(id),
    player_b_id     uuid NOT NULL REFERENCES player(id),
    status          match_status NOT NULL DEFAULT 'scheduled',
    tracker_mode    tracker_mode NOT NULL DEFAULT 'shared',
    games_a         int NOT NULL DEFAULT 0,
    games_b         int NOT NULL DEFAULT 0,
    games_drawn     int NOT NULL DEFAULT 0,
    time_limit_min  int,
    started_at      timestamptz,
    finished_at     timestamptz,
    result_by       uuid REFERENCES player(id),
    version         int NOT NULL DEFAULT 0,   -- optimistische Sperre (ADR-0013)
    CHECK (player_a_id <> player_b_id)
);
CREATE INDEX match_tournament_idx ON match (tournament_id);

-- Protokoll für Ergebniskorrekturen (UC-14)
CREATE TABLE match_correction (
    id           bigserial PRIMARY KEY,
    match_id     uuid NOT NULL REFERENCES match(id) ON DELETE CASCADE,
    changed_by   uuid REFERENCES player(id),
    old_result   jsonb NOT NULL,
    new_result   jsonb NOT NULL,
    changed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE game (
    id                 uuid PRIMARY KEY,   -- auf dem Gerät erzeugt (offline)
    match_id           uuid NOT NULL REFERENCES match(id) ON DELETE CASCADE,
    number             int NOT NULL,
    starting_player_id uuid REFERENCES player(id),
    winner_player_id   uuid REFERENCES player(id),   -- NULL + end_reason='time' = Unentschieden
    end_reason         game_end_reason,
    starting_life      int NOT NULL DEFAULT 20,
    started_at         timestamptz,
    ended_at           timestamptz,
    UNIQUE (match_id, number)
);

-- Ereignisprotokoll (ADR-0005). Unveränderlich, idempotent über die Geräte-UUID.
CREATE TABLE game_event (
    id           uuid PRIMARY KEY,          -- UUIDv7 vom Gerät
    game_id      uuid NOT NULL REFERENCES game(id) ON DELETE CASCADE,
    player_id    uuid REFERENCES player(id),
    type         event_type NOT NULL,
    delta        int,                       -- bei type='life'
    value        int,                       -- bei type='die_roll' (W20)
    undo_of      uuid REFERENCES game_event(id),
    source       event_source NOT NULL DEFAULT 'app',
    device_id    text NOT NULL,
    seq          int NOT NULL,              -- fortlaufend pro Gerät und Spiel
    client_ts    timestamptz NOT NULL,
    server_ts    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (game_id, device_id, seq),
    CHECK (type <> 'life' OR delta IS NOT NULL),
    CHECK (type <> 'undo' OR undo_of IS NOT NULL)
);
CREATE INDEX game_event_game_idx ON game_event (game_id, client_ts);

-- ---------------------------------------------------------------------------
-- v1.1: Elo, Awards
-- ---------------------------------------------------------------------------
CREATE TABLE elo_rating (
    player_id   uuid NOT NULL REFERENCES player(id) ON DELETE CASCADE,
    scope       text NOT NULL CHECK (scope IN ('group', 'global')),
    rating      numeric(7,2) NOT NULL DEFAULT 1000,
    matches     int NOT NULL DEFAULT 0,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (player_id, scope)
);

CREATE TABLE award (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id       uuid NOT NULL REFERENCES play_group(id) ON DELETE CASCADE,
    tournament_id  uuid REFERENCES tournament(id) ON DELETE CASCADE,  -- NULL = Langzeit-Erfolg
    player_id      uuid NOT NULL REFERENCES player(id) ON DELETE CASCADE,
    kind           text NOT NULL,           -- z. B. 'longest_game', 'comeback', 'best_of_last_3'
    details        jsonb NOT NULL DEFAULT '{}',
    awarded_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Benachrichtigungen
-- ---------------------------------------------------------------------------
CREATE TABLE push_subscription (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    app_user_id  uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    endpoint     text NOT NULL UNIQUE,
    p256dh       text NOT NULL,
    auth         text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_pref (
    app_user_id  uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    event        text NOT NULL,             -- your_turn, new_round, tournament_end, invitation, …
    enabled      boolean NOT NULL DEFAULT true,
    PRIMARY KEY (app_user_id, event)
);

-- ---------------------------------------------------------------------------
-- v2.0: Terminumfrage (UC-21)
-- ---------------------------------------------------------------------------
CREATE TABLE poll (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id     uuid NOT NULL REFERENCES play_group(id) ON DELETE CASCADE,
    created_by   uuid REFERENCES app_user(id) ON DELETE SET NULL,
    title        text NOT NULL,
    chosen_option uuid,
    remind_before interval,
    created_at   timestamptz NOT NULL DEFAULT now(),
    closed_at    timestamptz
);

CREATE TABLE poll_option (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id    uuid NOT NULL REFERENCES poll(id) ON DELETE CASCADE,
    starts_at  timestamptz NOT NULL
);

ALTER TABLE poll
    ADD FOREIGN KEY (chosen_option) REFERENCES poll_option(id) ON DELETE SET NULL;

CREATE TABLE poll_vote (
    option_id    uuid NOT NULL REFERENCES poll_option(id) ON DELETE CASCADE,
    app_user_id  uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    answer       text NOT NULL CHECK (answer IN ('yes', 'maybe', 'no')),
    PRIMARY KEY (option_id, app_user_id)
);
