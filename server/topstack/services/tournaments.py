"""Turnier vorbereiten (UC-03 bis UC-07): starten, einladen, Gäste, Auslosung, Farben.

Rechte und erlaubte Übergänge kommen aus ``topstack.domain.tournament`` (ADR-0013).
Zustandswechsel sperren die Turnierzeile mit ``SELECT … FOR UPDATE``.
"""

import random
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from topstack.config import settings
from topstack.db.models import (
    AppUser,
    Invitation,
    Membership,
    Player,
    PlayGroup,
    Season,
    Tournament,
    TournamentEntry,
)
from topstack.db.repo import groups
from topstack.domain.seating import draw_seats
from topstack.domain.tournament import Action, Actor, Forbidden, Status, WrongStatus, check
from topstack.services.tokens import hash_token, new_token

GUEST_LINK_HOURS = 12
INVITABLE_KINDS = ("member", "reserved")
FOR_OTHERS_KINDS = ("guest", "reserved")  # Spieler ohne eigenes Handy-Konto


class NotFound(Exception):
    pass


class Conflict(Exception):
    pass


__all__ = ["Conflict", "Forbidden", "NotFound", "WrongStatus"]


def now() -> datetime:
    return datetime.now(UTC)


@dataclass
class Context:
    tournament: Tournament
    membership: Membership
    my_player: Player | None
    my_entry: TournamentEntry | None

    @property
    def status(self) -> Status:
        return Status(self.tournament.status)

    @property
    def actor(self) -> Actor:
        return Actor(
            is_starter=self.my_player is not None
            and self.tournament.started_by == self.my_player.id,
            is_admin=self.membership.role == "admin",
            is_participant=self.my_entry is not None and self.my_entry.status == "accepted",
            is_member=self.membership.role != "viewer",
        )


async def _member_context(
    db: AsyncSession, group_id: uuid.UUID, user: AppUser
) -> tuple[Membership, Player | None]:
    membership = await groups.get_membership(db, group_id=group_id, user_id=user.id)
    if membership is None:
        raise NotFound
    player = await db.scalar(
        select(Player).where(Player.group_id == group_id, Player.app_user_id == user.id)
    )
    return membership, player


async def load(
    db: AsyncSession, tournament_id: uuid.UUID, user: AppUser, *, lock: bool = False
) -> Context:
    """Turnier für einen Nutzer der Gruppe; Fremde bekommen ``NotFound``."""
    tournament = await db.get(
        Tournament, tournament_id, with_for_update=lock, populate_existing=lock
    )
    if tournament is None:
        raise NotFound
    membership, player = await _member_context(db, tournament.group_id, user)
    entry = (
        await db.get(TournamentEntry, (tournament.id, player.id)) if player is not None else None
    )
    return Context(tournament, membership, player, entry)


# ---------------------------------------------------------------------------
# Spieler der Gruppe
# ---------------------------------------------------------------------------


async def list_players(db: AsyncSession, group_id: uuid.UUID, user: AppUser) -> list[Player]:
    await _member_context(db, group_id, user)
    stmt = (
        select(Player)
        .where(Player.group_id == group_id, Player.kind.in_(INVITABLE_KINDS))
        .order_by(func.lower(Player.display_name))
    )
    return list(await db.scalars(stmt))


async def create_reserved(
    db: AsyncSession, group_id: uuid.UUID, user: AppUser, display_name: str
) -> Player:
    """Vorgemerkter Spieler ohne Konto (ADR-0015), nur durch den Gruppen-Admin."""
    membership, _ = await _member_context(db, group_id, user)
    if membership.role != "admin":
        raise Forbidden
    taken = await db.scalar(
        select(func.count())
        .select_from(Player)
        .where(
            Player.group_id == group_id,
            Player.kind.in_(INVITABLE_KINDS),
            func.lower(Player.display_name) == display_name.lower(),
        )
    )
    if taken:
        raise Conflict("Diesen Namen gibt es in der Gruppe schon.")
    player = Player(group_id=group_id, kind="reserved", display_name=display_name)
    db.add(player)
    await db.flush()
    return player


async def reserved_player(db: AsyncSession, group_id: uuid.UUID, player_id: uuid.UUID) -> Player:
    player = await db.get(Player, player_id)
    if player is None or player.group_id != group_id:
        raise NotFound
    if player.kind != "reserved":
        raise Conflict("Dieser Spieler hat schon ein Konto.")
    return player


# ---------------------------------------------------------------------------
# Turnier starten und anzeigen
# ---------------------------------------------------------------------------


async def current_season(db: AsyncSession, group_id: uuid.UUID, day: date) -> Season | None:
    stmt = (
        select(Season)
        .where(
            Season.group_id == group_id,
            Season.starts_on <= day,
            or_(Season.ends_on.is_(None), Season.ends_on >= day),
            Season.archived_at.is_(None),
        )
        .order_by(Season.starts_on.desc())
        .limit(1)
    )
    return await db.scalar(stmt)


