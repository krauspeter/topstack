"""Spieler der Gruppe, Turnier vorbereiten und spielen (UC-03 bis UC-17, ADR-0013, ADR-0015)."""

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, status
from sqlalchemy import func, select

from topstack.api.deps import CurrentUser, Db
from topstack.api.problems import problem
from topstack.api.schemas import (
    CancelVoteOut,
    ColorsBody,
    ConfirmBody,
    EntryOut,
    GuestInfo,
    GuestJoin,
    GuestJoined,
    GuestLink,
    InviteBody,
    MatchOut,
    PlayerOut,
    ReservedCreate,
    RespondBody,
    ResultBody,
    RoundOut,
    Seating,
    StandingOut,
    TournamentCreate,
    TournamentOut,
    TournamentSummary,
)
from topstack.config import settings
from topstack.db.models import AppUser, Match, Tournament, TournamentEntry
from topstack.domain.tournament import Status, allowed_actions
from topstack.services import rounds
from topstack.services import tournaments as svc

router = APIRouter(tags=["Turniere"])


@asynccontextmanager
async def errors() -> AsyncIterator[None]:
    """Fehler der Dienste als Problem Details."""
    try:
        yield
    except svc.NotFound:
        raise problem(404, "Nicht gefunden.") from None
    except svc.Forbidden:
        raise problem(403, "Dafür fehlt dir die Berechtigung.") from None
    except svc.WrongStatus as exc:
        raise problem(409, str(exc) or "Das geht im aktuellen Zustand nicht.") from None
    except svc.Conflict as exc:
        raise problem(409, str(exc)) from None
    except rounds.MissingColors as exc:
        raise problem(
            409,
            "Noch nicht alle haben ihre Farben eingetragen: " + ", ".join(exc.names),
            code="missing_colors",
            names=exc.names,
        ) from None
    except rounds.OpenMatches as exc:
        raise problem(
            409,
            f"Es sind noch {exc.count} Matches offen.",
            code="open_matches",
            count=exc.count,
        ) from None
    except rounds.NeedsRoll as exc:
        raise problem(
            409,
            "Gleichstand nach allen Tiebreakern: " + ", ".join(exc.names) + ". Bitte W20 würfeln.",
            code="needs_roll",
            names=exc.names,
        ) from None
    except rounds.InvalidResult:
        raise problem(422, "Ungültiges Ergebnis für ein Best-of-3.") from None


async def tournament_out(db: Db, ctx: svc.Context) -> TournamentOut:
    t = ctx.tournament
    me = ctx.my_player.id if ctx.my_player else None
    seating = (t.settings or {}).get("seating")
    entries = await svc.entries_with_players(db, t.id)
    ov = await rounds.overview(db, ctx)
    final = {e.player_id: e for e, _ in entries}
    may_report_all = ctx.actor.is_starter or ctx.actor.is_admin
    playing = ctx.status in (Status.RUNNING, Status.PAUSED)

    def match_out(m: Match) -> MatchOut:
        mine = me in (m.player_a_id, m.player_b_id)
        return MatchOut(
            id=m.id,
            player_a_id=m.player_a_id,
            player_b_id=m.player_b_id,
            player_a=ov.names.get(m.player_a_id, "?"),
            player_b=ov.names.get(m.player_b_id, "?"),
            status=m.status,
            games_a=m.games_a,
            games_b=m.games_b,
            games_drawn=m.games_drawn,
            version=m.version,
            mine=mine,
            can_report=playing and (mine or may_report_all),
        )

    vote = await rounds.cancel_vote_state(db, ctx)
    return TournamentOut(
        id=t.id,
        group_id=t.group_id,
        group_name=await svc.group_name(db, t.group_id),
        set_code=t.set_code,
        status=t.status,
        held_on=t.held_on,
        location=t.location,
        started_by=t.started_by,
        seating=Seating(**seating) if seating else None,
        entries=[
            EntryOut(
                player_id=p.id,
                display_name=p.display_name,
                kind=p.kind,
                status=e.status,
                seat_no=e.seat_no,
                colors=e.colors,
                is_me=p.id == me,
            )
            for e, p in entries
        ],
        my_player_id=me,
        actions=[str(a) for a in allowed_actions(ctx.status, ctx.actor)],
        rounds=[
            RoundOut(
                number=r.number,
                status=r.status,
                bye=ov.names.get(r.bye_player_id) if r.bye_player_id else None,
                matches=[match_out(m) for m in ov.matches if m.round_id == r.id],
            )
            for r in ov.rounds
        ],
        current_round=ov.current.number if ov.current else None,
        open_in_current=ov.open_in_current,
        rounds_left=ov.planned_left,
        standings=[
            StandingOut(
                player_id=row.player,
                display_name=ov.names.get(row.player, "?"),
                rank=row.rank,
                played=row.played,
                wins=row.wins,
                draws=row.draws,
                losses=row.losses,
                match_points=row.match_points,
                games_won=row.games_won,
                games_lost=row.games_lost,
                game_diff=row.game_diff,
                needs_roll=row.needs_roll,
                roll=ov.rolls.get(row.player),
                final_place=final[row.player].final_place if row.player in final else None,
                ranking_points=final[row.player].ranking_points if row.player in final else None,
            )
            for row in ov.standings
        ]
        if ov.rounds
        else [],
        suggestion=ov.suggestion.id if ov.suggestion else None,
        cancel_vote=CancelVoteOut(**vars(vote)) if vote else None,
    )


