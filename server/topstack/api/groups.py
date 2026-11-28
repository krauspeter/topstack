"""Gruppen anlegen und verwalten (Phase 5, AP-1, UC-01, ADR-0018)."""

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, Response, status

from topstack.api.deps import CurrentUser, Db
from topstack.api.problems import problem
from topstack.api.schemas import (
    DeletedGroupOut,
    GroupCreate,
    GroupImage,
    GroupOut,
    GroupPatch,
    GroupRulesChanged,
    GroupRulesOut,
    LeftGroup,
    MemberOut,
    MergeOut,
    MergeRequest,
    PlayerAvatarBody,
    RoleChange,
)
from topstack.db.models import AppUser, Player
from topstack.db.repo import groups as repo
from topstack.domain.groups import PURGE_AFTER, InvalidRules, Permission
from topstack.services import avatars, feedback, players
from topstack.services import groups as svc

router = APIRouter(tags=["Gruppen"])


@asynccontextmanager
async def errors() -> AsyncIterator[None]:
    try:
        yield
    except svc.NotFound:
        raise problem(404, "Gruppe nicht gefunden.") from None
    except svc.Forbidden:
        raise problem(403, "Das dürfen nur Admins der Gruppe.") from None
    except svc.Conflict as exc:
        raise problem(409, str(exc)) from None
    except InvalidRules as exc:
        raise problem(422, str(exc)) from None


async def group_out(db: Db, a: svc.Access) -> GroupOut:
    rules = await repo.get_rules(db, a.group.id)
    return GroupOut(
        id=a.group.id,
        name=a.group.name,
        role=a.role,
        player_id=a.player.id if a.player else None,
        archived=a.archived,
        has_image=a.group.image_type is not None,
        created_at=a.group.created_at,
        rules=GroupRulesOut(**svc.rules_dict(rules)),
        pending_rules=a.group.pending_rules if a.can(Permission.MANAGE) else None,
        can_manage=a.can(Permission.MANAGE),
        can_invite=a.can(Permission.INVITE),
        can_play=a.can(Permission.PLAY),
        can_view_profiles=a.can(Permission.VIEW_PROFILES),
    )


async def _access(db: Db, gid: uuid.UUID, user: AppUser) -> svc.Access:
    async with errors():
        return await svc.access(db, gid, user)


@router.post("/groups", status_code=status.HTTP_201_CREATED)
async def create_group(body: GroupCreate, user: CurrentUser, db: Db) -> GroupOut:
    """UC-01: jeder Nutzer darf Gruppen anlegen, höchstens 5."""
    async with errors():
        a = await svc.create(db, user, body.name)
    await db.commit()
    return await group_out(db, a)


@router.get("/groups/{gid}")
async def get_group(gid: uuid.UUID, user: CurrentUser, db: Db) -> GroupOut:
    return await group_out(db, await _access(db, gid, user))


@router.patch("/groups/{gid}")
async def patch_group(gid: uuid.UUID, body: GroupPatch, user: CurrentUser, db: Db) -> GroupOut:
    a = await _access(db, gid, user)
    async with errors():
        if body.name is not None:
            await svc.rename(a, body.name)
    await db.commit()
    return await group_out(db, a)


# ---------------------------------------------------------------------------
# Gruppenbild
# ---------------------------------------------------------------------------


@router.put("/groups/{gid}/image")
async def put_image(gid: uuid.UUID, body: GroupImage, user: CurrentUser, db: Db) -> GroupOut:
    """Bild als Data-URL; die App verkleinert es vorher auf 512 px."""
    a = await _access(db, gid, user)
    try:
        raw, kind = feedback.decode_screenshot(body.image)
    except feedback.BadScreenshot:
        raise problem(422, "Das Bild muss ein PNG-, JPEG- oder WebP-Bild sein.") from None
    async with errors():
        await svc.set_image(a, raw, kind)
    await db.commit()
    return await group_out(db, a)


@router.delete("/groups/{gid}/image")
async def delete_image(gid: uuid.UUID, user: CurrentUser, db: Db) -> GroupOut:
    a = await _access(db, gid, user)
    async with errors():
        await svc.set_image(a, None, None)
    await db.commit()
    return await group_out(db, a)


@router.get("/groups/{gid}/image", response_class=Response)
async def get_image(gid: uuid.UUID, user: CurrentUser, db: Db) -> Response:
    a = await _access(db, gid, user)
    found = await svc.image(db, a)
    if found is None:
        raise problem(404, "Die Gruppe hat kein Bild.")
    data, kind = found
    headers = {"Cache-Control": "private, max-age=300"}
    return Response(content=data, media_type=kind, headers=headers)


# ---------------------------------------------------------------------------
# Regeln
# ---------------------------------------------------------------------------


@router.patch("/groups/{gid}/rules")
async def patch_rules(
    gid: uuid.UUID, body: dict[str, object], user: CurrentUser, db: Db
) -> GroupRulesChanged:
    """Geänderte Regeln gelten ab der nächsten Saison; in einer Gruppe ohne Turnier sofort."""
    a = await _access(db, gid, user)
    async with errors():
        applied = await svc.change_rules(db, a, body)
    await db.commit()
    return GroupRulesChanged(applied_now=applied, group=await group_out(db, a))


@router.delete("/groups/{gid}/rules/pending")
async def discard_pending(gid: uuid.UUID, user: CurrentUser, db: Db) -> GroupOut:
    a = await _access(db, gid, user)
    async with errors():
        await svc.discard_pending_rules(a)
    await db.commit()
    return await group_out(db, a)