async def open_tournament(db: AsyncSession, group_id: uuid.UUID) -> Tournament | None:
    stmt = select(Tournament).where(
        Tournament.group_id == group_id,
        Tournament.status.notin_(("finished", "cancelled")),
        Tournament.imported.is_(False),
    )
    return await db.scalar(stmt)


async def start(
    db: AsyncSession,
    group_id: uuid.UUID,
    user: AppUser,
    *,
    set_code: str,
    location: str | None,
) -> Tournament:
    """UC-03: jedes Mitglied darf starten; nur ein offenes Turnier pro Gruppe."""
    membership, player = await _member_context(db, group_id, user)
    if membership.role == "viewer" or player is None:
        raise Forbidden
    if await open_tournament(db, group_id) is not None:
        raise Conflict("In der Gruppe läuft schon ein Turnier.")
    today = date.today()
    season = await current_season(db, group_id, today)
    tournament = Tournament(
        group_id=group_id,
        season_id=season.id if season else None,
        set_code=set_code,
        started_by=player.id,
        held_on=today,
        location=location,
    )
    try:
        async with db.begin_nested():
            db.add(tournament)
            await db.flush()
    except IntegrityError:
        raise Conflict("In der Gruppe läuft schon ein Turnier.") from None
    db.add(TournamentEntry(tournament_id=tournament.id, player_id=player.id, status="accepted"))
    await db.flush()
    return tournament


async def entries_with_players(
    db: AsyncSession, tournament_id: uuid.UUID
) -> list[tuple[TournamentEntry, Player]]:
    stmt = (
        select(TournamentEntry, Player)
        .join(Player, Player.id == TournamentEntry.player_id)
        .where(TournamentEntry.tournament_id == tournament_id, TournamentEntry.status != "removed")
        .order_by(TournamentEntry.seat_no.nulls_last(), func.lower(Player.display_name))
    )
    return [(e, p) for e, p in (await db.execute(stmt)).all()]


async def group_name(db: AsyncSession, group_id: uuid.UUID) -> str:
    group = await db.get(PlayGroup, group_id)
    return group.name if group else ""


# ---------------------------------------------------------------------------
# Einladen, zusagen, entfernen (UC-04)
# ---------------------------------------------------------------------------


async def invite(db: AsyncSession, ctx: Context, player_ids: list[uuid.UUID]) -> None:
    """Mitglieder bekommen eine Einladung, vorgemerkte Spieler sind sofort dabei (ADR-0015)."""
    check(Action.INVITE, ctx.status, ctx.actor)
    t = ctx.tournament
    for pid in dict.fromkeys(player_ids):
        player = await db.get(Player, pid)
        if player is None or player.group_id != t.group_id or player.kind not in INVITABLE_KINDS:
            raise NotFound
        status = "accepted" if player.kind == "reserved" else "invited"
        entry = await db.get(TournamentEntry, (t.id, pid))
        if entry is None:
            db.add(TournamentEntry(tournament_id=t.id, player_id=pid, status=status))
        elif entry.status in ("declined", "removed"):
            entry.status = status
    await db.flush()


async def respond(db: AsyncSession, ctx: Context, accept: bool) -> None:
    if ctx.my_entry is None or ctx.my_entry.status == "removed":
        raise Forbidden
    if ctx.status != Status.SETUP:
        raise WrongStatus("Die Anmeldung ist geschlossen.")
    if ctx.my_player is not None and ctx.tournament.started_by == ctx.my_player.id and not accept:
        raise Conflict("Wer das Turnier startet, spielt mit.")
    ctx.my_entry.status = "accepted" if accept else "declined"
    await db.flush()


async def remove(db: AsyncSession, ctx: Context, player_id: uuid.UUID) -> None:
    check(Action.INVITE, ctx.status, ctx.actor)
    if player_id == ctx.tournament.started_by:
        raise Conflict("Wer das Turnier startet, spielt mit.")
    entry = await db.get(TournamentEntry, (ctx.tournament.id, player_id))
    if entry is None or entry.status == "removed":
        raise NotFound
    entry.status = "removed"
    await db.flush()


# ---------------------------------------------------------------------------
# Gäste (UC-05)
# ---------------------------------------------------------------------------


async def create_guest_link(
    db: AsyncSession, ctx: Context, user: AppUser
) -> tuple[str, Invitation]:
    check(Action.INVITE, ctx.status, ctx.actor)
    token = new_token()
    invitation = Invitation(
        token_hash=hash_token(token),
        group_id=ctx.tournament.group_id,
        tournament_id=ctx.tournament.id,
        created_by=user.id,
        expires_at=now() + timedelta(hours=GUEST_LINK_HOURS),
    )
    db.add(invitation)
    await db.flush()
    return token, invitation


