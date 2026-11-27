"""Spieler der Gruppe, Turnier vorbereiten und spielen (UC-03 bis UC-17, ADR-0013, ADR-0015)."""

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, status
from sqlalchemy import func, select

from topstack import live
from topstack.api.deps import CurrentUser, Db
from topstack.api.problems import problem
from topstack.api.schemas import (
    CancelVoteOut,
    ColorsBody,
    ConfirmBody,
    EntryOut,
    EventBatch,
    EventBatchResult,
    EventBody,
    GuestInfo,
    GuestJoin,
    GuestJoined,
    GuestLink,
    InviteBody,
    MatchOut,
    NextOpponentOut,
    PlayerOut,
    RejectedEvent,
    ReservedCreate,
    RespondBody,
    ResultBody,
    RollBody,
    RoundOut,
    SeatBody,
    Seating,
    SeatOut,
    StandingOut,
    TournamentCreate,
    TournamentOut,
    TournamentSummary,
    TrackerMatch,
    TrackerOut,
    TrackerPlayer,
    TrackerStart,
)
from topstack.config import settings
from topstack.db.models import AppUser, Match, Tournament, TournamentEntry
from topstack.domain.tournament import Status, allowed_actions
from topstack.services import invitations, notify, rounds, tracker
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
            tracker_mode=m.tracker_mode,
            game_no=lives[m.id].game_no if m.id in lives else None,
            life_a=lives[m.id].life_a if m.id in lives else None,
            life_b=lives[m.id].life_b if m.id in lives else None,
        )

    vote = await rounds.cancel_vote_state(db, ctx)
    lives = await tracker.live_life(db, [m for m in ov.matches if m.status == "running"])
    nxt = await rounds.next_opponent(db, ctx, ov) if playing else None
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
        next_opponent=NextOpponentOut(**vars(nxt)) if nxt else None,
        finished_at=t.finished_at,
    )


def _me(ctx: svc.Context) -> uuid.UUID | None:
    return ctx.my_player.id if ctx.my_player else None


async def reload(db: Db, tid: uuid.UUID, user: AppUser) -> TournamentOut:
    """Nach jeder Änderung: speichern, Zuschauer per WebSocket benachrichtigen, Stand zurück."""
    await db.commit()
    await live.tournament_changed(tid, "updated")
    return await tournament_out(db, await svc.load(db, tid, user))


# ---------------------------------------------------------------------------
# Spieler der Gruppe
# ---------------------------------------------------------------------------