# ---------------------------------------------------------------------------
# Mitglieder und Rollen
# ---------------------------------------------------------------------------


@router.get("/groups/{gid}/members")
async def list_members(gid: uuid.UUID, user: CurrentUser, db: Db) -> list[MemberOut]:
    """Mitglieder mit Konto und Rolle; Zuschauer sehen keine Profile."""
    a = await _access(db, gid, user)
    async with errors():
        a.require(Permission.VIEW_PROFILES, write=False)
    return [
        MemberOut(
            user_id=m.user_id,
            display_name=m.display_name,
            role=m.role,
            joined_at=m.joined_at,
            player_id=m.player_id,
            is_me=m.user_id == user.id,
        )
        for m in await svc.members(db, gid)
    ]


@router.put("/groups/{gid}/members/{uid}/role")
async def change_role(
    gid: uuid.UUID, uid: uuid.UUID, body: RoleChange, user: CurrentUser, db: Db
) -> list[MemberOut]:
    a = await _access(db, gid, user)
    async with errors():
        await svc.set_role(db, a, uid, body.role)
    await db.commit()
    return await list_members(gid, user, db)


@router.delete("/groups/{gid}/members/me")
async def leave_group(gid: uuid.UUID, user: CurrentUser, db: Db) -> LeftGroup:
    """Gruppe verlassen; Ergebnisse bleiben. Geht der letzte Admin, rückt das älteste nach."""
    a = await _access(db, gid, user)
    async with errors():
        successor = await svc.leave(db, a)
    name = None
    if successor is not None:
        new_admin = await db.get(AppUser, successor)
        name = new_admin.display_name if new_admin else None
    await db.commit()
    return LeftGroup(new_admin=name)


# ---------------------------------------------------------------------------
# Archivieren, löschen, wiederherstellen
# ---------------------------------------------------------------------------


@router.post("/groups/{gid}/archive")
async def archive(gid: uuid.UUID, user: CurrentUser, db: Db) -> GroupOut:
    a = await _access(db, gid, user)
    async with errors():
        await svc.archive(db, a)
    await db.commit()
    return await group_out(db, a)


@router.delete("/groups/{gid}/archive")
async def unarchive(gid: uuid.UUID, user: CurrentUser, db: Db) -> GroupOut:
    a = await _access(db, gid, user)
    async with errors():
        await svc.unarchive(a)
    await db.commit()
    return await group_out(db, a)


@router.delete("/groups/{gid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(gid: uuid.UUID, user: CurrentUser, db: Db) -> None:
    """In den Papierkorb: 30 Tage lang kann ein Admin die Gruppe wiederherstellen."""
    a = await _access(db, gid, user)
    async with errors():
        await svc.delete_group(db, a)
    await db.commit()


@router.get("/me/deleted-groups")
async def deleted_groups(user: CurrentUser, db: Db) -> list[DeletedGroupOut]:
    return [
        DeletedGroupOut(
            id=g.id,
            name=g.name,
            deleted_at=g.deleted_at,
            purge_on=(g.deleted_at + PURGE_AFTER).date(),
        )
        for g in await svc.deleted_groups(db, user)
        if g.deleted_at is not None
    ]


@router.post("/groups/{gid}/restore")
async def restore(gid: uuid.UUID, user: CurrentUser, db: Db) -> GroupOut:
    async with errors():
        await svc.restore(db, gid, user)
    await db.flush()
    a = await _access(db, gid, user)
    await db.commit()
    return await group_out(db, a)


# ---------------------------------------------------------------------------
# Spieler zusammenführen (Phase 5, AP-2)
# ---------------------------------------------------------------------------


@router.post("/groups/{gid}/players/merge")
async def merge_players(gid: uuid.UUID, body: MergeRequest, user: CurrentUser, db: Db) -> MergeOut:
    """Gast, Vorgemerkten oder Ehemaligen in einen anderen Spieler übernehmen; nur Admins."""
    a = await _access(db, gid, user)
    async with errors():
        a.require(Permission.MANAGE)
    try:
        p = await players.plan(db, gid, body.source_id, body.target_id)
    except players.MergeRefused as exc:
        raise problem(409, str(exc)) from None
    out = MergeOut(
        source=p.source.display_name,
        target=p.target.display_name,
        tournaments=p.tournaments,
        matches=p.matches,
        merged=body.apply,
    )
    if body.apply:
        await players.merge(db, p)
        await db.commit()
    return out


# ---------------------------------------------------------------------------
# Profilbild für Spieler ohne Konto (Phase 5, AP-15)
# ---------------------------------------------------------------------------


@router.put("/groups/{gid}/players/{pid}/avatar", status_code=status.HTTP_204_NO_CONTENT)
async def put_player_avatar(
    gid: uuid.UUID, pid: uuid.UUID, body: PlayerAvatarBody, user: CurrentUser, db: Db
) -> None:
    """Wesen für einen vorgemerkten oder ehemaligen Spieler; ``preset: null`` entfernt es."""
    a = await _access(db, gid, user)
    async with errors():
        a.require(Permission.MANAGE)
    player = await db.get(Player, pid)
    if player is None or player.group_id != gid:
        raise problem(404, "Spieler nicht gefunden.")
    try:
        avatars.set_player_preset(player, body.preset)
    except avatars.InvalidAvatar as exc:
        raise problem(422, str(exc)) from None
    await db.commit()
