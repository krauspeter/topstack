"""Turnierablauf (UC-08, UC-09, UC-12 bis UC-17): Runden, Ergebnisse, Tabelle, Abschluss.

Ergänzt ``services.tournaments`` (Vorbereitung). Rechte und Status kommen aus
``domain.tournament``; Spielplan, Tabelle, Vorschlag und Ranglistenpunkte aus den
übrigen Domänenmodulen, die seit Phase 1 getestet sind.
"""

import random
import secrets
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from topstack.db.models import (
    Match,
    MatchCorrection,
    Player,
    Round,
    Tournament,
    TournamentCancelVote,
    TournamentEntry,
)
from topstack.domain.ranking import ranking_points
from topstack.domain.schedule import round_robin
from topstack.domain.standings import MatchPoints, MatchResult, StandingRow, compute_standings
from topstack.domain.suggestions import suggest_open_match
from topstack.domain.tournament import (
    Action,
    Actor,
    Status,
    cancel_majority,
    check,
    missing_colors,
    valid_result,
)
from topstack.services.tournaments import (
    FOR_OTHERS_KINDS,
    Conflict,
    Context,
    Forbidden,
    NotFound,
    TournamentRules,
    rules_for,
)


class MissingColors(Exception):
    def __init__(self, names: list[str]) -> None:
        super().__init__(names)
        self.names = names


class OpenMatches(Exception):
    def __init__(self, count: int) -> None:
        super().__init__(count)
        self.count = count


class NeedsRoll(Exception):
    def __init__(self, names: list[str]) -> None:
        super().__init__(names)
        self.names = names


class InvalidResult(Exception):
    pass


def now() -> datetime:
    return datetime.now(UTC)


# ---------------------------------------------------------------------------
# Lesen: Runden, Matches, Tabelle, Vorschlag
# ---------------------------------------------------------------------------


@dataclass
class Overview:
    rounds: list[Round]
    matches: list[Match]
    names: dict[uuid.UUID, str]
    standings: list[StandingRow[uuid.UUID]]
    rolls: dict[uuid.UUID, int]
    current: Round | None
    free: set[uuid.UUID] = field(default_factory=set)
    suggestion: Match | None = None
    open_in_current: int = 0
    planned_left: int = 0


async def _participants(db: AsyncSession, tid: uuid.UUID) -> list[tuple[TournamentEntry, Player]]:
    stmt = (
        select(TournamentEntry, Player)
        .join(Player, Player.id == TournamentEntry.player_id)
        .where(TournamentEntry.tournament_id == tid, TournamentEntry.status == "accepted")
        .order_by(TournamentEntry.seat_no.nulls_last())
    )
    return [(e, p) for e, p in (await db.execute(stmt)).all()]


async def _rules(db: AsyncSession, ctx: Context) -> TournamentRules:
    """Regeln dieses Turniers: Gruppenregeln mit den Abweichungen des Starters (AP-3)."""
    return await rules_for(db, ctx.tournament)


def _rolls(ctx: Context) -> dict[uuid.UUID, int]:
    raw = (ctx.tournament.settings or {}).get("rolls") or {}
    return {uuid.UUID(k): int(v) for k, v in raw.items()}


def standings_for(
    players: list[uuid.UUID],
    matches: list[Match],
    rules: TournamentRules,
    rolls: dict[uuid.UUID, int],
) -> list[StandingRow[uuid.UUID]]:
    results = [
        MatchResult(m.player_a_id, m.player_b_id, m.games_a, m.games_b, m.games_drawn)
        for m in matches
        if m.status == "finished"
    ]
    points = MatchPoints(rules.match_points_win, rules.match_points_draw, rules.match_points_loss)
    return compute_standings(players, results, points, rolls)


