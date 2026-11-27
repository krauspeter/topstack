"""Rangliste und Basis-Statistik aus der Datenbank (F-18, F-22, AP-9).

Zählt nur abgeschlossene Turniere der Gruppe (TC-73); Gäste stehen nicht in der
Rangliste (TC-72), ihre Matches zählen aber für ihre Gegner.
"""

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from topstack.db.models import AppUser, Match, Player, Season, Tournament, TournamentEntry
from topstack.db.repo import groups
from topstack.domain.leaderboard import (
    EntryResult,
    MatchPointRules,
    MatchRecord,
    TournamentResult,
)
from topstack.services import groups as group_svc


class NotMember(Exception):
    pass


@dataclass
class Filter:
    season_id: uuid.UUID | None = None
    since: date | None = None
    until: date | None = None


@dataclass
class Results:
    tournaments: list[TournamentResult[uuid.UUID]]
    players: dict[uuid.UUID, Player]
    rules: MatchPointRules


async def check_member(db: AsyncSession, gid: uuid.UUID, user: AppUser) -> None:
    """Rangliste und Statistik sehen alle Rollen, auch Zuschauer (ADR-0018)."""
    try:
        await group_svc.access(db, gid, user)
    except group_svc.NotFound:
        raise NotMember from None


async def seasons(db: AsyncSession, gid: uuid.UUID) -> list[Season]:
    return list(
        await db.scalars(
            select(Season).where(Season.group_id == gid).order_by(Season.starts_on.desc())
        )
    )


async def load(db: AsyncSession, gid: uuid.UUID, f: Filter) -> Results:
    stmt = select(Tournament).where(Tournament.group_id == gid, Tournament.status == "finished")
    if f.season_id is not None:
        stmt = stmt.where(Tournament.season_id == f.season_id)
    if f.since is not None:
        stmt = stmt.where(Tournament.held_on >= f.since)
    if f.until is not None:
        stmt = stmt.where(Tournament.held_on <= f.until)
    tournaments = list(await db.scalars(stmt.order_by(Tournament.held_on)))
    ids = [t.id for t in tournaments]

    entries = list(
        await db.scalars(
            select(TournamentEntry).where(
                TournamentEntry.tournament_id.in_(ids),
                TournamentEntry.status == "accepted",
                TournamentEntry.final_place.is_not(None),
            )
        )
    )
    matches = list(
        await db.scalars(
            select(Match).where(Match.tournament_id.in_(ids), Match.status == "finished")
        )
    )
    player_ids = {e.player_id for e in entries}
    players = {p.id: p for p in await db.scalars(select(Player).where(Player.id.in_(player_ids)))}
    rules_row = await groups.get_rules(db, gid)
    rules = MatchPointRules(
        rules_row.match_points_win, rules_row.match_points_draw, rules_row.match_points_loss
    )

    results = []
    for t in tournaments:
        results.append(
            TournamentResult(
                t.held_on,
                [
                    EntryResult(e.player_id, e.final_place or 0, e.ranking_points or 0, e.colors)
                    for e in entries
                    if e.tournament_id == t.id and players[e.player_id].kind != "guest"
                ],
                [
                    MatchRecord(m.player_a_id, m.player_b_id, m.games_a, m.games_b, m.games_drawn)
                    for m in matches
                    if m.tournament_id == t.id
                ],
                # auch Gäste, damit „Gegen Farben“ ihre Decks kennt
                {e.player_id: e.colors for e in entries if e.tournament_id == t.id},
            )
        )
    return Results(results, players, rules)