async def guest_invitation(db: AsyncSession, token: str) -> tuple[Invitation, Tournament]:
    invitation = await db.get(Invitation, hash_token(token))
    if invitation is None or invitation.tournament_id is None or invitation.expires_at <= now():
        raise NotFound
    tournament = await db.get(Tournament, invitation.tournament_id, with_for_update=True)
    if tournament is None:
        raise NotFound
    return invitation, tournament


async def join_as_guest(db: AsyncSession, token: str, display_name: str) -> Player:
    invitation, tournament = await guest_invitation(db, token)
    if tournament.status != Status.SETUP:
        raise WrongStatus("Die Anmeldung ist geschlossen.")
    names = {p.display_name.lower() for _, p in await entries_with_players(db, tournament.id)}
    if display_name.lower() in names:
        raise Conflict("Diesen Namen gibt es im Turnier schon. Bitte mit Nachnamen-Kürzel.")
    guest = Player(group_id=tournament.group_id, kind="guest", display_name=display_name)
    db.add(guest)
    await db.flush()
    db.add(TournamentEntry(tournament_id=tournament.id, player_id=guest.id, status="accepted"))
    invitation.uses += 1
    await db.flush()
    return guest


# ---------------------------------------------------------------------------
# Auslosung, Draft, Farben, Abbruch (UC-06, UC-07)
# ---------------------------------------------------------------------------


async def seat(db: AsyncSession, ctx: Context) -> None:
    """Lost alle Zugesagten auf Plätze 1..n und schließt die Anmeldung.

    Der Seed geht an alle Handys, damit sie dieselbe Animation abspielen.
    """
    check(Action.SEAT, ctx.status, ctx.actor)
    t = ctx.tournament
    rows = await entries_with_players(db, t.id)
    accepted = sorted(
        (e for e, _ in rows if e.status == "accepted"), key=lambda e: str(e.player_id)
    )
    if len(accepted) < 2:
        raise Conflict("Zum Auslosen braucht es mindestens 2 Zusagen.")
    seed = secrets.randbits(31)
    order = draw_seats(accepted, random.Random(seed))
    for entry in accepted:
        entry.seat_no = None
    await db.flush()  # alte Plätze freigeben (eindeutig pro Turnier)
    for seat_no, entry in enumerate(order, start=1):
        entry.seat_no = seat_no
    for entry, _ in rows:
        if entry.status == "invited":
            entry.status = "declined"  # Anmeldung ist zu
    previous = (t.settings or {}).get("seating") or {}
    t.settings = {
        **(t.settings or {}),
        "seating": {"seed": seed, "draw": previous.get("draw", 0) + 1},
    }
    t.status = Status.SEATED
    await db.flush()


async def start_draft(db: AsyncSession, ctx: Context) -> None:
    check(Action.START_DRAFT, ctx.status, ctx.actor)
    ctx.tournament.status = Status.DRAFTING
    await db.flush()


async def report_colors(db: AsyncSession, ctx: Context, player_id: uuid.UUID, colors: str) -> None:
    """UC-07: jeder für sich; für Gäste und vorgemerkte Spieler auch Starter oder Admin."""
    t = ctx.tournament
    entry = await db.get(TournamentEntry, (t.id, player_id))
    if entry is None or entry.status != "accepted":
        raise NotFound
    own = ctx.my_player is not None and ctx.my_player.id == player_id
    if own:
        check(Action.REPORT_COLORS, ctx.status, ctx.actor)
    else:
        target = await db.get(Player, player_id)
        helper = ctx.actor.is_starter or ctx.actor.is_admin
        if target is None or target.kind not in FOR_OTHERS_KINDS or not helper:
            raise Forbidden
        check(Action.REPORT_COLORS, ctx.status, Actor(is_participant=True))
    entry.colors = colors
    await db.flush()


async def cancel(db: AsyncSession, ctx: Context) -> None:
    check(Action.CANCEL, ctx.status, ctx.actor)
    ctx.tournament.status = Status.CANCELLED
    ctx.tournament.cancel_requested_by = None
    ctx.tournament.cancel_requested_at = None
    await db.flush()


async def delete(db: AsyncSession, ctx: Context) -> None:
    """Abgebrochenes Turnier endgültig löschen, samt Gästen, die nur hier mitgespielt haben."""
    check(Action.DELETE, ctx.status, ctx.actor)
    guests = list(
        await db.scalars(
            select(Player)
            .join(TournamentEntry, TournamentEntry.player_id == Player.id)
            .where(TournamentEntry.tournament_id == ctx.tournament.id, Player.kind == "guest")
        )
    )
    await db.delete(ctx.tournament)  # Einträge, Runden, Matches, Gästelinks per CASCADE
    await db.flush()
    for guest in guests:
        await db.delete(guest)
    await db.flush()


def public_url(path: str) -> str:
    return f"{settings.public_origin}{path}"
