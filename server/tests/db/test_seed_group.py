"""Skript seed_group: legt die eigene Gruppe an und ist wiederholbar."""

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from topstack.db.models import Membership, Player, PlayGroup
from topstack.db.repo import accounts, groups
from topstack.scripts.seed_group import parse_args, seed_group

ARGS = dict(
    group_name="Draft-Runde", admin_email="Peter@example.org", admin_name="Peter", season_year=2027
)


async def test_seed_creates_group_admin_and_season(session: AsyncSession):
    result = await seed_group(session, **ARGS)
    assert result.created

    admin = await accounts.get_user_by_email(session, "peter@example.org")
    assert admin is not None
    membership = await groups.get_membership(session, group_id=result.group.id, user_id=admin.id)
    assert membership is not None and membership.role == "admin"

    seasons = await groups.list_seasons(session, result.group.id)
    assert [(s.name, s.starts_on, s.ends_on) for s in seasons] == [
        ("Saison 2027", date(2027, 1, 1), date(2027, 12, 31))
    ]
    rules = await groups.get_rules(session, result.group.id)
    assert rules.starting_life == 20


async def test_seed_twice_changes_nothing(session: AsyncSession):
    first = await seed_group(session, **ARGS)
    second = await seed_group(session, **ARGS)
    assert not second.created
    assert second.group.id == first.group.id
    assert await session.scalar(select(func.count()).select_from(PlayGroup)) == 1
    assert await session.scalar(select(func.count()).select_from(Membership)) == 1
    assert await session.scalar(select(func.count()).select_from(Player)) == 1


async def test_seed_reuses_existing_account(session: AsyncSession):
    user = await accounts.create_user(session, email="peter@example.org", display_name="Peter K.")
    result = await seed_group(session, **ARGS)
    membership = await groups.get_membership(session, group_id=result.group.id, user_id=user.id)
    assert membership is not None


def test_parse_args_default_season():
    args = parse_args(["--group", "G", "--admin-email", "a@b.c", "--admin-name", "A"])
    assert args.season_year == 2027