async def overview(db: AsyncSession, ctx: Context) -> Overview:
    t = ctx.tournament
    rounds = list(
        await db.scalars(select(Round).where(Round.tournament_id == t.id).order_by(Round.number))
    )
    matches = list(
        await db.scalars(
            select(Match).where(Match.tournament_id == t.id).order_by(Match.round_id, Match.id)
        )
    )
    participants = await _participants(db, t.id)
    names = {p.id: p.display_name for _, p in participants}
    rolls = _rolls(ctx)
    standings = standings_for(list(names), matches, await _rules(db, ctx), rolls)
    if t.imported:
        # Altdaten (AP-4): Die Plätze stehen in den Unterlagen, oft ohne alle Matches
        place = {e.player_id: e.final_place or 99 for e, _ in participants}
        standings.sort(key=lambda r: place[r.player])
        for r in standings:
            r.rank, r.needs_roll, r.tied_with = place[r.player], False, []
    current = next((r for r in reversed(rounds) if r.status == "running"), None)
    ov = Overview(rounds, matches, names, standings, rolls, current)
    if current is None or Status(t.status) not in (Status.RUNNING, Status.PAUSED):
        return ov

    round_of = {r.id: r for r in rounds}
    busy: set[uuid.UUID] = set()
    for m in matches:
        in_current = m.round_id == current.id
        pulled = round_of[m.round_id].status == "planned" and m.status == "running"
        if (in_current and m.status != "finished") or pulled:
            busy.update((m.player_a_id, m.player_b_id))
    ov.open_in_current = sum(
        1 for m in matches if m.round_id == current.id and m.status != "finished"
    )
    ov.free = set(names) - busy
    ov.planned_left = sum(1 for r in rounds if r.status == "planned")

    # Wer am längsten nichts zu tun hat, kommt beim Vorziehen zuerst dran (F-08)
    long_ago = datetime.min.replace(tzinfo=UTC)
    idle_since: dict[uuid.UUID, datetime] = dict.fromkeys(names, long_ago)
    for m in matches:
        if m.status == "finished" and m.finished_at:
            for p in (m.player_a_id, m.player_b_id):
                idle_since[p] = max(idle_since.get(p, long_ago), m.finished_at)
    open_planned = {
        (m.player_a_id, m.player_b_id): m
        for m in matches
        if round_of[m.round_id].status == "planned" and m.status == "scheduled"
    }
    pick = suggest_open_match(ov.free, list(open_planned), idle_since)
    ov.suggestion = open_planned.get(pick) if pick else None
    return ov


# ---------------------------------------------------------------------------
# Runden
# ---------------------------------------------------------------------------


async def start_round_one(db: AsyncSession, ctx: Context, *, confirm: bool) -> None:
    """Erzeugt den kompletten Spielplan jeder gegen jeden und startet Runde 1 (UC-08).

    Fehlen Farben, gibt es ohne ``confirm`` eine Warnung mit den Namen (20.11.2026).
    """
    check(Action.START_ROUND, ctx.status, ctx.actor)
    t = ctx.tournament
    participants = await _participants(db, t.id)
    if len(participants) < 2:
        raise Conflict("Zum Spielen braucht es mindestens 2 Teilnehmer.")
    missing = missing_colors({p.display_name: e.colors for e, p in participants})
    if missing and not confirm:
        raise MissingColors(missing)

    rules = await _rules(db, ctx)
    schedule = round_robin([p.id for _, p in participants], random.Random(secrets.randbits(31)))
    for rnd in schedule.rounds:
        first = rnd.number == 1
        row = Round(
            tournament_id=t.id,
            number=rnd.number,
            status="running" if first else "planned",
            bye_player_id=rnd.bye,
            started_at=now() if first else None,
        )
        db.add(row)
        await db.flush()
        for a, b in rnd.pairings:
            db.add(
                Match(
                    tournament_id=t.id,
                    round_id=row.id,
                    player_a_id=a,
                    player_b_id=b,
                    status="scheduled",
                    tracker_mode="shared",
                    games_a=0,
                    games_b=0,
                    games_drawn=0,
                    version=0,
                    time_limit_min=rules.match_time_limit_min,
                )
            )
    t.status = Status.RUNNING
    await db.flush()


async def next_round(db: AsyncSession, ctx: Context, *, confirm: bool) -> None:
    """Nächste Runde, auch mit offenen Matches nach Bestätigung (UC-15)."""
    check(Action.NEXT_ROUND, ctx.status, ctx.actor)
    ov = await overview(db, ctx)
    nxt = next((r for r in ov.rounds if r.status == "planned"), None)
    if nxt is None:
        raise Conflict(
            "Alle Runden sind gestartet. Nach dem letzten Match das Turnier abschließen."
        )
    if ov.open_in_current and not confirm:
        raise OpenMatches(ov.open_in_current)
    if ov.current is not None:
        ov.current.status = "finished"
    nxt.status = "running"
    nxt.started_at = now()
    await db.flush()


