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
    created_by: uuid.UUID | None,
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
    """Der vorgemerkte Spieler oder Gast gehört schon einem Konto."""


CLAIMABLE = ("reserved", "guest")
"""Spieler ohne Konto, die ein persönlicher Link übernehmen kann (ADR-0015, UC-18)."""
GUEST_CLAIM_DAYS = 30


async def accept(db: AsyncSession, invitation: Invitation, user: AppUser) -> tuple[Player, bool]:
    """Macht das Konto zum Mitglied. Schon Mitglied: nichts ändern, Einladung nicht verbrauchen.

    Ist die Einladung an einen vorgemerkten Spieler oder einen Gast gebunden, übernimmt das
    Konto diesen Spieler samt allen Ergebnissen (ADR-0015, UC-18).
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
        if player is None or player.kind not in CLAIMABLE:
            raise ReservedTaken
        player.kind = "member"
        player.app_user_id = user.id
        db.add(Membership(group_id=invitation.group_id, app_user_id=user.id, role="member"))
    else:
        player = await groups.add_member(db, group_id=invitation.group_id, user=user)
    invitation.uses += 1
    await db.flush()
    return player, True


# ---------------------------------------------------------------------------
# Offene Links einer Gruppe (Phase 5, AP-2)
# ---------------------------------------------------------------------------


async def guest_claim(db: AsyncSession, guest: Player) -> str:
    """Persönlicher Link für einen Gast, der sich danach ein Profil anlegt (UC-05, UC-18)."""
    token, _ = await create(
        db, group_id=guest.group_id, created_by=None, days=GUEST_CLAIM_DAYS, player_id=guest.id
    )
    return token


def link_id(invitation: Invitation) -> str:
    """Öffentliche Kennung eines Links: der Hash, nicht das Token selbst."""
    return invitation.token_hash.hex()


async def open_links(
    db: AsyncSession, group_id: uuid.UUID, *, created_by: uuid.UUID | None = None
) -> list[tuple[Invitation, str | None, str | None]]:
    """Gültige Gruppenlinks (ohne Gast-Übernahmen), neueste zuerst; mit Ersteller und Spieler."""
    stmt = (
        select(Invitation, AppUser.display_name, Player.display_name)
        .outerjoin(AppUser, AppUser.id == Invitation.created_by)
        .outerjoin(Player, Player.id == Invitation.player_id)
        .where(
            Invitation.group_id == group_id,
            Invitation.tournament_id.is_(None),
            Invitation.created_by.is_not(None),
            Invitation.expires_at > now(),
            (Invitation.max_uses.is_(None)) | (Invitation.uses < Invitation.max_uses),
        )
        .order_by(Invitation.expires_at.desc())
    )
    if created_by is not None:
        stmt = stmt.where(Invitation.created_by == created_by)
    return [(inv, creator, player) for inv, creator, player in (await db.execute(stmt)).all()]


async def revoke(
    db: AsyncSession, group_id: uuid.UUID, link: str, *, user_id: uuid.UUID, admin: bool
) -> bool:
    """Link sofort ungültig machen; nur der Ersteller oder ein Admin. ``False``: nicht gefunden."""
    try:
        token_hash = bytes.fromhex(link)
    except ValueError:
        return False
    invitation = await db.get(Invitation, token_hash, with_for_update=True)
    if invitation is None or invitation.group_id != group_id or invitation.tournament_id:
        return False
    if not admin and invitation.created_by != user_id:
        return False
    invitation.expires_at = now()
    await db.flush()
    return True