async def reload(db: Db, tid: uuid.UUID, user: AppUser) -> TournamentOut:
    await db.commit()
    return await tournament_out(db, await svc.load(db, tid, user))


# ---------------------------------------------------------------------------
# Spieler der Gruppe
# ---------------------------------------------------------------------------


@router.get("/groups/{gid}/players")
async def list_players(gid: uuid.UUID, user: CurrentUser, db: Db) -> list[PlayerOut]:
    async with errors():
        players = await svc.list_players(db, gid, user)
    return [
        PlayerOut(id=p.id, display_name=p.display_name, kind=p.kind, is_me=p.app_user_id == user.id)
        for p in players
    ]


@router.post("/groups/{gid}/players", status_code=status.HTTP_201_CREATED)
async def create_reserved(
    gid: uuid.UUID, body: ReservedCreate, user: CurrentUser, db: Db
) -> PlayerOut:
    """Vorgemerkten Spieler ohne Konto anlegen (ADR-0015), nur Gruppen-Admin."""
    async with errors():
        player = await svc.create_reserved(db, gid, user, body.display_name)
    await db.commit()
    return PlayerOut(id=player.id, display_name=player.display_name, kind=player.kind, is_me=False)


# ---------------------------------------------------------------------------
# Turnier starten und anzeigen
# ---------------------------------------------------------------------------


@router.post("/groups/{gid}/tournaments", status_code=status.HTTP_201_CREATED)
async def start_tournament(
    gid: uuid.UUID, body: TournamentCreate, user: CurrentUser, db: Db
) -> TournamentOut:
    async with errors():
        t = await svc.start(db, gid, user, set_code=body.set_code, location=body.location)
        return await reload(db, t.id, user)


@router.get("/groups/{gid}/tournaments")
async def list_tournaments(gid: uuid.UUID, user: CurrentUser, db: Db) -> list[TournamentSummary]:
    """Neueste zuerst, höchstens 20; das offene Turnier steht immer oben."""
    async with errors():
        await svc.list_players(db, gid, user)  # prüft Mitgliedschaft
    players = (
        select(func.count())
        .select_from(TournamentEntry)
        .where(TournamentEntry.tournament_id == Tournament.id, TournamentEntry.status == "accepted")
        .scalar_subquery()
    )
    rows = await db.execute(
        select(Tournament, players)
        .where(Tournament.group_id == gid)
        .order_by(
            Tournament.status.in_(("finished", "cancelled")),
            Tournament.held_on.desc(),
            Tournament.created_at.desc(),
        )
        .limit(20)
    )
    return [
        TournamentSummary(
            id=t.id, set_code=t.set_code, status=t.status, held_on=t.held_on, players=n
        )
        for t, n in rows.all()
    ]


@router.get("/tournaments/{tid}")
async def get_tournament(tid: uuid.UUID, user: CurrentUser, db: Db) -> TournamentOut:
    async with errors():
        return await tournament_out(db, await svc.load(db, tid, user))


# ---------------------------------------------------------------------------
# Teilnehmer (UC-04)
# ---------------------------------------------------------------------------


@router.post("/tournaments/{tid}/entries")
async def invite(tid: uuid.UUID, body: InviteBody, user: CurrentUser, db: Db) -> TournamentOut:
    async with errors():
        await svc.invite(db, await svc.load(db, tid, user, lock=True), body.player_ids)
        return await reload(db, tid, user)


@router.put("/tournaments/{tid}/entries/me")
async def respond(tid: uuid.UUID, body: RespondBody, user: CurrentUser, db: Db) -> TournamentOut:
    async with errors():
        await svc.respond(db, await svc.load(db, tid, user, lock=True), body.accept)
        return await reload(db, tid, user)


