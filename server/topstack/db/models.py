"""SQLAlchemy-2-Modelle, eine Klasse pro Tabelle (ADR-0014).

Die Tabellen entsprechen ``docs/schema.sql``. Erzeugt wird das Schema ausschließlich über die
Alembic-Migrationen in ``server/migrations``; der Test ``test_models_match_migrations`` prüft
mit ``alembic check``, dass Modelle und Migrationen übereinstimmen.

Aufzählungen sind PostgreSQL-Enums, im Python-Code einfache Zeichenketten. Beziehungen
(``relationship``) kommen erst dazu, wenn ein Dienst sie braucht; Abfragen laufen über
``topstack.db.repo``.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    LargeBinary,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, ENUM, INTERVAL, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from topstack.db.base import Base

# ---------------------------------------------------------------------------
# Aufzählungen (Werte und Reihenfolge wie in docs/schema.sql)
# ---------------------------------------------------------------------------


def _enum(name: str, *values: str) -> ENUM:
    return ENUM(*values, name=name, create_type=False)


GROUP_ROLES = ("admin", "member", "viewer")
PLAYER_KINDS = ("member", "guest", "former", "reserved")
TOURNAMENT_FORMATS = ("draft", "commander")
TOURNAMENT_STATUSES = (
    "setup",
    "seated",
    "drafting",
    "running",
    "paused",
    "finished",
    "cancelled",
)
ENTRY_STATUSES = ("invited", "accepted", "declined", "removed")
ROUND_STATUSES = ("planned", "running", "finished")
MATCH_STATUSES = ("scheduled", "running", "finished")
TRACKER_MODES = ("shared", "dual", "none")
GAME_END_REASONS = ("life_zero", "concede", "time", "manual")
EVENT_TYPES = ("game_start", "die_roll", "life", "undo", "game_end")
EVENT_SOURCES = ("app", "hardware", "table")

group_role = _enum("group_role", *GROUP_ROLES)
player_kind = _enum("player_kind", *PLAYER_KINDS)
tournament_format = _enum("tournament_format", *TOURNAMENT_FORMATS)
tournament_status = _enum("tournament_status", *TOURNAMENT_STATUSES)
entry_status = _enum("entry_status", *ENTRY_STATUSES)
round_status = _enum("round_status", *ROUND_STATUSES)
match_status = _enum("match_status", *MATCH_STATUSES)
tracker_mode = _enum("tracker_mode", *TRACKER_MODES)
game_end_reason = _enum("game_end_reason", *GAME_END_REASONS)
event_type = _enum("event_type", *EVENT_TYPES)
event_source = _enum("event_source", *EVENT_SOURCES)

# ---------------------------------------------------------------------------
# Hilfen für wiederkehrende Spalten
# ---------------------------------------------------------------------------

TZ = DateTime(timezone=True)
NOW = text("now()")


def uuid_pk() -> Mapped[uuid.UUID]:
    """UUID-Primärschlüssel aus dem Code, ``gen_random_uuid()`` in der Datenbank als Rückfall."""
    return mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )


def created_at() -> Mapped[datetime]:
    return mapped_column(TZ, nullable=False, server_default=NOW)


def fk(target: str, ondelete: str | None = None) -> ForeignKey:
    return ForeignKey(target, ondelete=ondelete)


# ---------------------------------------------------------------------------
# Konten und Anmeldung
# ---------------------------------------------------------------------------


class AppUser(Base):
    __tablename__ = "app_user"
    __table_args__ = (
        CheckConstraint("favorite_colors ~ '^[WUBRG]*$'", name="app_user_favorite_colors_check"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    email: Mapped[str | None] = mapped_column(Text, unique=True)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(Text)
    favorite_colors: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    locale: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'de'"))
    created_at: Mapped[datetime] = created_at()
    deleted_at: Mapped[datetime | None] = mapped_column(TZ)


class PasskeyCredential(Base):
    __tablename__ = "passkey_credential"

    id: Mapped[bytes] = mapped_column(LargeBinary, primary_key=True)
    app_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, fk("app_user.id", "CASCADE"), nullable=False
    )
    public_key: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    sign_count: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default=text("0"))
    transports: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    created_at: Mapped[datetime] = created_at()
    last_used_at: Mapped[datetime | None] = mapped_column(TZ)


class MagicLink(Base):
    __tablename__ = "magic_link"

    token_hash: Mapped[bytes] = mapped_column(LargeBinary, primary_key=True)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(TZ, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(TZ)


class UserSession(Base):
    __tablename__ = "session"

    token_hash: Mapped[bytes] = mapped_column(LargeBinary, primary_key=True)
    app_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, fk("app_user.id", "CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = created_at()
    expires_at: Mapped[datetime] = mapped_column(TZ, nullable=False)
    user_agent: Mapped[str | None] = mapped_column(Text)


class WebauthnChallenge(Base):
    """Challenge für Passkey-Registrierung oder -Anmeldung, 5 Minuten gültig, einmal nutzbar."""

    __tablename__ = "webauthn_challenge"
    __table_args__ = (
        CheckConstraint(
            "purpose IN ('register', 'login')", name="webauthn_challenge_purpose_check"
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    purpose: Mapped[str] = mapped_column(Text, nullable=False)
    challenge: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    app_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, fk("app_user.id", "CASCADE"))
    expires_at: Mapped[datetime] = mapped_column(TZ, nullable=False)


# ---------------------------------------------------------------------------
# Gruppen, Regeln, Saisons
# ---------------------------------------------------------------------------


class PlayGroup(Base):
    """Spielgruppe (ADR-0010, ADR-0018): archiviert = nur lesbar, gelöscht = 30 Tage Papierkorb."""

    __tablename__ = "play_group"
    __table_args__ = (
        CheckConstraint("(image IS NULL) = (image_type IS NULL)", name="play_group_image_check"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, fk("app_user.id", "SET NULL"))
    created_at: Mapped[datetime] = created_at()
    archived_at: Mapped[datetime | None] = mapped_column(TZ)
    deleted_at: Mapped[datetime | None] = mapped_column(TZ)
    # Geänderte Regeln, die mit der nächsten Saison gelten (ADR-0018)
    pending_rules: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    image: Mapped[bytes | None] = mapped_column(LargeBinary, deferred=True)
    image_type: Mapped[str | None] = mapped_column(Text)


class GroupRules(Base):
    __tablename__ = "group_rules"
    __table_args__ = (
        CheckConstraint(
            "season_mode IN ('calendar_year', 'months', 'eternal')",
            name="group_rules_season_mode_check",
        ),
        CheckConstraint("season_months BETWEEN 1 AND 120", name="group_rules_season_months_check"),
    )

    group_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, fk("play_group.id", "CASCADE"), primary_key=True
    )
    season_mode: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'calendar_year'")
    )
    season_months: Mapped[int | None] = mapped_column(Integer)
    match_points_win: Mapped[int] = mapped_column(Integer, nullable=False, server_default="3")
    match_points_draw: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    match_points_loss: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    placement_bonus: Mapped[list[int]] = mapped_column(
        ARRAY(Integer), nullable=False, server_default=text("'{2,1}'")
    )
    starting_life: Mapped[int] = mapped_column(Integer, nullable=False, server_default="20")
    games_to_win: Mapped[int] = mapped_column(Integer, nullable=False, server_default="2")
    match_time_limit_min: Mapped[int | None] = mapped_column(Integer)
    extra_turns: Mapped[int] = mapped_column(Integer, nullable=False, server_default="5")
    boosters_per_player: Mapped[int] = mapped_column(Integer, nullable=False, server_default="3")


class Membership(Base):
    __tablename__ = "membership"

    group_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, fk("play_group.id", "CASCADE"), primary_key=True
    )
    app_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, fk("app_user.id", "CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(group_role, nullable=False, server_default="member")
    joined_at: Mapped[datetime] = created_at()


class Player(Base):
    """Spieler einer Gruppe: Mitglied (mit Konto), vorgemerkt (ADR-0015), Gast, Ehemaliger."""

    __tablename__ = "player"
    __table_args__ = (
        CheckConstraint("(kind = 'member') = (app_user_id IS NOT NULL)", name="player_check"),
        UniqueConstraint("group_id", "app_user_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    group_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, fk("play_group.id", "CASCADE"), nullable=False
    )
    app_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, fk("app_user.id", "SET NULL"))
    kind: Mapped[str] = mapped_column(player_kind, nullable=False)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = created_at()


class Season(Base):
    __tablename__ = "season"
    __table_args__ = (
        CheckConstraint("ends_on IS NULL OR ends_on >= starts_on", name="season_check"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    group_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, fk("play_group.id", "CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date | None] = mapped_column(Date)  # NULL = ewige Saison
    archived_at: Mapped[datetime | None] = mapped_column(TZ)


class Invitation(Base):
    __tablename__ = "invitation"

    token_hash: Mapped[bytes] = mapped_column(LargeBinary, primary_key=True)
    group_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, fk("play_group.id", "CASCADE"), nullable=False
    )
    # gesetzt = Einladung in ein Turnier (Gäste)
    tournament_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("tournament.id", ondelete="CASCADE", use_alter=True)
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, fk("app_user.id", "SET NULL"))
    expires_at: Mapped[datetime] = mapped_column(TZ, nullable=False)
    max_uses: Mapped[int | None] = mapped_column(Integer)
    uses: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    # gesetzt = übernimmt diesen vorgemerkten Spieler (ADR-0015)
    player_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, fk("player.id", "CASCADE"))


# ---------------------------------------------------------------------------
# Altdaten (Phase 5, AP-4)
# ---------------------------------------------------------------------------


class ImportRun(Base):
    """Ein Altdaten-Import; alle Turniere eines Laufs lassen sich zusammen zurücknehmen."""

    __tablename__ = "import_run"

    id: Mapped[uuid.UUID] = uuid_pk()
    group_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, fk("play_group.id", "CASCADE"), nullable=False
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, fk("app_user.id", "SET NULL"))
    created_at: Mapped[datetime] = created_at()
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    tournaments: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    # Ehemalige, die dieser Lauf angelegt hat; beim Zurücknehmen fallen ungenutzte weg
    created_players: Mapped[list[uuid.UUID]] = mapped_column(
        ARRAY(Uuid), nullable=False, server_default=text("'{}'")
    )
    undone_at: Mapped[datetime | None] = mapped_column(TZ)


# ---------------------------------------------------------------------------
# Turniere
# ---------------------------------------------------------------------------


class Tournament(Base):
    __tablename__ = "tournament"
    __table_args__ = (
        CheckConstraint(
            "(cancel_requested_by IS NULL) = (cancel_requested_at IS NULL)",
            name="tournament_check",
        ),
        # nur ein offenes Turnier pro Gruppe (UC-03); abgebrochene zählen nicht
        Index(
            "one_open_tournament_per_group",
            "group_id",
            unique=True,
            postgresql_where=text("status NOT IN ('finished', 'cancelled') AND NOT imported"),
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    group_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, fk("play_group.id", "CASCADE"), nullable=False
    )
    season_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, fk("season.id", "SET NULL"))
    format: Mapped[str] = mapped_column(tournament_format, nullable=False, server_default="draft")
    set_code: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(tournament_status, nullable=False, server_default="setup")
    started_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, fk("player.id", "SET NULL"))
    settings: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'")
    )
    imported: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    held_on: Mapped[date] = mapped_column(Date, nullable=False, server_default=text("CURRENT_DATE"))
    location: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at()
    finished_at: Mapped[datetime | None] = mapped_column(TZ)
    cancel_requested_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, fk("player.id", "SET NULL"))
    cancel_requested_at: Mapped[datetime | None] = mapped_column(TZ)
    # gesetzt = aus einem Altdaten-Import, mit dem Lauf rücknehmbar (ADR-0019)
    import_run_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, fk("import_run.id", "SET NULL"))


class TournamentEntry(Base):
    __tablename__ = "tournament_entry"
    __table_args__ = (
        CheckConstraint("colors ~ '^[WUBRG]*$'", name="tournament_entry_colors_check"),
        UniqueConstraint("tournament_id", "seat_no"),
    )

    tournament_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, fk("tournament.id", "CASCADE"), primary_key=True
    )
    player_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, fk("player.id", "RESTRICT"), primary_key=True
    )
    status: Mapped[str] = mapped_column(entry_status, nullable=False, server_default="invited")
    seat_no: Mapped[int | None] = mapped_column(Integer)  # Draftplatz ab 1
    colors: Mapped[str | None] = mapped_column(Text)
    final_place: Mapped[int | None] = mapped_column(Integer)
    ranking_points: Mapped[int | None] = mapped_column(Integer)


class TournamentCancelVote(Base):
    """Bestätigung eines Teilnehmers für einen Abbruch per Abstimmung (ADR-0013)."""

    __tablename__ = "tournament_cancel_vote"
    __table_args__ = (
        ForeignKeyConstraint(
            ["tournament_id", "player_id"],
            ["tournament_entry.tournament_id", "tournament_entry.player_id"],
            ondelete="CASCADE",
        ),
    )

    tournament_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    player_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    created_at: Mapped[datetime] = created_at()


class Round(Base):
    __tablename__ = "round"
    __table_args__ = (UniqueConstraint("tournament_id", "number"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    tournament_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, fk("tournament.id", "CASCADE"), nullable=False
    )
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(round_status, nullable=False, server_default="planned")
    bye_player_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, fk("player.id"))
    started_at: Mapped[datetime | None] = mapped_column(TZ)


class Match(Base):
    __tablename__ = "match"
    __table_args__ = (
        CheckConstraint("player_a_id <> player_b_id", name="match_check"),
        Index("match_tournament_idx", "tournament_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    tournament_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, fk("tournament.id", "CASCADE"), nullable=False
    )
    round_id: Mapped[uuid.UUID] = mapped_column(Uuid, fk("round.id", "CASCADE"), nullable=False)
    player_a_id: Mapped[uuid.UUID] = mapped_column(Uuid, fk("player.id"), nullable=False)
    player_b_id: Mapped[uuid.UUID] = mapped_column(Uuid, fk("player.id"), nullable=False)
    status: Mapped[str] = mapped_column(match_status, nullable=False, server_default="scheduled")
    tracker_mode: Mapped[str] = mapped_column(tracker_mode, nullable=False, server_default="shared")
    games_a: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    games_b: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    games_drawn: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    time_limit_min: Mapped[int | None] = mapped_column(Integer)
    started_at: Mapped[datetime | None] = mapped_column(TZ)
    finished_at: Mapped[datetime | None] = mapped_column(TZ)
    result_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, fk("player.id"))
    # optimistische Sperre (ADR-0013)
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")


class MatchCorrection(Base):
    """Protokoll für Ergebniskorrekturen (UC-14)."""

    __tablename__ = "match_correction"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    match_id: Mapped[uuid.UUID] = mapped_column(Uuid, fk("match.id", "CASCADE"), nullable=False)
    changed_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, fk("player.id"))
    old_result: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    new_result: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    changed_at: Mapped[datetime] = created_at()


class Game(Base):
    __tablename__ = "game"
    __table_args__ = (UniqueConstraint("match_id", "number"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)  # auf dem Gerät erzeugt
    match_id: Mapped[uuid.UUID] = mapped_column(Uuid, fk("match.id", "CASCADE"), nullable=False)
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    starting_player_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, fk("player.id"))
    # NULL zusammen mit end_reason = 'time' bedeutet Unentschieden
    winner_player_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, fk("player.id"))
    end_reason: Mapped[str | None] = mapped_column(game_end_reason)
    starting_life: Mapped[int] = mapped_column(Integer, nullable=False, server_default="20")
    started_at: Mapped[datetime | None] = mapped_column(TZ)
    ended_at: Mapped[datetime | None] = mapped_column(TZ)


class GameEvent(Base):
    """Ereignisprotokoll (ADR-0005): unveränderlich, idempotent über die Geräte-UUID."""

    __tablename__ = "game_event"
    __table_args__ = (
        UniqueConstraint("game_id", "device_id", "seq"),
        CheckConstraint("type <> 'life' OR delta IS NOT NULL", name="game_event_check"),
        CheckConstraint("type <> 'undo' OR undo_of IS NOT NULL", name="game_event_check1"),
        Index("game_event_game_idx", "game_id", "client_ts"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)  # UUIDv7 vom Gerät
    game_id: Mapped[uuid.UUID] = mapped_column(Uuid, fk("game.id", "CASCADE"), nullable=False)
    player_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, fk("player.id"))
    type: Mapped[str] = mapped_column(event_type, nullable=False)
    delta: Mapped[int | None] = mapped_column(Integer)  # bei type = 'life'
    value: Mapped[int | None] = mapped_column(Integer)  # bei type = 'die_roll' (W20)
    undo_of: Mapped[uuid.UUID | None] = mapped_column(Uuid, fk("game_event.id"))
    source: Mapped[str] = mapped_column(event_source, nullable=False, server_default="app")
    device_id: Mapped[str] = mapped_column(Text, nullable=False)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)  # fortlaufend pro Gerät und Spiel
    client_ts: Mapped[datetime] = mapped_column(TZ, nullable=False)
    server_ts: Mapped[datetime] = mapped_column(TZ, nullable=False, server_default=NOW)


# ---------------------------------------------------------------------------
# v1.1: Elo, Awards
# ---------------------------------------------------------------------------


class Award(Base):
    __tablename__ = "award"

    id: Mapped[uuid.UUID] = uuid_pk()
    group_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, fk("play_group.id", "CASCADE"), nullable=False
    )
    # NULL = Langzeit-Erfolg
    tournament_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, fk("tournament.id", "CASCADE"))
    player_id: Mapped[uuid.UUID] = mapped_column(Uuid, fk("player.id", "CASCADE"), nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    details: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'")
    )
    awarded_at: Mapped[datetime] = created_at()


# ---------------------------------------------------------------------------
# Benachrichtigungen
# ---------------------------------------------------------------------------


class PushSubscription(Base):
    __tablename__ = "push_subscription"

    id: Mapped[uuid.UUID] = uuid_pk()
    app_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, fk("app_user.id", "CASCADE"), nullable=False
    )
    endpoint: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)
    auth: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = created_at()


class NotificationPref(Base):
    __tablename__ = "notification_pref"

    app_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, fk("app_user.id", "CASCADE"), primary_key=True
    )
    event: Mapped[str] = mapped_column(Text, primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))


# ---------------------------------------------------------------------------
# v2.0: Terminumfrage (UC-21)
# ---------------------------------------------------------------------------


class Poll(Base):
    __tablename__ = "poll"

    id: Mapped[uuid.UUID] = uuid_pk()
    group_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, fk("play_group.id", "CASCADE"), nullable=False
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, fk("app_user.id", "SET NULL"))
    title: Mapped[str] = mapped_column(Text, nullable=False)
    chosen_option: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("poll_option.id", ondelete="SET NULL", use_alter=True)
    )
    remind_before: Mapped[timedelta | None] = mapped_column(INTERVAL)
    created_at: Mapped[datetime] = created_at()
    closed_at: Mapped[datetime | None] = mapped_column(TZ)


class PollOption(Base):
    __tablename__ = "poll_option"

    id: Mapped[uuid.UUID] = uuid_pk()
    poll_id: Mapped[uuid.UUID] = mapped_column(Uuid, fk("poll.id", "CASCADE"), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(TZ, nullable=False)


class PollVote(Base):
    __tablename__ = "poll_vote"
    __table_args__ = (
        CheckConstraint("answer IN ('yes', 'maybe', 'no')", name="poll_vote_answer_check"),
    )

    option_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, fk("poll_option.id", "CASCADE"), primary_key=True
    )
    app_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, fk("app_user.id", "CASCADE"), primary_key=True
    )
    answer: Mapped[str] = mapped_column(Text, nullable=False)


# ---------------------------------------------------------------------------
# Feedback aus der App (Phase 4, AP-5)
# ---------------------------------------------------------------------------


class Feedback(Base):
    __tablename__ = "feedback"
    __table_args__ = (
        CheckConstraint("category IN ('bug', 'wish', 'other')", name="feedback_category_check"),
        Index("feedback_app_user_id_created_at_idx", "app_user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    app_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, fk("app_user.id", "SET NULL"))
    category: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    context: Mapped[str | None] = mapped_column(Text)
    app_version: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    build: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    user_agent: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    screenshot: Mapped[bytes | None] = mapped_column(LargeBinary)
    screenshot_type: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at()
    sent_at: Mapped[datetime | None] = mapped_column(TZ)
    issue_number: Mapped[int | None] = mapped_column(Integer)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    last_error: Mapped[str | None] = mapped_column(Text)
