"""Life-Tracker am Server (UC-10, UC-11, N-01, ADR-0005, ADR-0012).

Die App zählt immer lokal und schickt ihre Ereignisse über eine Outbox als Stapel.
Der Server speichert sie idempotent, legt Spiele beim ``game_start`` an, beendet sie
beim ``game_end`` und rechnet daraus das Matchergebnis (F-11).
"""

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from topstack.db.models import Game, GameEvent, Match, Player, Round, TournamentEntry
from topstack.domain import life
from topstack.domain.tournament import Action, check
from topstack.services.rounds import _match, _may_report
from topstack.services.tournaments import Conflict, Context, Forbidden, rules_for

MODES = ("shared", "dual")
END_REASONS = ("life_zero", "concede", "time", "manual")


@dataclass
class EventIn:
    id: uuid.UUID
    game_id: uuid.UUID
    type: str
    device_id: str
    seq: int
    client_ts: datetime
    player_id: uuid.UUID | None = None
    delta: int | None = None
    value: int | None = None
    undo_of: uuid.UUID | None = None
    reason: str | None = None
    source: str = "app"


@dataclass
class PushResult:
    accepted: list[uuid.UUID] = field(default_factory=list)
    duplicates: list[uuid.UUID] = field(default_factory=list)
    rejected: list[tuple[uuid.UUID, str]] = field(default_factory=list)


@dataclass
class TrackerState:
    match: Match
    players: list[tuple[Player, TournamentEntry | None]]
    starting_life: int
    games: list[Game]
    events: list[GameEvent]
    games_to_win: int = 2  # Best-of-3, im Turnier abweichend einstellbar (AP-3)


class Rejected(Exception):
    """Ein einzelnes Ereignis wird abgelehnt; der Rest des Stapels läuft weiter."""


class UnknownGame(Rejected):
    """Spiel fehlt noch, z. B. W20-Wurf vor dem ``game_start`` mit gleicher Uhrzeit."""


async def _playable(db: AsyncSession, ctx: Context, match_id: uuid.UUID) -> tuple[Match, Round]:
    check(Action.REPORT_RESULT, ctx.status, ctx.actor)
    match, rnd = await _match(db, ctx, match_id)
    if not _may_report(ctx, match):
        raise Forbidden
    return match, rnd


async def start(db: AsyncSession, ctx: Context, match_id: uuid.UUID, mode: str) -> Match:
    """Match mit dem Life-Tracker starten: ein gemeinsames Handy oder jeder sein eigenes (UC-10).

    Idempotent; der Modus lässt sich ändern, solange noch kein Spiel begonnen hat.
    """
    match, rnd = await _playable(db, ctx, match_id)
    if mode not in MODES:
        raise Conflict("Unbekannter Modus.")
    if match.status == "finished":
        raise Conflict("Dieses Match ist schon gespielt.")
    if rnd.status == "planned" and match.status == "scheduled":
        raise Conflict("Dieses Match ist erst in einer späteren Runde. Erst vorziehen.")
    if match.tracker_mode != mode:
        has_games = await db.scalar(select(Game.id).where(Game.match_id == match.id).limit(1))
        if has_games is not None and match.status == "running":
            raise Conflict("Das Match läuft schon in einem anderen Modus.")
        match.tracker_mode = mode
    if match.status != "running":
        match.status = "running"
        match.started_at = datetime.now(UTC)
    await db.flush()
    return match


async def state(db: AsyncSession, ctx: Context, match_id: uuid.UUID) -> TrackerState:
    match, _ = await _match(db, ctx, match_id)
    players = []
    for pid in (match.player_a_id, match.player_b_id):
        player = await db.get(Player, pid)
        assert player is not None
        players.append((player, await db.get(TournamentEntry, (ctx.tournament.id, pid))))
    rules = await rules_for(db, ctx.tournament)
    games = list(
        await db.scalars(select(Game).where(Game.match_id == match.id).order_by(Game.number))
    )
    events = list(
        await db.scalars(
            select(GameEvent)
            .join(Game, Game.id == GameEvent.game_id)
            .where(Game.match_id == match.id)
            .order_by(GameEvent.client_ts, GameEvent.device_id, GameEvent.seq)
        )
    )
    return TrackerState(match, players, rules.starting_life, games, events, rules.games_to_win)