@router.delete("/tournaments/{tid}/entries/{pid}")
async def remove(tid: uuid.UUID, pid: uuid.UUID, user: CurrentUser, db: Db) -> TournamentOut:
    async with errors():
        await svc.remove(db, await svc.load(db, tid, user, lock=True), pid)
        return await reload(db, tid, user)


# ---------------------------------------------------------------------------
# Gäste (UC-05)
# ---------------------------------------------------------------------------


@router.post("/tournaments/{tid}/guest-link", status_code=status.HTTP_201_CREATED)
async def guest_link(tid: uuid.UUID, user: CurrentUser, db: Db) -> GuestLink:
    async with errors():
        token, invitation = await svc.create_guest_link(db, await svc.load(db, tid, user), user)
    await db.commit()
    return GuestLink(
        token=token, url=f"{settings.public_origin}/gast/{token}", expires_at=invitation.expires_at
    )


@router.get("/guest/{token}")
async def guest_info(token: str, db: Db) -> GuestInfo:
    """Öffentlich: was der Gast nach dem Scannen sieht."""
    async with errors():
        _, t = await svc.guest_invitation(db, token)
    return GuestInfo(
        group_name=await svc.group_name(db, t.group_id),
        set_code=t.set_code,
        open=t.status == "setup",
    )


@router.post("/guest/{token}", status_code=status.HTTP_201_CREATED)
async def guest_join(token: str, body: GuestJoin, db: Db) -> GuestJoined:
    async with errors():
        guest = await svc.join_as_guest(db, token, body.display_name)
    await db.commit()
    entry_tournament = await db.scalar(
        select(TournamentEntry.tournament_id).where(TournamentEntry.player_id == guest.id)
    )
    return GuestJoined(
        tournament_id=entry_tournament, player_id=guest.id, display_name=guest.display_name
    )


# ---------------------------------------------------------------------------
# Auslosung, Draft, Farben, Abbruch (UC-06, UC-07)
# ---------------------------------------------------------------------------


@router.post("/tournaments/{tid}/seating")
async def seat(tid: uuid.UUID, user: CurrentUser, db: Db) -> TournamentOut:
    """Plätze auslosen; erneut aufrufen = neu auslosen (bis der Draft beginnt)."""
    async with errors():
        await svc.seat(db, await svc.load(db, tid, user, lock=True))
        return await reload(db, tid, user)


@router.post("/tournaments/{tid}/draft")
async def start_draft(tid: uuid.UUID, user: CurrentUser, db: Db) -> TournamentOut:
    async with errors():
        await svc.start_draft(db, await svc.load(db, tid, user, lock=True))
        return await reload(db, tid, user)


@router.put("/tournaments/{tid}/entries/{pid}/colors")
async def report_colors(
    tid: uuid.UUID, pid: uuid.UUID, body: ColorsBody, user: CurrentUser, db: Db
) -> TournamentOut:
    async with errors():
        await svc.report_colors(db, await svc.load(db, tid, user, lock=True), pid, body.colors)
        return await reload(db, tid, user)


