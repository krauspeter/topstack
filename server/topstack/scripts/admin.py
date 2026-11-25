"""Superuser-Werkzeug für den Betreiber des Heimservers (Phase 4, vor AP-8).

Keine eigene Rolle in der App: Wer per SSH auf den Heimserver kommt, darf aufräumen. Aufruf
über ``infra/ops/admin.sh``, das vor jedem ``--apply`` ein Backup macht::

    infra/ops/admin.sh players                       Spieler je Gruppe
    infra/ops/admin.sh tournaments                   Turniere je Gruppe
    infra/ops/admin.sh delete-player Ben             zeigt, was passieren würde
    infra/ops/admin.sh delete-player Ben --apply     löscht (vorher Backup)
    infra/ops/admin.sh delete-tournament 3f2a --apply
    infra/ops/admin.sh invite-link Andreas           persönlicher Link (ADR-0015)

Spieler und Turniere lassen sich über den Namen bzw. Set-Code oder den Anfang der ID angeben
(die ersten Zeichen aus ``players`` / ``tournaments``). Bei mehreren Treffern nennt das Skript
alle und ändert nichts; ``--group`` grenzt auf eine Gruppe ein.

Gelöscht werden nur Spieler ohne Konto (vorgemerkt oder Gast). Steht der Spieler in einem
Turnier, verweigert das Skript das Löschen und nennt die Turniere.
"""

import argparse
import asyncio
import sys
import uuid
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import Text, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from topstack.config import settings
from topstack.db.models import Membership, Player, PlayGroup, Tournament, TournamentEntry
from topstack.db.session import get_sessionmaker
from topstack.services import invitations
from topstack.services import tournaments as svc

KIND = {"member": "Mitglied", "reserved": "ohne Konto", "guest": "Gast", "former": "ehemalig"}


class Refused(Exception):
    """Das Skript ändert nichts; die Meldung sagt, warum."""


@dataclass
class Result:
    lines: list[str]
    changed: bool = False


def short(i: uuid.UUID) -> str:
    return str(i)[:8]


async def _group(db: AsyncSession, name: str | None) -> PlayGroup | None:
    if name is None:
        return None
    group = await db.scalar(select(PlayGroup).where(func.lower(PlayGroup.name) == name.lower()))
    if group is None:
        raise Refused(f"Keine Gruppe „{name}“.")
    return group


def _pick[T](found: Sequence[T], what: str, ref: str, describe) -> T:
    if not found:
        raise Refused(f"Kein {what} „{ref}“.")
    if len(found) > 1:
        lines = "\n".join(f"  {describe(x)}" for x in found)
        raise Refused(f"„{ref}“ passt auf mehrere, bitte die ID nehmen:\n{lines}")
    return found[0]


def _id_starts(column, ref: str):
    """Anfang der ID, wie ``players`` und ``tournaments`` ihn zeigen."""
    return func.substr(cast(column, Text), 1, len(ref)) == ref.lower()


async def find_player(db: AsyncSession, ref: str, group: str | None = None) -> Player:
    g = await _group(db, group)
    stmt = select(Player).where(
        (func.lower(Player.display_name) == ref.lower()) | _id_starts(Player.id, ref)
    )
    if g is not None:
        stmt = stmt.where(Player.group_id == g.id)
    found = list(await db.scalars(stmt.order_by(Player.created_at)))
    return _pick(
        found, "Spieler", ref, lambda p: f"{short(p.id)}  {p.display_name} ({KIND[p.kind]})"
    )


async def find_tournament(db: AsyncSession, ref: str, group: str | None = None) -> Tournament:
    g = await _group(db, group)
    stmt = select(Tournament).where(
        (func.lower(Tournament.set_code) == ref.lower()) | _id_starts(Tournament.id, ref)
    )
    if g is not None:
        stmt = stmt.where(Tournament.group_id == g.id)
    found = list(await db.scalars(stmt))
    return _pick(
        found,
        "Turnier",
        ref,
        lambda t: f"{short(t.id)}  {t.held_on:%d.%m.%Y} {t.set_code.upper()} {t.status}",
    )


async def _player_tournaments(db: AsyncSession, player_id: uuid.UUID) -> list[Tournament]:
    return list(
        await db.scalars(
            select(Tournament)
            .join(TournamentEntry, TournamentEntry.tournament_id == Tournament.id)
            .where(TournamentEntry.player_id == player_id)
            .order_by(Tournament.held_on)
        )
    )


def _t_line(t: Tournament) -> str:
    return f"{short(t.id)}  {t.held_on:%d.%m.%Y}  {t.set_code.upper():5} {t.status}"


async def list_players(db: AsyncSession, group: str | None = None) -> Result:
    g = await _group(db, group)
    counts = (
        select(TournamentEntry.player_id, func.count().label("n"))
        .group_by(TournamentEntry.player_id)
        .subquery()
    )
    stmt = (
        select(PlayGroup.name, Player, func.coalesce(counts.c.n, 0))
        .join(Player, Player.group_id == PlayGroup.id)
        .outerjoin(counts, counts.c.player_id == Player.id)
        .order_by(PlayGroup.name, Player.kind, func.lower(Player.display_name))
    )
    if g is not None:
        stmt = stmt.where(PlayGroup.id == g.id)
    lines, last = [], None
    for name, p, n in (await db.execute(stmt)).all():
        if name != last:
            lines.append(f"Gruppe {name}")
            last = name
        used = f"{n} Turnier" if n == 1 else f"{n} Turniere"
        lines.append(f"  {short(p.id)}  {p.display_name:20} {KIND[p.kind]:11} {used}")
    return Result(lines or ["Keine Spieler."])


