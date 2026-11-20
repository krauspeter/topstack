"""Ein- und Ausgabeformate der API."""

import uuid
from datetime import date, datetime
from typing import Annotated

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

SetCode = Annotated[str, Field(min_length=2, max_length=6, pattern=r"^[A-Za-z0-9]+$")]


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
    set_code: SetCode
    location: str | None = Field(default=None, max_length=80)

    @field_validator("set_code")
    @classmethod
    def upper(cls, value: str) -> str:
        return value.upper()


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


class TournamentSummary(BaseModel):
    id: uuid.UUID
    set_code: str
    status: str
    held_on: date
    players: int


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
