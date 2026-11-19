"""Eigenes Profil (``/me``)."""

from fastapi import APIRouter
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from topstack.api.deps import CurrentUser, Db
from topstack.api.schemas import GroupMembership, Me, MePatch
from topstack.db.models import AppUser, Membership, PasskeyCredential, Player, PlayGroup

router = APIRouter(tags=["Profil"])


async def build_me(db: AsyncSession, user: AppUser) -> Me:
    rows = await db.execute(
        select(PlayGroup.id, PlayGroup.name, Membership.role, Player.id)
        .join(Membership, Membership.group_id == PlayGroup.id)
        .outerjoin(
            Player,
            (Player.group_id == PlayGroup.id) & (Player.app_user_id == Membership.app_user_id),
        )
        .where(Membership.app_user_id == user.id)
        .order_by(PlayGroup.name)
    )
    passkeys = await db.scalar(
        select(func.count())
        .select_from(PasskeyCredential)
        .where(PasskeyCredential.app_user_id == user.id)
    )
    return Me(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        favorite_colors=user.favorite_colors,
        locale=user.locale,
        has_passkey=bool(passkeys),
        groups=[
            GroupMembership(id=gid, name=name, role=role, player_id=pid)
            for gid, name, role, pid in rows
        ],
    )


@router.get("/me")
async def get_me(user: CurrentUser, db: Db) -> Me:
    return await build_me(db, user)


@router.patch("/me")
async def patch_me(body: MePatch, user: CurrentUser, db: Db) -> Me:
    if body.display_name is not None:
        user.display_name = body.display_name
        # Spielernamen in allen Gruppen mitziehen, damit Tabellen den neuen Namen zeigen
        await db.execute(
            update(Player)
            .where(Player.app_user_id == user.id, Player.kind == "member")
            .values(display_name=body.display_name)
        )
    if body.favorite_colors is not None:
        user.favorite_colors = body.favorite_colors
    await db.commit()
    return await build_me(db, user)
