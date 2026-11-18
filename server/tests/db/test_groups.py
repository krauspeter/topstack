"""Repository-Tests für Gruppen, Mitglieder und Saisons."""

from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from tests.db.factories import make_group, make_member, make_user
from topstack.db.models import AppUser, Player
from topstack.db.repo import accounts, groups


async def test_create_group_has_default_rules(session: AsyncSession):
    group = await make_group(session, "Draft-Runde")
    rules = await groups.get_rules(session, group.id)
    assert (rules.match_points_win, rules.match_points_draw, rules.match_points_loss) == (3, 1, 0)
    assert rules.placement_bonus == [2, 1]
    assert rules.starting_life == 20
    assert rules.games_to_win == 2
    assert rules.match_time_limit_min is None
    assert rules.season_mode == "calendar_year"


async def test_create_group_with_custom_rules(session: AsyncSession):
    group = await groups.create_group(
        session, name="Commander", rules={"starting_life": 40, "match_time_limit_min": 50}
    )
    rules = await groups.get_rules(session, group.id)
    assert rules.starting_life == 40
    assert rules.match_time_limit_min == 50


async def test_add_member_creates_membership_and_player(session: AsyncSession):
    group = await make_group(session)
    user = await make_user(session, "Anna")
    player = await groups.add_member(session, group_id=group.id, user=user, role="admin")

    membership = await groups.get_membership(session, group_id=group.id, user_id=user.id)
    assert membership is not None and membership.role == "admin"
    assert player.kind == "member"
    assert player.display_name == "Anna"
    assert player.app_user_id == user.id


async def test_member_only_once_per_group(session: AsyncSession):
    group = await make_group(session)
    user = await make_user(session)
    await groups.add_member(session, group_id=group.id, user=user)
    with pytest.raises(IntegrityError):
        async with session.begin_nested():
            await groups.add_member(session, group_id=group.id, user=user)


async def test_guest_has_no_account(session: AsyncSession):
    group = await make_group(session)
    guest = await groups.add_guest(session, group_id=group.id, display_name=" Gast Ben ")
    assert guest.kind == "guest"
    assert guest.app_user_id is None
    assert guest.display_name == "Gast Ben"


async def test_player_kind_must_match_account(session: AsyncSession):
    group = await make_group(session)
    with pytest.raises(IntegrityError):
        async with session.begin_nested():
            session.add(Player(group_id=group.id, kind="member", display_name="ohne Konto"))
            await session.flush()


async def test_favorite_colors_only_wubrg(session: AsyncSession):
    with pytest.raises(IntegrityError):
        async with session.begin_nested():
            session.add(AppUser(display_name="X", favorite_colors="WX"))
            await session.flush()


async def test_user_email_is_case_insensitive_lookup(session: AsyncSession):
    await accounts.create_user(session, email=" Peter@Example.org ", display_name="Peter")
    found = await accounts.get_user_by_email(session, "peter@example.ORG")
    assert found is not None and found.email == "peter@example.org"


async def test_seasons_sorted_and_eternal_allowed(session: AsyncSession):
    group = await make_group(session)
    await groups.create_season(
        session, group_id=group.id, name="2027", starts_on=date(2027, 1, 1), ends_on=None
    )
    await groups.create_season(
        session,
        group_id=group.id,
        name="2026",
        starts_on=date(2026, 1, 1),
        ends_on=date(2026, 12, 31),
    )
    names = [s.name for s in await groups.list_seasons(session, group.id)]
    assert names == ["2026", "2027"]


async def test_season_end_not_before_start(session: AsyncSession):
    group = await make_group(session)
    with pytest.raises(IntegrityError):
        async with session.begin_nested():
            await groups.create_season(
                session,
                group_id=group.id,
                name="kaputt",
                starts_on=date(2027, 2, 1),
                ends_on=date(2027, 1, 1),
            )


async def test_make_member_factory(session: AsyncSession):
    group = await make_group(session)
    player = await make_member(session, group, role="viewer")
    membership = await groups.get_membership(session, group_id=group.id, user_id=player.app_user_id)
    assert membership is not None and membership.role == "viewer"