@router.get("/groups/{gid}/players")
async def list_players(
    gid: uuid.UUID, user: CurrentUser, db: Db, all: bool = False
) -> list[PlayerOut]:
    """Mitglieder und Vorgemerkte; mit ``?all=true`` (Admins) auch Gäste und Ehemalige."""
    async with errors():
        players = await svc.list_players(db, gid, user, everyone=all)
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
        await svc.group_access(db, gid, user)  # prüft Mitgliedschaft, auch für Zuschauer
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
            id=t.id,
            set_code=t.set_code,
            status=t.status,
            held_on=t.held_on,
            players=n,
            finished_at=t.finished_at,
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
        ctx = await svc.load(db, tid, user, lock=True)
        await svc.invite(db, ctx, body.player_ids)
        out = await reload(db, tid, user)
        by = ctx.my_player.display_name if ctx.my_player else user.display_name
        await notify.invited(db, ctx.tournament, body.player_ids, by)
        return out


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
    # Angebot „Profil anlegen“ direkt nach dem Beitritt (UC-05, UC-18)
    claim = await invitations.guest_claim(db, guest)
    await db.commit()
    entry_tournament = await db.scalar(
        select(TournamentEntry.tournament_id).where(TournamentEntry.player_id == guest.id)
    )
    if entry_tournament is not None:
        await live.tournament_changed(entry_tournament, "guest_joined")
    return GuestJoined(
        tournament_id=entry_tournament,
        player_id=guest.id,
        display_name=guest.display_name,
        claim_url=f"{settings.public_origin}/einladung/{claim}",
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
    """Abgebrochene Turniere (Starter oder Admin), abgeschlossene nur durch den Admin."""
    async with errors():
        await svc.delete(db, await svc.load(db, tid, user, lock=True))
    await db.commit()
    await live.tournament_changed(tid, "deleted")


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
        out = await reload(db, tid, user)
        if out.current_round is not None:
            await notify.round_started(db, ctx.tournament, out.current_round, _me(ctx))
        return out


@router.post("/tournaments/{tid}/matches/{mid}/start")
async def pull_forward(tid: uuid.UUID, mid: uuid.UUID, user: CurrentUser, db: Db) -> TournamentOut:
    """Match aus einer späteren Runde vorziehen (UC-09)."""
    async with errors():
        ctx = await svc.load(db, tid, user, lock=True)
        await rounds.pull_forward(db, ctx, mid)
        out = await reload(db, tid, user)
        match = await db.get(Match, mid)
        if match is not None:
            await notify.match_pulled_forward(db, ctx.tournament, match, _me(ctx))
        return out


@router.put("/tournaments/{tid}/matches/{mid}/result")
async def report_result(
    tid: uuid.UUID, mid: uuid.UUID, body: ResultBody, user: CurrentUser, db: Db
) -> TournamentOut:
    """Ergebnis eintragen; mit ``version`` korrigieren bis Turnierende."""
    async with errors():
        ctx = await svc.load(db, tid, user, lock=True)
        before = await db.get(Match, mid)
        correction = before is not None and before.status == "finished"
        match = await rounds.report_result(
            db,
            ctx,
            mid,
            games_a=body.games_a,
            games_b=body.games_b,
            games_drawn=body.games_drawn,
            version=body.version,
        )
        out = await reload(db, tid, user)
        if correction:
            await notify.result_corrected(db, ctx.tournament, match, _me(ctx))
        return out


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
        ctx = await svc.load(db, tid, user, lock=True)
        await rounds.finish(db, ctx)
        out = await reload(db, tid, user)
        await notify.tournament_finished(db, ctx.tournament, _me(ctx))
        return out


@router.post("/tournaments/{tid}/cancel-request")
async def request_cancel(tid: uuid.UUID, user: CurrentUser, db: Db) -> TournamentOut:
    """Abbruch per Abstimmung beantragen (Starter oder Admin, ab Runde 1)."""
    async with errors():
        ctx = await svc.load(db, tid, user, lock=True)
        await rounds.request_cancel(db, ctx)
        out = await reload(db, tid, user)
        await notify.cancel_requested(db, ctx.tournament, _me(ctx))
        return out


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


# ---------------------------------------------------------------------------
# Life-Tracker am Server (UC-10, UC-11, ADR-0012)
# ---------------------------------------------------------------------------


def tracker_match(m: Match) -> TrackerMatch:
    return TrackerMatch(
        id=m.id,
        status=m.status,
        tracker_mode=m.tracker_mode,
        games_a=m.games_a,
        games_b=m.games_b,
        games_drawn=m.games_drawn,
        version=m.version,
    )


async def tracker_out(db: Db, ctx: svc.Context, mid: uuid.UUID) -> TrackerOut:
    st = await tracker.state(db, ctx, mid)
    reasons = {g.id: g.end_reason for g in st.games}
    lob = tracker.lobby(ctx, mid)
    (pa, ea), (pb, eb) = st.players
    return TrackerOut(
        tournament_id=ctx.tournament.id,
        match=tracker_match(st.match),
        player_a=TrackerPlayer(
            id=pa.id, display_name=pa.display_name, colors=ea.colors if ea else None, kind=pa.kind
        ),
        player_b=TrackerPlayer(
            id=pb.id, display_name=pb.display_name, colors=eb.colors if eb else None, kind=pb.kind
        ),
        my_player_id=ctx.my_player.id if ctx.my_player else None,
        starting_life=st.starting_life,
        time_limit_min=st.match.time_limit_min,
        events=[
            EventBody(
                id=e.id,
                game_id=e.game_id,
                type=e.type,
                player_id=e.player_id,
                delta=e.delta,
                value=e.value,
                undo_of=e.undo_of,
                reason=reasons.get(e.game_id) if e.type == "game_end" else None,
                device_id=e.device_id,
                seq=e.seq,
                client_ts=e.client_ts,
                source=e.source,
            )
            for e in st.events
        ],
        seats=[
            SeatOut(player_id=pid, device_id=dev, roll=lob.rolls.get(pid))
            for pid, dev in lob.seats.items()
        ],
        tie=lob.tie,
    )


@router.post("/tournaments/{tid}/matches/{mid}/tracker")
async def start_tracker(
    tid: uuid.UUID, mid: uuid.UUID, body: TrackerStart, user: CurrentUser, db: Db
) -> TrackerOut:
    """Match mit dem Life-Tracker starten, ``shared`` oder ``dual`` (UC-10)."""
    async with errors():
        await tracker.start(db, await svc.load(db, tid, user, lock=True), mid, body.mode)
        await db.commit()
        await live.tournament_changed(tid, "match_started")
        return await tracker_out(db, await svc.load(db, tid, user), mid)


@router.get("/tournaments/{tid}/matches/{mid}/tracker")
async def get_tracker(tid: uuid.UUID, mid: uuid.UUID, user: CurrentUser, db: Db) -> TrackerOut:
    """Match mit allen Ereignissen; zum Koppeln des zweiten Handys und zum Nachladen (UC-11)."""
    async with errors():
        return await tracker_out(db, await svc.load(db, tid, user), mid)


@router.post("/tournaments/{tid}/matches/{mid}/events")
async def push_events(
    tid: uuid.UUID, mid: uuid.UUID, body: EventBatch, user: CurrentUser, db: Db
) -> EventBatchResult:
    """Ereignis-Stapel aus der Outbox, idempotent (ADR-0012)."""
    async with errors():
        ctx = await svc.load(db, tid, user, lock=True)
        m = await db.get(Match, mid)
        old = (m.status, m.games_a, m.games_b, m.games_drawn) if m else None
        res = await tracker.push(
            db,
            ctx,
            mid,
            [tracker.EventIn(**e.model_dump()) for e in body.events],
        )
        await db.commit()
        match = await db.get(Match, mid)
        assert match is not None
        fresh = set(res.accepted)
        await live.game_events(
            tid,
            mid,
            [e.model_dump(mode="json") for e in body.events if e.id in fresh],
        )
        if old != (match.status, match.games_a, match.games_b, match.games_drawn):
            await live.tournament_changed(tid, "match_result")
        return EventBatchResult(
            accepted=res.accepted,
            duplicates=res.duplicates,
            rejected=[RejectedEvent(id=i, detail=d) for i, d in res.rejected],
            match=tracker_match(match),
        )


@router.put("/tournaments/{tid}/matches/{mid}/tracker/seats/{pid}")
async def claim_seat(
    tid: uuid.UUID, mid: uuid.UUID, pid: uuid.UUID, body: SeatBody, user: CurrentUser, db: Db
) -> TrackerOut:
    """Modus „dual“: Dieses Handy zählt für ``pid``; ``409``, wenn schon ein anderes zählt."""
    async with errors():
        ctx = await svc.load(db, tid, user, lock=True)
        await tracker.claim_seat(db, ctx, mid, pid, body.device_id, force=body.force)
        await db.commit()
        await live.tournament_changed(tid, "tracker_seat")
        return await tracker_out(db, await svc.load(db, tid, user), mid)


@router.put("/tournaments/{tid}/matches/{mid}/tracker/seats/{pid}/roll")
async def roll_die(
    tid: uuid.UUID, mid: uuid.UUID, pid: uuid.UUID, body: RollBody, user: CurrentUser, db: Db
) -> TrackerOut:
    """Eigener W20 vor Spiel 1; bei Gleichstand ``tie`` und beide würfeln neu."""
    async with errors():
        ctx = await svc.load(db, tid, user, lock=True)
        await tracker.roll(db, ctx, mid, pid, body.device_id, body.value)
        await db.commit()
        await live.tournament_changed(tid, "tracker_roll")
        return await tracker_out(db, await svc.load(db, tid, user), mid)
