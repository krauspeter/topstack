"""Regeln, die das Schema für Turniere selbst durchsetzt (UC-03, ADR-0013)."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from tests.db.factories import make_group, make_member, make_tournament
from topstack.db.models import (
    Match,
    Round,
    Tournament,
    TournamentCancelVote,
    TournamentEntry,
)


async def test_defaults(session: AsyncSession):
    tournament = await make_tournament(session, players=2)
    assert tournament.status == "setup"
    assert tournament.format == "draft"
    assert tournament.settings == {}
    assert tournament.imported is False


async def test_only_one_open_tournament_per_group(session: AsyncSession):
    group = await make_group(session)
    await make_tournament(session, group=group)
    with pytest.raises(IntegrityError):
        async with session.begin_nested():
            await make_tournament(session, group=group)


@pytest.mark.parametrize("closed_status", ["finished", "cancelled"])
async def test_closed_tournament_allows_new_one(session: AsyncSession, closed_status: str):
    group = await make_group(session)
    await make_tournament(session, group=group, status=closed_status)
    await make_tournament(session, group=group)


async def test_imported_tournaments_do_not_block(session: AsyncSession):
    group = await make_group(session)
    session.add(Tournament(group_id=group.id, set_code="SOI", imported=True))
    session.add(Tournament(group_id=group.id, set_code="EMN", imported=True))
    await session.flush()
    await make_tournament(session, group=group)


async def test_seat_unique_per_tournament(session: AsyncSession):
    tournament = await make_tournament(session, players=2)
    entries = list(
        await session.scalars(
            select(TournamentEntry).where(TournamentEntry.tournament_id == tournament.id)
        )
    )
    entries[0].seat_no = 1
    await session.flush()
    with pytest.raises(IntegrityError):
        async with session.begin_nested():
            entries[1].seat_no = 1
            await session.flush()


async def test_colors_only_wubrg(session: AsyncSession):
    tournament = await make_tournament(session, players=1)
    entry = await session.scalar(
        select(TournamentEntry).where(TournamentEntry.tournament_id == tournament.id)
    )
    entry.colors = "UB"
    await session.flush()
    with pytest.raises(IntegrityError):
        async with session.begin_nested():
            entry.colors = "UBX"
            await session.flush()


async def test_match_version_starts_at_zero(session: AsyncSession):
    tournament = await make_tournament(session, players=2)
    a, b = await session.scalars(
        select(TournamentEntry.player_id).where(TournamentEntry.tournament_id == tournament.id)
    )
    rnd = Round(tournament_id=tournament.id, number=1)
    session.add(rnd)
    await session.flush()
    match = Match(tournament_id=tournament.id, round_id=rnd.id, player_a_id=a, player_b_id=b)
    session.add(match)
    await session.flush()
    assert match.version == 0
    assert match.status == "scheduled"


async def test_cancel_request_needs_both_fields(session: AsyncSession):
    tournament = await make_tournament(session, players=1, status="running")
    tid, starter = tournament.id, tournament.started_by
    with pytest.raises(IntegrityError):
        async with session.begin_nested():
            tournament.cancel_requested_by = starter
            await session.flush()

    fresh = await session.get(Tournament, tid, populate_existing=True)
    fresh.cancel_requested_by = starter
    fresh.cancel_requested_at = datetime.now(UTC)
    await session.flush()


async def test_cancel_vote_only_from_participants(session: AsyncSession):
    tournament = await make_tournament(session, players=3, status="running")
    voter = tournament.started_by
    session.add(TournamentCancelVote(tournament_id=tournament.id, player_id=voter))
    await session.flush()

    outsider = await make_member(session, await make_group(session))
    with pytest.raises(IntegrityError):
        async with session.begin_nested():
            session.add(TournamentCancelVote(tournament_id=tournament.id, player_id=outsider.id))
            await session.flush()
