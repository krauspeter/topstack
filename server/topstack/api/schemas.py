"""Ein- und Ausgabeformate der API."""

import re
import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

WUBRG = "WUBRG"


def normalize_colors(value: str) -> str:
    """Farben in WUBRG-Reihenfolge, ohne Doppelte: ``"RU"`` wird zu ``"UR"``."""
    letters = value.upper()
    if any(c not in WUBRG for c in letters):
        raise ValueError("nur W, U, B, R, G erlaubt")
    return "".join(c for c in WUBRG if c in letters)


DisplayName = Annotated[str, Field(min_length=1, max_length=40)]


class MagicLinkRequest(BaseModel):
    email: EmailStr
    invitation: str | None = Field(default=None, max_length=100)


class MagicLinkVerify(BaseModel):
    token: str = Field(min_length=10, max_length=100)
    invitation: str | None = Field(default=None, max_length=100)


class Accepted(BaseModel):
    status: str = "accepted"


class GroupMembership(BaseModel):
    id: uuid.UUID
    name: str
    role: str
    player_id: uuid.UUID | None


class Me(BaseModel):
    id: uuid.UUID
    email: str | None
    display_name: str
    favorite_colors: str
    locale: str
    has_passkey: bool
    groups: list[GroupMembership]


class MePatch(BaseModel):
    display_name: DisplayName | None = None
    favorite_colors: str | None = Field(default=None, max_length=10)

    @field_validator("display_name")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("darf nicht leer sein")
        return value

    @field_validator("favorite_colors")
    @classmethod
    def colors(cls, value: str | None) -> str | None:
        return None if value is None else normalize_colors(value)


class InvitationCreate(BaseModel):
    days: int = Field(default=7, ge=1, le=90)
    max_uses: int | None = Field(default=None, ge=1, le=100)
    # gesetzt = persönlicher Link, der diesen vorgemerkten Spieler übernimmt (ADR-0015)
    player_id: uuid.UUID | None = None


class InvitationCreated(BaseModel):
    token: str
    url: str
    expires_at: datetime
    max_uses: int | None


class InvitationInfo(BaseModel):
    group_name: str
    expires_at: datetime
    player_name: str | None = None  # bei persönlichem Link: der vorgemerkte Spieler


class InvitationAccepted(BaseModel):
    group_id: uuid.UUID
    player_id: uuid.UUID
    joined: bool


# ---------------------------------------------------------------------------
# Spieler und Turniere (AP-4)
# ---------------------------------------------------------------------------


class PlayerOut(BaseModel):
    id: uuid.UUID
    display_name: str
    kind: str
    is_me: bool