@router.delete("/tournaments/{tid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tournament(tid: uuid.UUID, user: CurrentUser, db: Db) -> None:
    """Nur abgebrochene Turniere, durch Turnierstarter oder Gruppen-Admin."""
    async with errors():
        await svc.delete(db, await svc.load(db, tid, user, lock=True))
    await db.commit()


@router.post("/tournaments/{tid}/cancel")
async def cancel(tid: uuid.UUID, user: CurrentUser, db: Db) -> TournamentOut:
    async with errors():
        await svc.cancel(db, await svc.load(db, tid, user, lock=True))
        return await reload(db, tid, user)


# ---------------------------------------------------------------------------
# Turnier spielen (UC-08, UC-09, UC-12 bis UC-17)
# ---------------------------------------------------------------------------


@router.post("/tournaments/{tid}/rounds/next")
async def start_round(
    tid: uuid.UUID, body: ConfirmBody, user: CurrentUser, db: Db
) -> TournamentOut:
    """Runde 1 (erzeugt den Spielplan) oder die nächste Runde starten.

    Ohne ``confirm`` gibt es 409 mit ``code`` ``missing_colors`` oder ``open_matches``.
    """
    async with errors():
        ctx = await svc.load(db, tid, user, lock=True)
        if ctx.status is Status.DRAFTING:
            await rounds.start_round_one(db, ctx, confirm=body.confirm)
        else:
            await rounds.next_round(db, ctx, confirm=body.confirm)
        return await reload(db, tid, user)


@router.post("/tournaments/{tid}/matches/{mid}/start")
async def pull_forward(tid: uuid.UUID, mid: uuid.UUID, user: CurrentUser, db: Db) -> TournamentOut:
    """Match aus einer späteren Runde vorziehen (UC-09)."""
    async with errors():
        await rounds.pull_forward(db, await svc.load(db, tid, user, lock=True), mid)
        return await reload(db, tid, user)


@router.put("/tournaments/{tid}/matches/{mid}/result")
async def report_result(
    tid: uuid.UUID, mid: uuid.UUID, body: ResultBody, user: CurrentUser, db: Db
) -> TournamentOut:
    """Ergebnis eintragen; mit ``version`` korrigieren bis Turnierende."""
    async with errors():
        await rounds.report_result(
            db,
            await svc.load(db, tid, user, lock=True),
            mid,
            games_a=body.games_a,
            games_b=body.games_b,
            games_drawn=body.games_drawn,
            version=body.version,
        )
        return await reload(db, tid, user)


@router.post("/tournaments/{tid}/pause")
async def pause(tid: uuid.UUID, user: CurrentUser, db: Db) -> TournamentOut:
    async with errors():
        await rounds.pause(db, await svc.load(db, tid, user, lock=True))
        return await reload(db, tid, user)


@router.post("/tournaments/{tid}/resume")
async def resume(tid: uuid.UUID, user: CurrentUser, db: Db) -> TournamentOut:
    async with errors():
        await rounds.resume(db, await svc.load(db, tid, user, lock=True))
        return await reload(db, tid, user)


@router.post("/tournaments/{tid}/tiebreak-roll")
async def tiebreak(tid: uuid.UUID, user: CurrentUser, db: Db) -> TournamentOut:
    """W20 für alle, die nach allen Tiebreakern gleich stehen."""
    async with errors():
        await rounds.roll_tiebreak(db, await svc.load(db, tid, user, lock=True))
        return await reload(db, tid, user)


@router.post("/tournaments/{tid}/finish")
async def finish(tid: uuid.UUID, user: CurrentUser, db: Db) -> TournamentOut:
    """Abschluss: Endplätze und Ranglistenpunkte festschreiben (UC-17)."""
    async with errors():
        await rounds.finish(db, await svc.load(db, tid, user, lock=True))
        return await reload(db, tid, user)


@router.post("/tournaments/{tid}/cancel-request")
async def request_cancel(tid: uuid.UUID, user: CurrentUser, db: Db) -> TournamentOut:
    """Abbruch per Abstimmung beantragen (Starter oder Admin, ab Runde 1)."""
    async with errors():
        await rounds.request_cancel(db, await svc.load(db, tid, user, lock=True))
        return await reload(db, tid, user)


@router.put("/tournaments/{tid}/cancel-request/vote")
async def vote_cancel(tid: uuid.UUID, user: CurrentUser, db: Db) -> TournamentOut:
    """Abbruch bestätigen; bei mehr als der Hälfte der Teilnehmer ist das Turnier abgebrochen."""
    async with errors():
        await rounds.vote_cancel(db, await svc.load(db, tid, user, lock=True), yes=True)
        return await reload(db, tid, user)


@router.delete("/tournaments/{tid}/cancel-request/vote")
async def unvote_cancel(tid: uuid.UUID, user: CurrentUser, db: Db) -> TournamentOut:
    async with errors():
        await rounds.vote_cancel(db, await svc.load(db, tid, user, lock=True), yes=False)
        return await reload(db, tid, user)


@router.delete("/tournaments/{tid}/cancel-request")
async def withdraw_cancel(tid: uuid.UUID, user: CurrentUser, db: Db) -> TournamentOut:
    async with errors():
        await rounds.withdraw_cancel(db, await svc.load(db, tid, user, lock=True))
        return await reload(db, tid, user)


@router.put("/tournaments/{tid}/cancel-request/votes/{pid}")
async def vote_cancel_for(
    tid: uuid.UUID, pid: uuid.UUID, user: CurrentUser, db: Db
) -> TournamentOut:
    """Starter oder Admin bestätigen für Gäste und Spieler ohne Konto."""
    async with errors():
        ctx = await svc.load(db, tid, user, lock=True)
        await rounds.vote_cancel(db, ctx, yes=True, player_id=pid)
        return await reload(db, tid, user)


@router.delete("/tournaments/{tid}/cancel-request/votes/{pid}")
async def unvote_cancel_for(
    tid: uuid.UUID, pid: uuid.UUID, user: CurrentUser, db: Db
) -> TournamentOut:
    async with errors():
        ctx = await svc.load(db, tid, user, lock=True)
        await rounds.vote_cancel(db, ctx, yes=False, player_id=pid)
        return await reload(db, tid, user)
