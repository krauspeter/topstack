"""Profilbilder speichern, ausliefern und für Listen nachschlagen (Phase 5, AP-15)."""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from topstack.db.models import AppUser, Player
from topstack.domain import avatars as rules


class InvalidAvatar(ValueError):
    pass


def image_url(user: AppUser) -> str | None:
    """Adresse des eigenen Bildes; ``v`` wechselt bei jedem neuen Bild (Zwischenspeicher)."""
    if user.avatar != rules.IMAGE or user.avatar_updated_at is None:
        return None
    return f"/api/v1/avatars/{user.id}?v={int(user.avatar_updated_at.timestamp())}"


def of_user(user: AppUser) -> str | None:
    return rules.ref(user.avatar, image_url(user))


def set_preset(user: AppUser, key: str) -> None:
    if not rules.is_preset(key):
        raise InvalidAvatar("Unbekanntes Profilbild.")
    user.avatar = key
    user.avatar_image = None
    user.avatar_image_type = None
    user.avatar_updated_at = datetime.now(UTC)


def set_image(user: AppUser, data: bytes, content_type: str) -> None:
    if content_type not in rules.IMAGE_TYPES:
        raise InvalidAvatar("Das Bild muss PNG, JPEG oder WebP sein.")
    if len(data) > rules.MAX_IMAGE_BYTES:
        raise InvalidAvatar("Das Bild ist zu groß.")
    user.avatar = rules.IMAGE
    user.avatar_image = data
    user.avatar_image_type = content_type
    user.avatar_updated_at = datetime.now(UTC)


def clear(user: AppUser) -> None:
    user.avatar = None
    user.avatar_image = None
    user.avatar_image_type = None
    user.avatar_updated_at = datetime.now(UTC)


async def image(db: AsyncSession, user_id: uuid.UUID) -> tuple[bytes, str] | None:
    user = await db.get(AppUser, user_id)
    if user is None or user.avatar != rules.IMAGE:
        return None
    await db.refresh(user, ["avatar_image"])
    if user.avatar_image is None or user.avatar_image_type is None:
        return None
    return user.avatar_image, user.avatar_image_type


def set_player_preset(player: Player, key: str | None) -> None:
    """Wesen für einen Spieler ohne Konto; ``None`` entfernt es."""
    if player.app_user_id is not None:
        raise InvalidAvatar("Spieler mit Konto wählen ihr Profilbild selbst.")
    if key is not None and not rules.is_preset(key):
        raise InvalidAvatar("Unbekanntes Profilbild.")
    player.avatar = key


async def for_players(db: AsyncSession, ids: Iterable[uuid.UUID]) -> dict[uuid.UUID, str | None]:
    """Profilbild je Spieler: das des Kontos, sonst das vom Admin gewählte Wesen."""
    wanted = list({i for i in ids if i is not None})
    if not wanted:
        return {}
    rows = await db.execute(
        select(Player.id, Player.avatar, AppUser)
        .outerjoin(AppUser, AppUser.id == Player.app_user_id)
        .where(Player.id.in_(wanted))
    )
    out: dict[uuid.UUID, str | None] = {}
    for pid, player_avatar, user in rows.all():
        out[pid] = of_user(user) if user is not None else rules.ref(player_avatar, None)
    return out