async def list_tournaments(db: AsyncSession, group: str | None = None) -> Result:
    g = await _group(db, group)
    players = (
        select(func.count())
        .select_from(TournamentEntry)
        .where(TournamentEntry.tournament_id == Tournament.id, TournamentEntry.status == "accepted")
        .scalar_subquery()
    )
    stmt = (
        select(PlayGroup.name, Tournament, players)
        .join(Tournament, Tournament.group_id == PlayGroup.id)
        .order_by(PlayGroup.name, Tournament.held_on.desc(), Tournament.created_at.desc())
    )
    if g is not None:
        stmt = stmt.where(PlayGroup.id == g.id)
    lines, last = [], None
    for name, t, n in (await db.execute(stmt)).all():
        if name != last:
            lines.append(f"Gruppe {name}")
            last = name
        lines.append(f"  {_t_line(t)}  {n} Spieler")
    return Result(lines or ["Keine Turniere."])


async def delete_player(db: AsyncSession, ref: str, *, group: str | None, apply: bool) -> Result:
    p = await find_player(db, ref, group)
    if p.kind == "member":
        raise Refused(f"{p.display_name} hat ein Konto. Mitglieder löscht das Skript nicht.")
    used = await _player_tournaments(db, p.id)
    if used:
        lines = "\n".join(f"  {_t_line(t)}" for t in used)
        raise Refused(
            f"{p.display_name} steht in {len(used)} Turnier(en) und bleibt. Erst die Turniere "
            f"löschen, falls es Testturniere sind:\n{lines}"
        )
    what = f"Spieler {p.display_name} ({KIND[p.kind]}, {short(p.id)})"
    if not apply:
        return Result([f"Würde löschen: {what}", "Mit --apply ausführen."])
    await db.delete(p)  # offene persönliche Einladungslinks verschwinden per CASCADE mit
    await db.flush()
    return Result([f"Gelöscht: {what}"], changed=True)


async def delete_tournament(
    db: AsyncSession, ref: str, *, group: str | None, apply: bool
) -> Result:
    t = await find_tournament(db, ref, group)
    note = []
    if t.status == "finished":
        note.append("Achtung: abgeschlossen. Ergebnisse und Ranglistenpunkte verschwinden mit.")
    guests = await db.scalar(
        select(func.count())
        .select_from(TournamentEntry)
        .join(Player, Player.id == TournamentEntry.player_id)
        .where(TournamentEntry.tournament_id == t.id, Player.kind == "guest")
    )
    if guests:
        note.append(f"{guests} Gäste, die nur hier mitgespielt haben, werden mit gelöscht.")
    what = f"Turnier {_t_line(t)}"
    if not apply:
        return Result([f"Würde löschen: {what}", *note, "Mit --apply ausführen."])
    await svc.purge(db, t)
    return Result([f"Gelöscht: {what}", *note], changed=True)


async def invite_link(db: AsyncSession, ref: str, *, group: str | None, days: int | None) -> Result:
    p = await find_player(db, ref, group)
    if p.kind != "reserved":
        raise Refused(
            f"{p.display_name} ist {KIND[p.kind]}; Links gibt es nur für Spieler ohne Konto."
        )
    admin = await db.scalar(
        select(Membership.app_user_id).where(
            Membership.group_id == p.group_id, Membership.role == "admin"
        )
    )
    token, inv = await invitations.create(
        db, group_id=p.group_id, created_by=admin, days=days, player_id=p.id
    )
    return Result(
        [
            f"Persönlicher Link für {p.display_name} (einmal nutzbar, gültig bis "
            f"{inv.expires_at:%d.%m.%Y}):",
            f"{settings.public_origin}/einladung/{token}",
            "Wer ihn öffnet und sich anmeldet, übernimmt den Spieler samt Ergebnissen.",
        ],
        changed=True,
    )


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="topstack.scripts.admin", description=(__doc__ or "").split("\n")[0]
    )
    sub = parser.add_subparsers(dest="cmd", required=True)
    for cmd, help_ in (("players", "Spieler je Gruppe"), ("tournaments", "Turniere je Gruppe")):
        sub.add_parser(cmd, help=help_).add_argument("--group")
    for cmd, help_ in (
        ("delete-player", "Spieler ohne Konto löschen"),
        ("delete-tournament", "Turnier löschen, z. B. Testturniere"),
    ):
        p = sub.add_parser(cmd, help=help_)
        p.add_argument("ref", help="Name bzw. Set-Code oder Anfang der ID")
        p.add_argument("--group")
        p.add_argument("--apply", action="store_true", help="wirklich ändern")
    p = sub.add_parser("invite-link", help="persönlicher Einladungslink (ADR-0015)")
    p.add_argument("ref")
    p.add_argument("--group")
    p.add_argument("--days", type=int)
    return parser.parse_args(argv)


async def run(db: AsyncSession, args: argparse.Namespace) -> Result:
    match args.cmd:
        case "players":
            return await list_players(db, args.group)
        case "tournaments":
            return await list_tournaments(db, args.group)
        case "delete-player":
            return await delete_player(db, args.ref, group=args.group, apply=args.apply)
        case "delete-tournament":
            return await delete_tournament(db, args.ref, group=args.group, apply=args.apply)
        case _:
            return await invite_link(db, args.ref, group=args.group, days=args.days)


async def amain(args: argparse.Namespace) -> int:
    async with get_sessionmaker()() as db:
        try:
            result = await run(db, args)
        except Refused as exc:
            print(exc, file=sys.stderr)
            return 1
        if result.changed:
            await db.commit()
        print("\n".join(result.lines))
        return 0


def main() -> int:
    return asyncio.run(amain(parse_args()))


if __name__ == "__main__":
    sys.exit(main())
