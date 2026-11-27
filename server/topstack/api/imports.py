"""Altdaten importieren (Phase 5, AP-4, UC-19, UC-20, ADR-0019); nur Gruppen-Admins."""

import uuid
from datetime import date

from fastapi import APIRouter, status
from sqlalchemy import select

from topstack.api.deps import CurrentUser, Db
from topstack.api.problems import problem
from topstack.api.schemas import (
    ImportCsv,
    ImportManual,
    ImportPreviewOut,
    ImportProblemOut,
    ImportRunOut,
    ImportTournamentOut,
)
from topstack.db.models import AppUser
from topstack.domain import legacy
from topstack.domain.groups import Permission
from topstack.services import groups as group_svc
from topstack.services import imports

router = APIRouter(tags=["Altdaten"])


async def _admin(db: Db, gid: uuid.UUID, user: AppUser, *, write: bool = True) -> None:
    try:
        (await group_svc.access(db, gid, user)).require(Permission.MANAGE, write=write)
    except group_svc.NotFound:
        raise problem(404, "Gruppe nicht gefunden.") from None
    except group_svc.Forbidden:
        raise problem(403, "Altdaten importieren nur Admins der Gruppe.") from None
    except group_svc.Conflict as exc:
        raise problem(409, str(exc)) from None


async def _run(
    db: Db, gid: uuid.UUID, user: AppUser, parsed: legacy.Parsed, source: str, apply: bool
) -> ImportPreviewOut:
    p = await imports.preview(db, gid, parsed)
    run_id = None
    if apply:
        if not p.ok:
            raise problem(422, "Erst die Fehler in der Vorschau beheben.")
        run = await imports.apply(db, gid, user.id, parsed, source)
        await db.commit()
        run_id = run.id
    return ImportPreviewOut(
        tournaments=[ImportTournamentOut(**vars(t)) for t in p.tournaments],
        new_players=p.new_players,
        known_players=p.known_players,
        problems=[ImportProblemOut(**vars(x)) for x in p.problems],
        warnings=p.warnings,
        applied=run_id is not None,
        run_id=run_id,
    )


@router.post("/groups/{gid}/imports/csv")
async def import_csv(
    gid: uuid.UUID, body: ImportCsv, user: CurrentUser, db: Db
) -> ImportPreviewOut:
    """Ohne ``apply`` nur Vorschau mit Fehlerliste; mit ``apply`` alles in einer Transaktion."""
    await _admin(db, gid, user)
    parsed = legacy.parse(body.tournaments_csv, body.matches_csv, today=date.today())
    return await _run(db, gid, user, parsed, body.source or "CSV", body.apply)


@router.post("/groups/{gid}/imports/manual")
async def import_manual(
    gid: uuid.UUID, body: ImportManual, user: CurrentUser, db: Db
) -> ImportPreviewOut:
    """Ein Turnier von Papier eintragen (UC-19)."""
    await _admin(db, gid, user)
    t = legacy.LegacyTournament(
        key=f"{body.held_on:%d.%m.%Y}",
        held_on=body.held_on,
        set_code=legacy.normalize_set(body.set_code),
        entries=[legacy.LegacyEntry(" ".join(e.name.split()), e.place) for e in body.entries],
        matches=[
            legacy.LegacyMatch(
                m.round, " ".join(m.a.split()), " ".join(m.b.split()), m.games_a, m.games_b
            )
            for m in body.matches
        ],
    )
    parsed = legacy.Parsed([t], legacy.check_tournament(t, "formular", date.today()))
    return await _run(db, gid, user, parsed, "von Hand", body.apply)


@router.get("/groups/{gid}/imports")
async def list_imports(gid: uuid.UUID, user: CurrentUser, db: Db) -> list[ImportRunOut]:
    await _admin(db, gid, user, write=False)
    runs = await imports.runs(db, gid)
    names = dict(
        (
            await db.execute(
                select(AppUser.id, AppUser.display_name).where(
                    AppUser.id.in_([r.created_by for r in runs if r.created_by])
                )
            )
        ).all()
    )
    return [
        ImportRunOut(
            id=r.id,
            created_at=r.created_at,
            created_by=names.get(r.created_by) if r.created_by else None,
            source=r.source,
            tournaments=r.tournaments,
            new_players=len(r.created_players),
            undone_at=r.undone_at,
        )
        for r in runs
    ]


@router.delete("/groups/{gid}/imports/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
async def undo_import(gid: uuid.UUID, run_id: uuid.UUID, user: CurrentUser, db: Db) -> None:
    """Importlauf zurücknehmen: seine Turniere und ungenutzte Ehemalige verschwinden."""
    await _admin(db, gid, user)
    try:
        await imports.undo(db, gid, run_id)
    except imports.NotUndoable as exc:
        raise problem(409, str(exc)) from None
    await db.commit()