async def pause(db: AsyncSession, ctx: Context) -> None:
    check(Action.PAUSE, ctx.status, ctx.actor)
    ctx.tournament.status = Status.PAUSED
    await db.flush()


async def resume(db: AsyncSession, ctx: Context) -> None:
    check(Action.RESUME, ctx.status, ctx.actor)
    ctx.tournament.status = Status.RUNNING
    await db.flush()


# ---------------------------------------------------------------------------
# Matches
# ---------------------------------------------------------------------------


async def _match(db: AsyncSession, ctx: Context, match_id: uuid.UUID) -> tuple[Match, Round]:
    match = await db.get(Match, match_id, with_for_update=True, populate_existing=True)
    if match is None or match.tournament_id != ctx.tournament.id:
        raise NotFound
    rnd = await db.get(Round, match.round_id)
    assert rnd is not None
    return match, rnd


def _may_report(ctx: Context, match: Match) -> bool:
    mine = ctx.my_player is not None and ctx.my_player.id in (match.player_a_id, match.player_b_id)
    return mine or ctx.actor.is_starter or ctx.actor.is_admin


async def pull_forward(db: AsyncSession, ctx: Context, match_id: uuid.UUID) -> None:
    """Offenes Match aus einer späteren Runde vorziehen, wenn beide frei sind (UC-09)."""
    check(Action.REPORT_RESULT, ctx.status, ctx.actor)
    match, rnd = await _match(db, ctx, match_id)
    if not _may_report(ctx, match):
        raise Forbidden
    if rnd.status != "planned" or match.status != "scheduled":
        raise Conflict("Dieses Match läuft schon oder ist gespielt.")
    ov = await overview(db, ctx)
    if not {match.player_a_id, match.player_b_id} <= ov.free:
        raise Conflict("Beide Spieler müssen gerade frei sein.")
    match.status = "running"
    match.started_at = now()
    await db.flush()


async def report_result(
    db: AsyncSession,
    ctx: Context,
    match_id: uuid.UUID,
    *,
    games_a: int,
    games_b: int,
    games_drawn: int,
    version: int | None,
) -> Match:
    """Ergebnis eintragen oder bis Turnierende korrigieren (UC-12 bis UC-14).

    Korrekturen brauchen die zuletzt gesehene ``version`` (optimistische Sperre, ADR-0013)
    und landen im Protokoll ``match_correction``.
    """
    check(Action.REPORT_RESULT, ctx.status, ctx.actor)
    match, rnd = await _match(db, ctx, match_id)
    if not _may_report(ctx, match):
        raise Forbidden
    if rnd.status == "planned" and match.status == "scheduled":
        raise Conflict("Dieses Match ist erst in einer späteren Runde. Erst vorziehen.")
    if not valid_result(games_a, games_b, games_drawn, (await _rules(db, ctx)).games_to_win):
        raise InvalidResult
    if version is not None and version != match.version:
        raise Conflict("Das Ergebnis wurde inzwischen geändert. Bitte neu laden.")
    if match.status == "finished":
        if version is None:
            raise Conflict("Für eine Korrektur fehlt die Version des Ergebnisses.")
        db.add(
            MatchCorrection(
                match_id=match.id,
                changed_by=ctx.my_player.id if ctx.my_player else None,
                old_result={"a": match.games_a, "b": match.games_b, "drawn": match.games_drawn},
                new_result={"a": games_a, "b": games_b, "drawn": games_drawn},
            )
        )
        # Nachricht an den Gegner folgt mit Push in AP-8
    match.games_a, match.games_b, match.games_drawn = games_a, games_b, games_drawn
    match.status = "finished"
    match.finished_at = match.finished_at or now()
    match.result_by = ctx.my_player.id if ctx.my_player else None
    match.version += 1
    await db.flush()
    return match


# ---------------------------------------------------------------------------
# Tiebreak-Wurf und Abschluss (UC-17)
# ---------------------------------------------------------------------------