async def push(
    db: AsyncSession, ctx: Context, match_id: uuid.UUID, events: list[EventIn]
) -> PushResult:
    """Ereignis-Stapel aus der Outbox speichern (ADR-0012).

    Bekannte IDs sind ``duplicates``, widersprüchliche Ereignisse ``rejected`` mit Grund;
    die App nimmt abgelehnte Ereignisse aus ihrem Protokoll und lädt den Stand des Servers.
    """
    match, _ = await _playable(db, ctx, match_id)
    if match.status == "scheduled" or match.started_at is None:
        raise Conflict("Das Match wurde noch nicht mit dem Tracker gestartet.")
    rules = await rules_for(db, ctx.tournament)
    result = PushResult()
    # In zeitlicher Reihenfolge; was auf sein Spiel wartet, kommt nach jedem neuen Spiel dran
    waiting: list[EventIn] = []
    for ev in sorted(events, key=lambda e: (e.client_ts, e.device_id, e.seq)):
        if await db.get(GameEvent, ev.id) is not None:
            result.duplicates.append(ev.id)
            continue
        ok = await _try(db, ctx, match, ev, rules.starting_life, result, waiting)
        if ok and ev.type == "game_start":
            retry, waiting = waiting, []
            for w in retry:
                await _try(db, ctx, match, w, rules.starting_life, result, waiting)
    for w in waiting:
        result.rejected.append((w.id, "Spiel unbekannt."))
    await _update_result(db, ctx, match)
    await db.flush()
    return result


async def _try(
    db: AsyncSession,
    ctx: Context,
    match: Match,
    ev: EventIn,
    life: int,
    result: PushResult,
    waiting: list[EventIn],
) -> bool:
    try:
        await _apply(db, ctx, match, ev, life)
    except UnknownGame:
        waiting.append(ev)
        return False
    except Rejected as exc:
        result.rejected.append((ev.id, str(exc)))
        return False
    result.accepted.append(ev.id)
    return True


async def _apply(db: AsyncSession, ctx: Context, match: Match, ev: EventIn, life: int) -> None:
    players = (match.player_a_id, match.player_b_id)
    if ev.player_id is not None and ev.player_id not in players:
        raise Rejected("Spieler gehört nicht zu diesem Match.")
    clash = await db.scalar(
        select(GameEvent.id).where(
            GameEvent.game_id == ev.game_id,
            GameEvent.device_id == ev.device_id,
            GameEvent.seq == ev.seq,
        )
    )
    if clash is not None:
        raise Rejected("Laufende Nummer schon vergeben.")

    game = await db.get(Game, ev.game_id)
    if ev.type == "game_start":
        if game is not None:
            raise Rejected("Spiel gibt es schon.")
        if ev.player_id is None:
            raise Rejected("Wer beginnt, fehlt.")
        if match.status == "finished":
            raise Rejected("Das Match ist schon entschieden.")
        games = list(await db.scalars(select(Game).where(Game.match_id == match.id)))
        if any(g.ended_at is None for g in games):
            raise Rejected("Es läuft schon ein Spiel.")
        game = Game(
            id=ev.game_id,
            match_id=match.id,
            number=len(games) + 1,
            starting_player_id=ev.player_id,
            starting_life=life,
            started_at=ev.client_ts,
        )
        db.add(game)
        await db.flush()
    elif game is None:
        raise UnknownGame("Spiel unbekannt.")
    elif game.match_id != match.id:
        raise Rejected("Spiel gehört zu einem anderen Match.")

    match ev.type:
        case "life":
            if ev.player_id is None or not ev.delta:
                raise Rejected("Lebenspunkte brauchen Spieler und Änderung.")
            if match.tracker_mode == "dual":
                await _check_binding(db, match, ev)
        case "die_roll":
            if ev.player_id is None or ev.value is None or not 1 <= ev.value <= 20:
                raise Rejected("Ein W20 zeigt 1 bis 20.")
        case "undo":
            target = await db.get(GameEvent, ev.undo_of) if ev.undo_of else None
            if target is None or target.game_id != ev.game_id or target.type != "life":
                raise Rejected("Rückgängig ohne passendes Ereignis.")
            if target.device_id != ev.device_id:
                raise Rejected("Nur eigene Eingaben lassen sich zurücknehmen.")
        case "game_end":
            reason = ev.reason if ev.reason in END_REASONS else None
            if ev.player_id is None:
                reason = "time"  # Unentschieden gibt es nur nach Zeitablauf
            if game.ended_at is not None:
                if game.winner_player_id != ev.player_id:
                    raise Rejected("Das Spiel wurde schon anders beendet.")
            else:
                game.winner_player_id = ev.player_id
                game.end_reason = reason or "manual"
                game.ended_at = ev.client_ts
        case "game_start":
            pass
        case _:
            raise Rejected("Unbekannte Ereignisart.")

    db.add(
        GameEvent(
            id=ev.id,
            game_id=ev.game_id,
            player_id=ev.player_id,
            type=ev.type,
            delta=ev.delta if ev.type == "life" else None,
            value=ev.value if ev.type == "die_roll" else None,
            undo_of=ev.undo_of if ev.type == "undo" else None,
            source=ev.source if ev.source in ("app", "hardware", "table") else "app",
            device_id=ev.device_id,
            seq=ev.seq,
            client_ts=ev.client_ts,
        )
    )
    await db.flush()


