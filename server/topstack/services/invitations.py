"""Einladungslinks in eine Gruppe (UC-02). Im Link steckt das Token, gespeichert wird der Hash."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from topstack.config import settings
from topstack.db.models import AppUser, Invitation, Membership, Player, PlayGroup
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
    player_id: uuid.UUID | None = None,
) -> tuple[str, Invitation]:
    """Gruppen-Einladung; mit ``player_id`` übernimmt sie einen vorgemerkten Spieler (ADR-0015)."""
    token = new_token()
    invitation = Invitation(
        token_hash=hash_token(token),
        group_id=group_id,
        created_by=created_by,
        expires_at=now() + timedelta(days=days or settings.invitation_days),
        max_uses=1 if player_id else max_uses,
        player_id=player_id,
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
    group = await db.get(PlayGroup, invitation.group_id)
    if group is None or group.deleted_at is not None or group.archived_at is not None:
        return None  # in archivierte und gelöschte Gruppen kommt niemand neu (ADR-0018)
    return invitation


async def group_name(db: AsyncSession, invitation: Invitation) -> str:
    group = await db.get(PlayGroup, invitation.group_id)
    return group.name if group else ""


class ReservedTaken(Exception):
    """Der vorgemerkte Spieler gehört schon einem Konto."""


async def accept(db: AsyncSession, invitation: Invitation, user: AppUser) -> tuple[Player, bool]:
    """Macht das Konto zum Mitglied. Schon Mitglied: nichts ändern, Einladung nicht verbrauchen.

    Ist die Einladung an einen vorgemerkten Spieler gebunden, übernimmt das Konto diesen
    Spieler samt allen Ergebnissen (ADR-0015).
    """
    existing = await db.scalar(
        select(Player).where(Player.group_id == invitation.group_id, Player.app_user_id == user.id)
    )
    if existing is not None:
        if await groups.get_membership(db, group_id=invitation.group_id, user_id=user.id):
            return existing, False
        # Wer die Gruppe verlassen hat, kommt mit seinem alten Spieler zurück (ADR-0018)
        db.add(Membership(group_id=invitation.group_id, app_user_id=user.id, role="member"))
        invitation.uses += 1
        await db.flush()
        return existing, True
    if invitation.player_id is not None:
        player = await db.get(Player, invitation.player_id, with_for_update=True)
        if player is None or player.kind != "reserved":
            raise ReservedTaken
        player.kind = "member"
        player.app_user_id = user.id
        db.add(Membership(group_id=invitation.group_id, app_user_id=user.id, role="member"))
    else:
        player = await groups.add_member(db, group_id=invitation.group_id, user=user)
    invitation.uses += 1
    await db.flush()
    return player, True
