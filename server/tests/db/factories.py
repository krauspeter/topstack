"""Kleine Fabrikfunktionen für Testdaten (ADR-0014): jede Funktion legt frische Daten an."""

import itertools
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from topstack.db.models import AppUser, Player, PlayGroup, Tournament, TournamentEntry
from topstack.db.repo import accounts, groups

_counter = itertools.count(1)


async def make_user(session: AsyncSession, name: str | None = None) -> AppUser:
    n = next(_counter)
    return await accounts.create_user(
        session,
        email=f"spieler{n}-{uuid.uuid4().hex[:6]}@example.org",
        display_name=name or f"Spieler {n}",
    )


async def make_group(session: AsyncSession, name: str | None = None) -> PlayGroup:
    return await groups.create_group(session, name=name or f"Gruppe {next(_counter)}")


async def make_member(
    session: AsyncSession, group: PlayGroup, role: str = "member", name: str | None = None
) -> Player:
    user = await make_user(session, name)
    return await groups.add_member(session, group_id=group.id, user=user, role=role)


async def make_tournament(
    session: AsyncSession,
    *,
    group: PlayGroup | None = None,
    players: int = 0,
    status: str = "setup",
    set_code: str = "DSK",
) -> Tournament:
    """Turnier mit ``players`` zugesagten Mitgliedern; der erste hat das Turnier gestartet."""
    group = group or await make_group(session)
    members = [await make_member(session, group) for _ in range(players)]
    tournament = Tournament(
        group_id=group.id,
        set_code=set_code,
        status=status,
        started_by=members[0].id if members else None,
    )
    session.add(tournament)
    await session.flush()
    for member in members:
        session.add(
            TournamentEntry(tournament_id=tournament.id, player_id=member.id, status="accepted")
        )
    await session.flush()
    return tournament