async def _check_binding(db: AsyncSession, match: Match, ev: EventIn) -> None:
    """Zwei Handys: Ein Gerät zählt im ganzen Match nur einen Spieler (ADR-0005)."""
    other = await db.scalar(
        select(GameEvent.player_id)
        .join(Game, Game.id == GameEvent.game_id)
        .where(
            Game.match_id == match.id,
            GameEvent.device_id == ev.device_id,
            GameEvent.type == "life",
            GameEvent.player_id != ev.player_id,
        )
        .limit(1)
    )
    if other is not None:
        raise Rejected("Dieses Handy zählt schon für den anderen Spieler.")


async def _update_result(db: AsyncSession, ctx: Context, match: Match) -> None:
    """Spielsiege ins Match übernehmen (F-11); bei genug Siegen oder Unentschieden ist es aus."""
    if match.status != "running":
        return
    games = list(await db.scalars(select(Game).where(Game.match_id == match.id)))
    ended = [g for g in games if g.ended_at is not None]
    match.games_a = sum(1 for g in ended if g.winner_player_id == match.player_a_id)
    match.games_b = sum(1 for g in ended if g.winner_player_id == match.player_b_id)
    match.games_drawn = sum(1 for g in ended if g.winner_player_id is None)
    games_to_win = (await rules_for(db, ctx.tournament)).games_to_win
    decided = max(match.games_a, match.games_b) >= games_to_win or match.games_drawn > 0
    if decided and all(g.ended_at is not None for g in games):
        match.status = "finished"
        match.finished_at = max(g.ended_at for g in ended if g.ended_at)
        match.result_by = ctx.my_player.id if ctx.my_player else None
        match.version += 1


@dataclass
class LiveLife:
    game_no: int
    life_a: int
    life_b: int


async def live_life(db: AsyncSession, matches: list[Match]) -> dict[uuid.UUID, LiveLife]:
    """Lebenspunkte im laufenden Spiel jedes Matches, für die Live-Ansicht (F-15)."""
    by_id = {m.id: m for m in matches}
    if not by_id:
        return {}
    games = list(
        await db.scalars(select(Game).where(Game.match_id.in_(by_id), Game.ended_at.is_(None)))
    )
    if not games:
        return {}
    rows = list(
        await db.scalars(select(GameEvent).where(GameEvent.game_id.in_([g.id for g in games])))
    )
    out: dict[uuid.UUID, LiveLife] = {}
    for g in games:
        m = by_id[g.match_id]
        events = [
            life.GameEvent(
                id=str(e.id),
                player_id=e.player_id,
                type=e.type,  # type: ignore[arg-type]
                device_id=e.device_id,
                seq=e.seq,
                delta=e.delta,
                value=e.value,
                undo_of=str(e.undo_of) if e.undo_of else None,
            )
            for e in rows
            if e.game_id == g.id
        ]
        totals = life.life_totals([m.player_a_id, m.player_b_id], events, g.starting_life)
        out[m.id] = LiveLife(g.number, totals[m.player_a_id], totals[m.player_b_id])
    return out