class ReservedCreate(BaseModel):
    display_name: DisplayName

    @field_validator("display_name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("darf nicht leer sein")
        return value


class TournamentCreate(BaseModel):
    # Name des Drafts oder Set-Kürzel, 2 bis 20 Zeichen (geändert am 20.11.2026)
    set_code: str = Field(max_length=40)
    location: str | None = Field(default=None, max_length=80)

    @field_validator("set_code")
    @classmethod
    def draft_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not 2 <= len(value) <= 20:
            raise ValueError("2 bis 20 Zeichen")
        if not re.fullmatch(r"[\w .,'&:+\-]+", value):
            raise ValueError("nur Buchstaben, Ziffern, Leerzeichen und . , ' & : + -")
        return value


class EntryOut(BaseModel):
    player_id: uuid.UUID
    display_name: str
    kind: str
    status: str
    seat_no: int | None
    colors: str | None
    is_me: bool


class Seating(BaseModel):
    seed: int
    draw: int  # zählt Neuauslosungen, damit die App die Animation neu startet


class MatchOut(BaseModel):
    id: uuid.UUID
    player_a_id: uuid.UUID
    player_b_id: uuid.UUID
    player_a: str
    player_b: str
    status: str  # scheduled, running (vorgezogen oder mit Tracker), finished
    games_a: int
    games_b: int
    games_drawn: int
    version: int
    mine: bool
    can_report: bool
    tracker_mode: str = "none"
    # Live: laufendes Spiel mit Lebenspunkten (AP-7)
    game_no: int | None = None
    life_a: int | None = None
    life_b: int | None = None


class RoundOut(BaseModel):
    number: int
    status: str  # planned, running, finished
    bye: str | None
    matches: list[MatchOut]


class StandingOut(BaseModel):
    player_id: uuid.UUID
    display_name: str
    rank: int
    played: int
    wins: int
    draws: int
    losses: int
    match_points: int
    games_won: int
    games_lost: int
    game_diff: int
    needs_roll: bool
    roll: int | None
    final_place: int | None
    ranking_points: int | None


class CancelVoteOut(BaseModel):
    requested_by: str
    confirmed: int
    required: int
    participants: int
    i_voted: bool
    voters: list[uuid.UUID]  # wer schon bestätigt hat (Spieler-IDs)


class NextOpponentOut(BaseModel):
    """Pause-Ansicht: nächster Gegner und eigene Bilanz gegen ihn in der Gruppe."""

    player_id: uuid.UUID
    display_name: str
    round: int
    wins: int
    draws: int
    losses: int


class TournamentOut(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    group_name: str
    set_code: str
    status: str
    held_on: date
    location: str | None
    started_by: uuid.UUID | None
    seating: Seating | None
    entries: list[EntryOut]
    my_player_id: uuid.UUID | None
    actions: list[str]  # was der angemeldete Nutzer gerade darf
    rounds: list[RoundOut] = []
    current_round: int | None = None
    open_in_current: int = 0  # offene Matches der laufenden Runde (Warnung bei „nächste Runde“)
    rounds_left: int = 0
    standings: list[StandingOut] = []
    suggestion: uuid.UUID | None = None  # Match, das freie Spieler vorziehen können
    cancel_vote: CancelVoteOut | None = None
    next_opponent: NextOpponentOut | None = None  # nur wenn ich gerade frei bin
    finished_at: datetime | None = None  # Abschluss; Startseite zeigt das Turnier 24 h danach


class TournamentSummary(BaseModel):
    id: uuid.UUID
    set_code: str
    status: str
    held_on: date
    players: int
    finished_at: datetime | None = None


class InviteBody(BaseModel):
    player_ids: list[uuid.UUID] = Field(min_length=1, max_length=40)


class RespondBody(BaseModel):
    accept: bool


class ColorsBody(BaseModel):
    colors: str = Field(max_length=10)

    @field_validator("colors")
    @classmethod
    def colors_valid(cls, value: str) -> str:
        return normalize_colors(value)


class GuestLink(BaseModel):
    token: str
    url: str
    expires_at: datetime


class GuestInfo(BaseModel):
    group_name: str
    set_code: str
    open: bool


class GuestJoin(BaseModel):
    display_name: DisplayName

    @field_validator("display_name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("darf nicht leer sein")
        return value


class GuestJoined(BaseModel):
    tournament_id: uuid.UUID
    player_id: uuid.UUID
    display_name: str


class ConfirmBody(BaseModel):
    """Warnungen bestätigen: fehlende Farben (Runde 1) oder offene Matches (nächste Runde)."""

    confirm: bool = False


class ResultBody(BaseModel):
    games_a: int = Field(ge=0, le=2)
    games_b: int = Field(ge=0, le=2)
    games_drawn: int = Field(default=0, ge=0, le=3)
    version: int | None = None  # bei Korrektur Pflicht: zuletzt gesehene Version


# ---------------------------------------------------------------------------
# Life-Tracker am Server (AP-6, ADR-0012)
# ---------------------------------------------------------------------------


class TrackerStart(BaseModel):
    mode: Literal["shared", "dual"]


class TrackerPlayer(BaseModel):
    id: uuid.UUID
    display_name: str
    colors: str | None
    kind: str


class TrackerMatch(BaseModel):
    """Stand des Matches aus Sicht des Servers; die App zeigt ihn, rechnet aber selbst."""

    id: uuid.UUID
    status: str
    tracker_mode: str
    games_a: int
    games_b: int
    games_drawn: int
    version: int


class EventBody(BaseModel):
    id: uuid.UUID
    game_id: uuid.UUID
    type: Literal["game_start", "die_roll", "life", "undo", "game_end"]
    player_id: uuid.UUID | None = None
    delta: int | None = None
    value: int | None = None
    undo_of: uuid.UUID | None = None
    reason: Literal["life_zero", "concede", "time", "manual"] | None = None
    device_id: str = Field(min_length=1, max_length=80)
    seq: int = Field(ge=1)
    client_ts: datetime
    source: Literal["app", "hardware", "table"] = "app"


class EventBatch(BaseModel):
    events: list[EventBody] = Field(max_length=500)


class RejectedEvent(BaseModel):
    id: uuid.UUID
    detail: str


class EventBatchResult(BaseModel):
    accepted: list[uuid.UUID]
    duplicates: list[uuid.UUID]
    rejected: list[RejectedEvent]
    match: TrackerMatch


class SeatOut(BaseModel):
    player_id: uuid.UUID
    device_id: str
    roll: int | None


class SeatBody(BaseModel):
    device_id: str = Field(min_length=1, max_length=80)
    force: bool = False  # Platz von einem anderen Handy übernehmen


class RollBody(BaseModel):
    device_id: str = Field(min_length=1, max_length=80)
    value: int = Field(ge=1, le=20)


class TrackerOut(BaseModel):
    tournament_id: uuid.UUID
    match: TrackerMatch
    player_a: TrackerPlayer
    player_b: TrackerPlayer
    my_player_id: uuid.UUID | None
    starting_life: int
    time_limit_min: int | None
    events: list[EventBody]
    # Warteraum im Modus „dual“ bis Spiel 1 beginnt
    seats: list[SeatOut] = []
    tie: int | None = None  # letzter Gleichstand beim W20, beide würfeln neu