async def roll_tiebreak(db: AsyncSession, ctx: Context) -> list[uuid.UUID]:
    """W20 für alle, die nach allen Tiebreakern gleich stehen; Gleichstand wird neu gewürfelt."""
    check(Action.REPORT_RESULT, ctx.status, ctx.actor)
    ov = await overview(db, ctx)
    rolls = dict(ov.rolls)
    blocks: dict[int, list[uuid.UUID]] = {}
    for row in ov.standings:
        if row.needs_roll:
            blocks.setdefault(row.rank, []).append(row.player)
    rolled: list[uuid.UUID] = []
    for block in blocks.values():
        while True:
            values = {p: secrets.randbelow(20) + 1 for p in block}
            if len(set(values.values())) == len(block):
                break
        rolls.update(values)
        rolled.extend(block)
    t = ctx.tournament
    t.settings = {**(t.settings or {}), "rolls": {str(k): v for k, v in rolls.items()}}
    await db.flush()
    return rolled


async def finish(db: AsyncSession, ctx: Context) -> None:
    """Abschluss, wenn alle Matches gespielt sind: Endplätze und Ranglistenpunkte festschreiben."""
    check(Action.FINISH, ctx.status, ctx.actor)
    ov = await overview(db, ctx)
    if not ov.matches:
        raise Conflict("Es gibt noch keinen Spielplan.")
    open_matches = sum(1 for m in ov.matches if m.status != "finished")
    if open_matches:
        raise OpenMatches(open_matches)
    tied = [ov.names[r.player] for r in ov.standings if r.needs_roll]
    if tied:
        raise NeedsRoll(sorted(tied))
    rules = await _rules(db, ctx)
    count = len(ov.standings)
    for row in ov.standings:
        entry = await db.get(TournamentEntry, (ctx.tournament.id, row.player))
        assert entry is not None
        entry.final_place = row.rank
        entry.ranking_points = ranking_points(count, row.rank, rules.placement_bonus)
    for rnd in ov.rounds:
        rnd.status = "finished"
    await _clear_request(db, ctx)  # ein offener Abbruchantrag endet mit dem Turnier
    ctx.tournament.status = Status.FINISHED
    ctx.tournament.finished_at = now()
    await db.flush()


# ---------------------------------------------------------------------------
# Abbruch per Abstimmung (ADR-0013)
# ---------------------------------------------------------------------------


@dataclass
class CancelVote:
    requested_by: str
    confirmed: int
    required: int
    participants: int
    i_voted: bool
    voters: list[uuid.UUID]


async def cancel_vote_state(db: AsyncSession, ctx: Context) -> CancelVote | None:
    t = ctx.tournament
    if t.cancel_requested_by is None:
        return None
    requester = await db.get(Player, t.cancel_requested_by)
    participants = len(await _participants(db, t.id))
    votes = list(
        await db.scalars(
            select(TournamentCancelVote.player_id).where(TournamentCancelVote.tournament_id == t.id)
        )
    )
    me = ctx.my_player.id if ctx.my_player else None
    return CancelVote(
        requested_by=requester.display_name if requester else "",
        confirmed=len(votes),
        required=participants // 2 + 1,
        participants=participants,
        i_voted=me in votes,
        voters=votes,
    )


async def _evaluate_vote(db: AsyncSession, ctx: Context) -> None:
    t = ctx.tournament
    participants = len(await _participants(db, t.id))
    confirmed = await db.scalar(
        select(func.count())
        .select_from(TournamentCancelVote)
        .where(TournamentCancelVote.tournament_id == t.id)
    )
    if cancel_majority(confirmed or 0, participants):
        await _clear_request(db, ctx)
        t.status = Status.CANCELLED
    await db.flush()


async def _clear_request(db: AsyncSession, ctx: Context) -> None:
    t = ctx.tournament
    await db.execute(delete(TournamentCancelVote).where(TournamentCancelVote.tournament_id == t.id))
    t.cancel_requested_by = None
    t.cancel_requested_at = None


