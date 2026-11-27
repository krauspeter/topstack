"""Spieler zusammenführen (Phase 5, AP-2): Gast mit Konto, doppelte Vorgemerkte, Ehemalige.

Alle Ergebnisse des einen Spielers wechseln auf den anderen, danach verschwindet er. Genutzt von
der App (nur Admins) und von ``admin.sh merge-player``.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import Column, Table, delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from topstack.db.models import (
    Award,
    EloRating,
    Game,
    GameEvent,
    Match,
    MatchCorrection,
    Player,
    Round,
    Tournament,
    TournamentCancelVote,
    TournamentEntry,
)

WITHOUT_ACCOUNT = ("guest", "reserved", "former")


class MergeRefused(Exception):
    """Zusammenführen geht nicht; die Meldung sagt, warum."""


@dataclass
class MergePlan:
    source: Player
    target: Player
    tournaments: int
    matches: int


# Spalten, die auf einen Spieler zeigen (ohne tournament_entry, das hat einen eigenen Schritt)
def _player_columns() -> list[Column]:
    tables: list[tuple[Table, tuple[str, ...]]] = [
        (Tournament.__table__, ("started_by", "cancel_requested_by")),
        (Round.__table__, ("bye_player_id",)),
        (Match.__table__, ("player_a_id", "player_b_id", "result_by")),
        (MatchCorrection.__table__, ("changed_by",)),
        (Game.__table__, ("starting_player_id", "winner_player_id")),
        (GameEvent.__table__, ("player_id",)),
        (Award.__table__, ("player_id",)),
    ]
    return [table.c[name] for table, names in tables for name in names]


async def plan(
    db: AsyncSession, group_id: uuid.UUID, source_id: uuid.UUID, target_id: uuid.UUID
) -> MergePlan:
    """Prüft, ob ``source`` in ``target`` aufgehen kann, und zählt, was mitwandert."""
    if source_id == target_id:
        raise MergeRefused("Bitte zwei verschiedene Spieler wählen.")
    source = await db.get(Player, source_id, with_for_update=True)
    target = await db.get(Player, target_id, with_for_update=True)
    if source is None or target is None or {source.group_id, target.group_id} != {group_id}:
        raise MergeRefused("Spieler nicht gefunden.")
    if source.kind not in WITHOUT_ACCOUNT:
        raise MergeRefused(
            f"{source.display_name} hat ein Konto. Wähle den Spieler mit Konto als Ziel."
        )
    shared = list(
        await db.scalars(
            select(Tournament)
            .join(TournamentEntry, TournamentEntry.tournament_id == Tournament.id)
            .where(TournamentEntry.player_id == source.id)
            .where(
                Tournament.id.in_(
                    select(TournamentEntry.tournament_id).where(
                        TournamentEntry.player_id == target.id
                    )
                )
            )
        )
    )
    if shared:
        names = ", ".join(f"{t.set_code} vom {t.held_on:%d.%m.%Y}" for t in shared)
        raise MergeRefused(
            f"{source.display_name} und {target.display_name} stehen beide im Turnier {names}."
        )
    tournaments = await db.scalar(
        select(func.count())
        .select_from(TournamentEntry)
        .where(TournamentEntry.player_id == source.id)
    )
    matches = await db.scalar(
        select(func.count())
        .select_from(Match)
        .where((Match.player_a_id == source.id) | (Match.player_b_id == source.id))
    )
    return MergePlan(source, target, tournaments or 0, matches or 0)


async def merge(db: AsyncSession, p: MergePlan) -> None:
    """Führt ``p.source`` in ``p.target`` zusammen; ``source`` wird danach gelöscht."""
    src, dst = p.source.id, p.target.id
    # Abbruch-Stimmen hängen per Fremdschlüssel am Turnier-Eintrag; sie gelten nur in offenen
    # Turnieren und werden neu abgegeben
    await db.execute(delete(TournamentCancelVote).where(TournamentCancelVote.player_id == src))
    await db.execute(
        update(TournamentEntry).where(TournamentEntry.player_id == src).values(player_id=dst)
    )
    for col in _player_columns():
        await db.execute(update(col.table).where(col == src).values({col.name: dst}))
    await db.execute(delete(EloRating).where(EloRating.player_id == src))
    # Ein Gast oder Ehemaliger, der in einem Vorgemerkten aufgeht, macht diesen nicht zum Gast
    if p.target.kind == "guest" and p.source.kind in ("reserved", "former"):
        p.target.kind = p.source.kind
    await db.flush()
    await db.delete(p.source)
    await db.flush()
