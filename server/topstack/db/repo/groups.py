"""Gruppen, Regeln, Mitgliedschaften, Spieler und Saisons."""

import uuid
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from topstack.db.models import AppUser, GroupRules, Membership, Player, PlayGroup, Season


async def create_group(
    session: AsyncSession,
    *,
    name: str,
    created_by: uuid.UUID | None = None,
    rules: dict[str, Any] | None = None,
) -> PlayGroup:
    """Legt eine Gruppe mit ihren Regeln an; nicht gesetzte Regeln nehmen die Standardwerte."""
    group = PlayGroup(name=name.strip(), created_by=created_by)
    session.add(group)
    await session.flush()
    session.add(GroupRules(group_id=group.id, **(rules or {})))
    await session.flush()
    return group


async def get_group_by_name(session: AsyncSession, name: str) -> PlayGroup | None:
    return await session.scalar(select(PlayGroup).where(PlayGroup.name == name.strip()))


async def get_rules(session: AsyncSession, group_id: uuid.UUID) -> GroupRules:
    rules = await session.get(GroupRules, group_id)
    if rules is None:
        raise LookupError(f"Gruppe {group_id} hat keine Regeln")
    return rules


async def add_member(
    session: AsyncSession, *, group_id: uuid.UUID, user: AppUser, role: str = "member"
) -> Player:
    """Macht ein Konto zum Mitglied und legt den passenden Spieler in der Gruppe an."""
    session.add(Membership(group_id=group_id, app_user_id=user.id, role=role))
    player = Player(
        group_id=group_id, app_user_id=user.id, kind="member", display_name=user.display_name
    )
    session.add(player)
    await session.flush()
    return player


async def add_guest(session: AsyncSession, *, group_id: uuid.UUID, display_name: str) -> Player:
    player = Player(group_id=group_id, kind="guest", display_name=display_name.strip())
    session.add(player)
    await session.flush()
    return player


async def get_membership(
    session: AsyncSession, *, group_id: uuid.UUID, user_id: uuid.UUID
) -> Membership | None:
    return await session.get(Membership, (group_id, user_id))


async def create_season(
    session: AsyncSession,
    *,
    group_id: uuid.UUID,
    name: str,
    starts_on: date,
    ends_on: date | None,
) -> Season:
    season = Season(group_id=group_id, name=name, starts_on=starts_on, ends_on=ends_on)
    session.add(season)
    await session.flush()
    return season


async def list_seasons(session: AsyncSession, group_id: uuid.UUID) -> list[Season]:
    stmt = select(Season).where(Season.group_id == group_id).order_by(Season.starts_on)
    return list(await session.scalars(stmt))
