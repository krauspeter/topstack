"""Wann wer welche Push-Nachricht bekommt (F-17, AP-8).

Nur Spieler mit Konto bekommen Push; Gäste und Spieler ohne Konto haben kein Handy-Abo.
Wer etwas selbst auslöst, bekommt dazu keine Nachricht.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from topstack.db.models import Match, Player, Round, Tournament, TournamentEntry
from topstack.services import push
from topstack.services.push import Message


async def _accounts(db: AsyncSession, player_ids: list[uuid.UUID]) -> dict[uuid.UUID, uuid.UUID]:
    """Spieler → Konto, nur für Spieler mit Konto."""
    if not player_ids:
        return {}
    rows = await db.scalars(select(Player).where(Player.id.in_(player_ids)))
    return {p.id: p.app_user_id for p in rows if p.app_user_id is not None}


async def _names(db: AsyncSession, player_ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    rows = await db.scalars(select(Player).where(Player.id.in_(player_ids)))
    return {p.id: p.display_name for p in rows}


async def _participants(db: AsyncSession, tid: uuid.UUID) -> list[uuid.UUID]:
    rows = await db.scalars(
        select(TournamentEntry.player_id).where(
            TournamentEntry.tournament_id == tid, TournamentEntry.status == "accepted"
        )
    )
    return list(rows)


def _url(t: Tournament) -> str:
    return f"/turnier/{t.id}"


async def round_started(db: AsyncSession, t: Tournament, number: int, by: uuid.UUID | None) -> None:
    """Neue Runde: Wer spielt, bekommt „Du bist dran“, wer Pause hat, „Neue Runde“."""
    rnd = await db.scalar(select(Round).where(Round.tournament_id == t.id, Round.number == number))
    if rnd is None:
        return
    matches = list(await db.scalars(select(Match).where(Match.round_id == rnd.id)))
    players = await _participants(db, t.id)
    accounts = await _accounts(db, players)
    names = await _names(db, players)
    opponent: dict[uuid.UUID, uuid.UUID] = {}
    for m in matches:
        if m.status == "scheduled":
            opponent[m.player_a_id] = m.player_b_id
            opponent[m.player_b_id] = m.player_a_id
    items = []
    for pid, user in accounts.items():
        if pid == by:
            continue
        tag = f"round-{t.id}"
        if pid in opponent:
            msg = Message(
                f"Runde {number}: Du bist dran",
                f"Du spielst gegen {names.get(opponent[pid], '?')}.",
                _url(t),
                tag,
            )
            items.append((user, "your_turn", msg))
        else:
            body = "Du hast Pause." if rnd.bye_player_id == pid else "Dein Match läuft schon."
            items.append((user, "new_round", Message(f"Runde {number} läuft", body, _url(t), tag)))
    await push.send(db, items)


async def match_pulled_forward(
    db: AsyncSession, t: Tournament, match: Match, by: uuid.UUID | None
) -> None:
    """Vorgezogenes Match: beide Spieler sind sofort dran."""
    pair = [match.player_a_id, match.player_b_id]
    accounts = await _accounts(db, pair)
    names = await _names(db, pair)
    items = []
    for pid in pair:
        if pid == by or pid not in accounts:
            continue
        other = pair[1] if pid == pair[0] else pair[0]
        msg = Message("Du bist dran", f"Vorgezogen: du gegen {names.get(other, '?')}.", _url(t))
        items.append((accounts[pid], "your_turn", msg))
    await push.send(db, items)


async def tournament_finished(db: AsyncSession, t: Tournament, by: uuid.UUID | None) -> None:
    rows = await db.scalars(
        select(TournamentEntry).where(
            TournamentEntry.tournament_id == t.id, TournamentEntry.status == "accepted"
        )
    )
    entries = {e.player_id: e for e in rows}
    accounts = await _accounts(db, list(entries))
    items = []
    for pid, user in accounts.items():
        if pid == by:
            continue
        place = entries[pid].final_place
        body = f"Du bist Platz {place}." if place else "Die Siegerehrung wartet."
        items.append((user, "tournament_end", Message("Turnier beendet", body, _url(t))))
    await push.send(db, items)


async def invited(
    db: AsyncSession, t: Tournament, player_ids: list[uuid.UUID], by_name: str
) -> None:
    accounts = await _accounts(db, player_ids)
    msg = Message(
        "Einladung zum Draft",
        f"{by_name} lädt dich zu „{t.set_code}“ ein.",
        _url(t),
    )
    await push.send(db, [(user, "invitation", msg) for user in accounts.values()])


async def result_corrected(
    db: AsyncSession, t: Tournament, match: Match, by: uuid.UUID | None
) -> None:
    """UC-14: Die anderen Beteiligten erfahren von der Korrektur."""
    pair = [match.player_a_id, match.player_b_id]
    accounts = await _accounts(db, pair)
    names = await _names(db, [*pair, *([by] if by else [])])
    result = f"{names.get(pair[0], '?')} {match.games_a}:{match.games_b} {names.get(pair[1], '?')}"
    who = names.get(by, "Jemand") if by else "Jemand"
    msg = Message("Ergebnis korrigiert", f"{who} hat korrigiert: {result}.", _url(t))
    await push.send(
        db, [(user, "result_corrected", msg) for pid, user in accounts.items() if pid != by]
    )


async def cancel_requested(db: AsyncSession, t: Tournament, by: uuid.UUID | None) -> None:
    players = await _participants(db, t.id)
    accounts = await _accounts(db, players)
    names = await _names(db, [by] if by else [])
    who = names.get(by, "Jemand") if by else "Jemand"
    msg = Message(
        "Abbruch beantragt",
        f"{who} möchte das Turnier abbrechen. Bestätigen oder weiterspielen?",
        _url(t),
    )
    await push.send(
        db, [(user, "cancel_requested", msg) for pid, user in accounts.items() if pid != by]
    )
