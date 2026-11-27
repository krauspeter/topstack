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
    InvitationOut,
)
from topstack.config import settings
from topstack.db.models import AppUser, Player
from topstack.domain.groups import Permission
from topstack.services import groups as group_svc
from topstack.services import invitations, tournaments

router = APIRouter(tags=["Gruppen"])


async def _access(
    db: Db, gid: uuid.UUID, user: AppUser, permission: Permission, *, write: bool = True
) -> group_svc.Access:
    try:
        return (await group_svc.access(db, gid, user)).require(permission, write=write)
    except group_svc.NotFound:
        raise problem(404, "Gruppe nicht gefunden.") from None
    except group_svc.Forbidden:
        raise problem(403, "Dafür fehlt dir die Berechtigung in dieser Gruppe.") from None
    except group_svc.Conflict as exc:
        raise problem(409, str(exc)) from None


@router.post("/groups/{gid}/invitations", status_code=status.HTTP_201_CREATED)
async def create_invitation(
    gid: uuid.UUID, body: InvitationCreate, user: CurrentUser, db: Db
) -> InvitationCreated:
    """Gruppenlink (alle Mitglieder) oder persönlicher Link für einen Spieler ohne Konto (Admin)."""
    needed = Permission.MANAGE if body.player_id is not None else Permission.INVITE
    await _access(db, gid, user, needed)
    if body.player_id is not None:
        try:
            await tournaments.reserved_player(db, gid, body.player_id)
        except tournaments.NotFound:
            raise problem(404, "Spieler nicht gefunden.") from None
        except tournaments.Conflict as exc:
            raise problem(409, str(exc)) from None
    token, invitation = await invitations.create(
        db,
        group_id=gid,
        created_by=user.id,
        days=body.days,
        max_uses=body.max_uses,
        player_id=body.player_id,
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
    player = await db.get(Player, invitation.player_id) if invitation.player_id else None
    return InvitationInfo(
        group_name=await invitations.group_name(db, invitation),
        expires_at=invitation.expires_at,
        player_name=player.display_name if player else None,
    )


@router.post("/invitations/{token}/accept")
async def accept_invitation(token: str, user: CurrentUser, db: Db) -> InvitationAccepted:
    invitation = await invitations.get_valid(db, token, lock=True)
    if invitation is None:
        raise problem(410, "Die Einladung ist abgelaufen oder ungültig.")
    try:
        player, joined = await invitations.accept(db, invitation, user)
    except invitations.ReservedTaken:
        raise problem(410, "Dieser Spieler gehört schon zu einem Konto.") from None
    await db.commit()
    return InvitationAccepted(group_id=player.group_id, player_id=player.id, joined=joined)


@router.get("/groups/{gid}/invitations")
async def list_invitations(gid: uuid.UUID, user: CurrentUser, db: Db) -> list[InvitationOut]:
    """Offene Links: Admins sehen alle, Mitglieder ihre eigenen (Phase 5, AP-2)."""
    a = await _access(db, gid, user, Permission.INVITE, write=False)
    mine_only = None if a.can(Permission.MANAGE) else user.id
    return [
        InvitationOut(
            id=invitations.link_id(inv),
            created_by=creator,
            mine=inv.created_by == user.id,
            expires_at=inv.expires_at,
            uses=inv.uses,
            max_uses=inv.max_uses,
            player_name=player,
        )
        for inv, creator, player in await invitations.open_links(db, gid, created_by=mine_only)
    ]


@router.delete("/groups/{gid}/invitations/{link}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_invitation(gid: uuid.UUID, link: str, user: CurrentUser, db: Db) -> None:
    """Link zurückziehen: der Ersteller oder ein Admin."""
    a = await _access(db, gid, user, Permission.INVITE, write=False)
    revoked = await invitations.revoke(
        db, gid, link, user_id=user.id, admin=a.can(Permission.MANAGE)
    )
    if not revoked:
        raise problem(404, "Link nicht gefunden.")
    await db.commit()
