"""Altdaten importieren und zurücknehmen (Phase 5, AP-4, ADR-0019). Nur Gruppen-Admins.

Jedes Turnier wird ein normales, abgeschlossenes ``tournament`` mit ``imported = true`` und
``import_run_id``. Unbekannte Namen werden Ehemalige (``player.kind = 'former'``). Die
Ranglistenpunkte rechnet der Import nach den Regeln der Gruppe; Elo zählt Altdaten nicht.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from topstack.db.models import (
    ImportRun,
    Match,
    Player,
    Round,
    Season,
    Tournament,
    TournamentEntry,
)
from topstack.db.repo import groups as group_repo
from topstack.domain.legacy import LegacyTournament, Parsed, Problem
from topstack.domain.ranking import ranking_points


def now() -> datetime:
    return datetime.now(UTC)


@dataclass
class PreviewTournament:
    key: str
    held_on: date
    set_code: str
    players: int
    matches: int
    winner: str
    duplicate: bool  # am selben Tag mit demselben Set gibt es schon ein Turnier


@dataclass
class Preview:
    tournaments: list[PreviewTournament]
    new_players: list[str]
    known_players: list[str]
    problems: list[Problem]
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.problems and bool(self.tournaments)


async def _players_by_name(db: AsyncSession, gid: uuid.UUID) -> dict[str, Player]:
    """Alle Spieler der Gruppe nach Namen (klein); Mitglieder vor Vorgemerkten vor Ehemaligen."""
    order = {"member": 0, "reserved": 1, "former": 2, "guest": 3}
    found: dict[str, Player] = {}
    rows = list(await db.scalars(select(Player).where(Player.group_id == gid)))
    for p in sorted(rows, key=lambda p: (order.get(p.kind, 9), p.created_at)):
        found.setdefault(p.display_name.lower(), p)
    return found


async def preview(db: AsyncSession, gid: uuid.UUID, parsed: Parsed) -> Preview:
    known = await _players_by_name(db, gid)
    names = {e.name for t in parsed.tournaments for e in t.entries}
    new = sorted({n for n in names if n.lower() not in known}, key=str.lower)
    existing = sorted({known[n.lower()].display_name for n in names if n.lower() in known})
    out: list[PreviewTournament] = []
    warnings: list[str] = []
    for t in sorted(parsed.tournaments, key=lambda t: t.held_on):
        same = await db.scalar(
            select(func.count())
            .select_from(Tournament)
            .where(
                Tournament.group_id == gid,
                Tournament.held_on == t.held_on,
                func.upper(Tournament.set_code) == t.set_code.upper(),
                Tournament.status != "cancelled",
            )
        )
        winner = ", ".join(e.name for e in t.entries if e.place == 1) or "–"
        out.append(
            PreviewTournament(
                t.key, t.held_on, t.set_code, len(t.entries), len(t.matches), winner, bool(same)
            )
        )
        if same:
            warnings.append(
                f"Am {t.held_on:%d.%m.%Y} gibt es schon ein Turnier {t.set_code} – doppelt?"
            )
    return Preview(out, new, existing, parsed.problems, warnings)


async def _season_for(db: AsyncSession, gid: uuid.UUID, day: date) -> uuid.UUID | None:
    return await db.scalar(
        select(Season.id)
        .where(
            Season.group_id == gid,
            Season.starts_on <= day,
            or_(Season.ends_on.is_(None), Season.ends_on >= day),
        )
        .order_by(Season.starts_on.desc())
        .limit(1)
    )


async def apply(
    db: AsyncSession, gid: uuid.UUID, user_id: uuid.UUID, parsed: Parsed, source: str
) -> ImportRun:
    """Alles in einer Transaktion; der Aufrufer prüft vorher ``parsed.ok``."""
    rules = await group_repo.get_rules(db, gid)
    known = await _players_by_name(db, gid)
    run = ImportRun(group_id=gid, created_by=user_id, source=source[:200])
    db.add(run)
    await db.flush()
    created: list[uuid.UUID] = []

    async def player(name: str) -> Player:
        p = known.get(name.lower())
        if p is None:
            p = Player(group_id=gid, kind="former", display_name=name)
            db.add(p)
            await db.flush()
            known[name.lower()] = p
            created.append(p.id)
        return p

    for t in sorted(parsed.tournaments, key=lambda t: t.held_on):
        await _import_one(db, gid, run, t, player, list(rules.placement_bonus))
    run.tournaments = len(parsed.tournaments)
    run.created_players = created
    await db.flush()
    return run


async def _import_one(db, gid, run, t: LegacyTournament, player, bonus: list[int]) -> None:
    finished = datetime.combine(t.held_on, time(23, 0), tzinfo=UTC)
    tournament = Tournament(
        group_id=gid,
        season_id=await _season_for(db, gid, t.held_on),
        set_code=t.set_code,
        status="finished",
        imported=True,
        import_run_id=run.id,
        held_on=t.held_on,
        finished_at=finished,
        settings={"import_key": t.key},
    )
    db.add(tournament)
    await db.flush()
    count = len(t.entries)
    ids: dict[str, uuid.UUID] = {}
    for e in t.entries:
        p = await player(e.name)
        ids[e.name.lower()] = p.id
        db.add(
            TournamentEntry(
                tournament_id=tournament.id,
                player_id=p.id,
                status="accepted",
                final_place=e.place,
                ranking_points=ranking_points(count, e.place, bonus),
            )
        )
    await db.flush()
    rounds: dict[int, uuid.UUID] = {}
    for number in sorted({m.round for m in t.matches}):
        r = Round(tournament_id=tournament.id, number=number, status="finished")
        db.add(r)
        await db.flush()
        rounds[number] = r.id
    for m in t.matches:
        db.add(
            Match(
                tournament_id=tournament.id,
                round_id=rounds[m.round],
                player_a_id=ids[m.a.lower()],
                player_b_id=ids[m.b.lower()],
                status="finished",
                tracker_mode="none",
                games_a=m.games_a,
                games_b=m.games_b,
                games_drawn=0,
                finished_at=finished,
            )
        )
    await db.flush()


async def runs(db: AsyncSession, gid: uuid.UUID) -> list[ImportRun]:
    stmt = select(ImportRun).where(ImportRun.group_id == gid).order_by(ImportRun.created_at.desc())
    return list(await db.scalars(stmt))


class NotUndoable(Exception):
    pass


async def undo(db: AsyncSession, gid: uuid.UUID, run_id: uuid.UUID) -> int:
    """Alle Turniere des Laufs löschen, dazu angelegte Ehemalige, die sonst nirgends spielen."""
    run = await db.get(ImportRun, run_id, with_for_update=True)
    if run is None or run.group_id != gid:
        raise NotUndoable("Import nicht gefunden.")
    if run.undone_at is not None:
        raise NotUndoable("Dieser Import ist schon zurückgenommen.")
    removed = await db.execute(delete(Tournament).where(Tournament.import_run_id == run.id))
    if run.created_players:
        used = select(TournamentEntry.player_id).where(
            TournamentEntry.player_id.in_(run.created_players)
        )
        await db.execute(
            delete(Player).where(
                Player.id.in_(run.created_players),
                Player.kind == "former",
                Player.id.notin_(used),
            )
        )
    run.undone_at = now()
    await db.flush()
    return removed.rowcount or 0
