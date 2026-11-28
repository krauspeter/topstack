"""Head-to-Head aus der Datenbank (Phase 5, AP-6).

Es zählen abgeschlossene Matches nicht abgebrochener Turniere der Gruppe, auch aus den
Altdaten. Gäste stehen nicht in der Tabelle, ihre Matches fallen weg.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from topstack.db.models import Match, Player, Tournament
from topstack.domain.h2h import Meeting


async def meetings(
    db: AsyncSession, gid: uuid.UUID
) -> tuple[list[Meeting], dict[uuid.UUID, Player]]:
    pa, pb = aliased(Player), aliased(Player)
    rows = (
        await db.execute(
            select(Match, Tournament, pa, pb)
            .join(Tournament, Tournament.id == Match.tournament_id)
            .join(pa, pa.id == Match.player_a_id)
            .join(pb, pb.id == Match.player_b_id)
            .where(
                Tournament.group_id == gid,
                Tournament.status != "cancelled",
                Match.status == "finished",
                pa.kind != "guest",
                pb.kind != "guest",
            )
            .order_by(Tournament.held_on, Match.finished_at.nulls_last(), Match.id)
        )
    ).all()
    players: dict[uuid.UUID, Player] = {}
    out: list[Meeting] = []
    for m, t, a, b in rows:
        players[a.id], players[b.id] = a, b
        out.append(
            Meeting(
                m.player_a_id,
                m.player_b_id,
                m.games_a,
                m.games_b,
                m.games_drawn,
                t.held_on,
                t.set_code,
                t.imported,
            )
        )
    return out, players
