"""Einladungslinks in eine Gruppe (UC-02). Im Link steckt das Token, gespeichert wird der Hash."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from topstack.config import settings
from topstack.db.models import AppUser, Invitation, Player, PlayGroup
from topstack.db.repo import groups
from topstack.services.tokens import hash_token, new_token


def now() -> datetime:
    return datetime.now(UTC)


async def create(
    db: AsyncSession,
    *,
    group_id: uuid.UUID,
    created_by: uuid.UUID,
    days: int | None = None,
    max_uses: int | None = None,
) -> tuple[str, Invitation]:
    token = new_token()
    invitation = Invitation(
        token_hash=hash_token(token),
        group_id=group_id,
        created_by=created_by,
        expires_at=now() + timedelta(days=days or settings.invitation_days),
        max_uses=max_uses,
    )
    db.add(invitation)
    await db.flush()
    return token, invitation


async def get_valid(db: AsyncSession, token: str, *, lock: bool = False) -> Invitation | None:
    """Gruppen-Einladung, die noch gilt; Turnier-Einladungen (Gäste) zählen hier nicht."""
    invitation = await db.get(Invitation, hash_token(token), with_for_update=lock)
    if (
        invitation is None
        or invitation.tournament_id is not None
        or invitation.expires_at <= now()
        or (invitation.max_uses is not None and invitation.uses >= invitation.max_uses)
    ):
        return None
    return invitation


async def group_name(db: AsyncSession, invitation: Invitation) -> str:
    group = await db.get(PlayGroup, invitation.group_id)
    return group.name if group else ""


async def accept(db: AsyncSession, invitation: Invitation, user: AppUser) -> tuple[Player, bool]:
    """Macht das Konto zum Mitglied. Schon Mitglied: nichts ändern, Einladung nicht verbrauchen."""
    existing = await db.scalar(
        select(Player).where(Player.group_id == invitation.group_id, Player.app_user_id == user.id)
    )
    if existing is not None:
        return existing, False
    player = await groups.add_member(db, group_id=invitation.group_id, user=user)
    invitation.uses += 1
    await db.flush()
    return player, True
