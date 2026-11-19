"""Ein- und Ausgabeformate der API."""

import uuid
from datetime import datetime
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


class InvitationCreated(BaseModel):
    token: str
    url: str
    expires_at: datetime
    max_uses: int | None


class InvitationInfo(BaseModel):
    group_name: str
    expires_at: datetime


class InvitationAccepted(BaseModel):
    group_id: uuid.UUID
    player_id: uuid.UUID
    joined: bool