# ---------------------------------------------------------------------------
# Warteraum für „jeder sein eigenes Handy“ (21.11.2026)
# ---------------------------------------------------------------------------
# Gespeichert in ``tournament.settings["tracker"][match_id]``:
# ``{"seats": {player_id: device_id}, "rolls": {player_id: 1..20}, "tie": int | None}``.
# Gilt nur bis zum ``game_start`` von Spiel 1; danach zählen die Ereignisse.


@dataclass
class Lobby:
    seats: dict[uuid.UUID, str]
    rolls: dict[uuid.UUID, int]
    tie: int | None


def lobby(ctx: Context, match_id: uuid.UUID) -> Lobby:
    raw = ((ctx.tournament.settings or {}).get("tracker") or {}).get(str(match_id)) or {}
    return Lobby(
        seats={uuid.UUID(k): v for k, v in (raw.get("seats") or {}).items()},
        rolls={uuid.UUID(k): int(v) for k, v in (raw.get("rolls") or {}).items()},
        tie=raw.get("tie"),
    )


def _save_lobby(ctx: Context, match_id: uuid.UUID, lob: Lobby) -> None:
    t = ctx.tournament
    settings = dict(t.settings or {})
    tracker_state = dict(settings.get("tracker") or {})
    tracker_state[str(match_id)] = {
        "seats": {str(k): v for k, v in lob.seats.items()},
        "rolls": {str(k): v for k, v in lob.rolls.items()},
        "tie": lob.tie,
    }
    settings["tracker"] = tracker_state
    t.settings = settings


async def _dual_match(
    db: AsyncSession, ctx: Context, match_id: uuid.UUID, player_id: uuid.UUID
) -> Match:
    match, _ = await _playable(db, ctx, match_id)
    if match.tracker_mode != "dual" or match.status != "running":
        raise Conflict("Das Match läuft nicht im Modus „jeder sein eigenes Handy“.")
    if player_id not in (match.player_a_id, match.player_b_id):
        raise Conflict("Spieler gehört nicht zu diesem Match.")
    return match


async def claim_seat(
    db: AsyncSession,
    ctx: Context,
    match_id: uuid.UUID,
    player_id: uuid.UUID,
    device_id: str,
    *,
    force: bool = False,
) -> None:
    """Dieses Handy zählt für ``player_id``. Ein Spieler zählt nur auf einem Handy."""
    await _dual_match(db, ctx, match_id, player_id)
    lob = lobby(ctx, match_id)
    holder = lob.seats.get(player_id)
    if holder is not None and holder != device_id and not force:
        raise Conflict("Für diesen Spieler zählt schon ein anderes Handy.")
    # Ein Handy zählt nur einen Spieler: einen anderen Platz dieses Handys freigeben
    for pid, dev in list(lob.seats.items()):
        if dev == device_id and pid != player_id:
            del lob.seats[pid]
            lob.rolls.pop(pid, None)
    if holder != device_id:
        lob.rolls.pop(player_id, None)  # neues Handy würfelt selbst neu
    lob.seats[player_id] = device_id
    _save_lobby(ctx, match_id, lob)
    await db.flush()


async def roll(
    db: AsyncSession,
    ctx: Context,
    match_id: uuid.UUID,
    player_id: uuid.UUID,
    device_id: str,
    value: int,
) -> None:
    """Eigener W20 vor Spiel 1 (UC-10); bei Gleichstand würfeln beide neu."""
    match = await _dual_match(db, ctx, match_id, player_id)
    if not 1 <= value <= 20:
        raise Conflict("Ein W20 zeigt 1 bis 20.")
    lob = lobby(ctx, match_id)
    if lob.seats.get(player_id) != device_id:
        raise Forbidden
    other = match.player_b_id if player_id == match.player_a_id else match.player_a_id
    if other not in lob.seats:
        raise Conflict("Der Gegner ist noch nicht da.")
    if await db.scalar(select(Game.id).where(Game.match_id == match.id).limit(1)) is not None:
        raise Conflict("Das Spiel hat schon begonnen.")
    if player_id in lob.rolls:
        raise Conflict("Du hast schon gewürfelt.")
    if lob.rolls.get(other) == value:
        lob.rolls.clear()
        lob.tie = value
    else:
        lob.rolls[player_id] = value
        lob.tie = None
    _save_lobby(ctx, match_id, lob)
    await db.flush()
