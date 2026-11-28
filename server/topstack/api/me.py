"""Eigenes Profil (``/me``)."""

import uuid

from fastapi import APIRouter, Response
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from topstack.api.deps import CurrentUser, Db
from topstack.api.problems import problem
from topstack.api.schemas import AvatarBody, GroupMembership, Me, MePatch
from topstack.db.models import AppUser, Membership, PasskeyCredential, Player, PlayGroup
from topstack.services import avatars, feedback

router = APIRouter(tags=["Profil"])


async def build_me(db: AsyncSession, user: AppUser) -> Me:
    rows = await db.execute(
        select(
            PlayGroup.id,
            PlayGroup.name,
            Membership.role,
            Player.id,
            PlayGroup.archived_at.is_not(None),
            PlayGroup.image_type.is_not(None),
        )
        .join(Membership, Membership.group_id == PlayGroup.id)
        .outerjoin(
            Player,
            (Player.group_id == PlayGroup.id) & (Player.app_user_id == Membership.app_user_id),
        )
        .where(Membership.app_user_id == user.id, PlayGroup.deleted_at.is_(None))
        .order_by(PlayGroup.archived_at.is_not(None), PlayGroup.name)
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
        avatar=avatars.of_user(user),
        groups=[
            GroupMembership(
                id=gid, name=name, role=role, player_id=pid, archived=archived, has_image=has_image
            )
            for gid, name, role, pid, archived, has_image in rows
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


# ---------------------------------------------------------------------------
# Profilbild (Phase 5, AP-15)
# ---------------------------------------------------------------------------


@router.put("/me/avatar")
async def put_avatar(body: AvatarBody, user: CurrentUser, db: Db) -> Me:
    """Wesen aus der Vorauswahl oder eigenes Bild (die App schneidet auf 256 px zu)."""
    if (body.preset is None) == (body.image is None):
        raise problem(422, "Bitte ein Wesen oder ein Bild wählen.")
    try:
        if body.preset is not None:
            avatars.set_preset(user, body.preset)
        else:
            try:
                raw, kind = feedback.decode_screenshot(body.image or "")
            except feedback.BadScreenshot:
                raise avatars.InvalidAvatar("Das Bild muss PNG, JPEG oder WebP sein.") from None
            avatars.set_image(user, raw, kind)
    except avatars.InvalidAvatar as exc:
        raise problem(422, str(exc)) from None
    await db.commit()
    return await build_me(db, user)


@router.delete("/me/avatar")
async def delete_avatar(user: CurrentUser, db: Db) -> Me:
    avatars.clear(user)
    await db.commit()
    return await build_me(db, user)


@router.get("/avatars/{uid}", response_class=Response)
async def get_avatar(uid: uuid.UUID, user: CurrentUser, db: Db) -> Response:
    """Eigenes Profilbild eines Kontos; nur für angemeldete Nutzer."""
    found = await avatars.image(db, uid)
    if found is None:
        raise problem(404, "Kein Profilbild.")
    data, kind = found
    # Die Adresse enthält ?v=…, ein neues Bild bekommt eine neue Adresse
    return Response(
        content=data, media_type=kind, headers={"Cache-Control": "private, max-age=86400"}
    )
