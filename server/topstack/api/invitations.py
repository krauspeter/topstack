"""Einladungslinks in eine Gruppe (UC-02)."""

import uuid

from fastapi import APIRouter, status

from topstack.api.deps import CurrentUser, Db
from topstack.api.problems import problem
from topstack.api.schemas import (
    InvitationAccepted,
    InvitationCreate,
    InvitationCreated,
    InvitationInfo,
)
from topstack.config import settings
from topstack.db.repo import groups
from topstack.services import invitations

router = APIRouter(tags=["Gruppen"])


@router.post("/groups/{gid}/invitations", status_code=status.HTTP_201_CREATED)
async def create_invitation(
    gid: uuid.UUID, body: InvitationCreate, user: CurrentUser, db: Db
) -> InvitationCreated:
    membership = await groups.get_membership(db, group_id=gid, user_id=user.id)
    if membership is None:
        raise problem(404, "Gruppe nicht gefunden.")
    if membership.role != "admin":
        raise problem(403, "Nur Gruppen-Admins können einladen.")
    token, invitation = await invitations.create(
        db, group_id=gid, created_by=user.id, days=body.days, max_uses=body.max_uses
    )
    await db.commit()
    return InvitationCreated(
        token=token,
        url=f"{settings.public_origin}/einladung/{token}",
        expires_at=invitation.expires_at,
        max_uses=invitation.max_uses,
    )


@router.get("/invitations/{token}")
async def invitation_info(token: str, db: Db) -> InvitationInfo:
    """Öffentlich: zeigt auf der Einladungsseite, in welche Gruppe es geht."""
    invitation = await invitations.get_valid(db, token)
    if invitation is None:
        raise problem(410, "Die Einladung ist abgelaufen oder ungültig.")
    return InvitationInfo(
        group_name=await invitations.group_name(db, invitation),
        expires_at=invitation.expires_at,
    )


@router.post("/invitations/{token}/accept")
async def accept_invitation(token: str, user: CurrentUser, db: Db) -> InvitationAccepted:
    invitation = await invitations.get_valid(db, token, lock=True)
    if invitation is None:
        raise problem(410, "Die Einladung ist abgelaufen oder ungültig.")
    player, joined = await invitations.accept(db, invitation, user)
    await db.commit()
    return InvitationAccepted(group_id=player.group_id, player_id=player.id, joined=joined)
