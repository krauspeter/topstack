"""Elo aus der Datenbank (Phase 5, AP-5, ADR-0019).

Es zählen abgeschlossene Matches abgeschlossener oder laufender Turniere seit v1.0, nicht
abgebrochene Turniere, keine Altdaten und keine Matches mit Gästen (Festlegungen vom 22. und
27.11.2026). Die Reihenfolge: Turnierdatum, dann Ende des Matches.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from topstack.db.models import Match, Player, Tournament
from topstack.domain.elo import EloMatch, EloState, ratings


async def _matches(db: AsyncSession, gid: uuid.UUID | None):
    pa, pb = aliased(Player), aliased(Player)
    stmt = (
        select(Match, Tournament.held_on, pa, pb)
        .join(Tournament, Tournament.id == Match.tournament_id)
        .join(pa, pa.id == Match.player_a_id)
        .join(pb, pb.id == Match.player_b_id)
        .where(
            Match.status == "finished",
            Tournament.status != "cancelled",
            Tournament.imported.is_(False),
            pa.kind != "guest",
            pb.kind != "guest",
        )
        .order_by(Tournament.held_on, Match.finished_at.nulls_last(), Match.id)
    )
    if gid is not None:
        stmt = stmt.where(Tournament.group_id == gid)
    return (await db.execute(stmt)).all()


async def group_elo(db: AsyncSession, gid: uuid.UUID) -> dict[uuid.UUID, EloState]:
    """Gruppen-Elo je Spieler der Gruppe."""
    rows = await _matches(db, gid)
    return ratings(
        EloMatch(m.player_a_id, m.player_b_id, m.games_a, m.games_b, held) for m, held, _, _ in rows
    )


def _account(p: Player) -> uuid.UUID:
    """Globale Elo hängt am Konto; Spieler ohne Konto zählen unter ihrer Spieler-ID."""
    return p.app_user_id or p.id


async def global_elo(db: AsyncSession) -> dict[uuid.UUID, EloState]:
    """Globale Elo je Konto über alle Gruppen."""
    rows = await _matches(db, None)
    return ratings(
        EloMatch(_account(a), _account(b), m.games_a, m.games_b, held) for m, held, a, b in rows
    )