async def request_cancel(db: AsyncSession, ctx: Context) -> None:
    check(Action.REQUEST_CANCEL, ctx.status, ctx.actor)
    t = ctx.tournament
    if t.cancel_requested_by is not None:
        raise Conflict("Es läuft schon eine Abstimmung zum Abbruch.")
    if ctx.my_player is None:
        raise Forbidden
    t.cancel_requested_by = ctx.my_player.id
    t.cancel_requested_at = now()
    await db.flush()
    if ctx.actor.is_participant:  # wer beantragt, hat damit schon bestätigt
        db.add(TournamentCancelVote(tournament_id=t.id, player_id=ctx.my_player.id))
    await _evaluate_vote(db, ctx)


async def withdraw_cancel(db: AsyncSession, ctx: Context) -> None:
    t = ctx.tournament
    if t.cancel_requested_by is None:
        raise NotFound
    mine = ctx.my_player is not None and ctx.my_player.id == t.cancel_requested_by
    if not (mine or ctx.actor.is_admin):
        raise Forbidden
    await _clear_request(db, ctx)
    await db.flush()


async def vote_cancel(
    db: AsyncSession, ctx: Context, *, yes: bool, player_id: uuid.UUID | None = None
) -> None:
    """Abbruch bestätigen oder zurücknehmen.

    Jeder für sich; für Gäste und Spieler ohne Konto auch Starter oder Admin,
    wie beim Melden der Farben (Entscheidung vom 20.11.2026).
    """
    t = ctx.tournament
    me = ctx.my_player.id if ctx.my_player else None
    voter = player_id or me
    if voter is None:
        raise Forbidden
    if voter == me:
        check(Action.VOTE_CANCEL, ctx.status, ctx.actor)
    else:
        entry = await db.get(TournamentEntry, (t.id, voter))
        if entry is None or entry.status != "accepted":
            raise NotFound
        target = await db.get(Player, voter)
        helper = ctx.actor.is_starter or ctx.actor.is_admin
        if target is None or target.kind not in FOR_OTHERS_KINDS or not helper:
            raise Forbidden
        check(Action.VOTE_CANCEL, ctx.status, Actor(is_participant=True))
    if t.cancel_requested_by is None:
        raise NotFound
    existing = await db.get(TournamentCancelVote, (t.id, voter))
    if yes and existing is None:
        db.add(TournamentCancelVote(tournament_id=t.id, player_id=voter))
    elif not yes and existing is not None:
        await db.delete(existing)
    await db.flush()
    await _evaluate_vote(db, ctx)


# ---------------------------------------------------------------------------
# Pause-Ansicht (AP-7)
# ---------------------------------------------------------------------------


@dataclass
class NextOpponent:
    player_id: uuid.UUID
    display_name: str
    round: int
    wins: int
    draws: int
    losses: int


async def next_opponent(db: AsyncSession, ctx: Context, ov: Overview) -> NextOpponent | None:
    """Wer gerade frei ist: nächster Gegner und die Bilanz gegen ihn in der Gruppe."""
    me = ctx.my_player.id if ctx.my_player else None
    if me is None or me not in ov.free:
        return None
    number = {r.id: r.number for r in ov.rounds}
    upcoming = sorted(
        (m for m in ov.matches if m.status == "scheduled" and me in (m.player_a_id, m.player_b_id)),
        key=lambda m: number[m.round_id],
    )
    if not upcoming:
        return None
    nxt = upcoming[0]
    other = nxt.player_b_id if nxt.player_a_id == me else nxt.player_a_id
    played = await db.scalars(
        select(Match)
        .join(Tournament, Tournament.id == Match.tournament_id)
        .where(
            Tournament.group_id == ctx.tournament.group_id,
            Tournament.status != Status.CANCELLED,
            Match.status == "finished",
            ((Match.player_a_id == me) & (Match.player_b_id == other))
            | ((Match.player_a_id == other) & (Match.player_b_id == me)),
        )
    )
    wins = draws = losses = 0
    for m in played:
        mine, theirs = (m.games_a, m.games_b) if m.player_a_id == me else (m.games_b, m.games_a)
        if mine > theirs:
            wins += 1
        elif mine < theirs:
            losses += 1
        else:
            draws += 1
    return NextOpponent(other, ov.names.get(other, "?"), number[nxt.round_id], wins, draws, losses)
