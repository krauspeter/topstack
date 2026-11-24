"""Superuser-Skript admin (Phase 4): aufräumen vor dem Release, persönliche Links."""

import uuid

import pytest
from sqlalchemy import func, select

from tests.api.test_tournaments import admin_group, five_player_tournament
from tests.db.factories import make_group
from topstack.db.models import Invitation, Player, Tournament
from topstack.scripts import admin
from topstack.services.tokens import hash_token

pytestmark = pytest.mark.usefixtures("client")


async def count(session, model) -> int:
    return await session.scalar(select(func.count()).select_from(model))


async def test_lists_players_and_tournaments(client, session):
    group, _, t = await five_player_tournament(client, session)
    players = "\n".join((await admin.list_players(session)).lines)
    assert "Gruppe Draft-Runde" in players
    assert "Ben" in players and "ohne Konto" in players and "1 Turnier" in players
    assert "Gina" in players and "Gast" in players
    tournaments = "\n".join((await admin.list_tournaments(session, "draft-runde")).lines)
    assert t["id"][:8] in tournaments and "DSK" in tournaments


async def test_delete_reserved_player_dry_run_then_apply(client, session):
    _, _, _ = await admin_group(client, session, reserved=("Erik",))
    dry = await admin.delete_player(session, "erik", group=None, apply=False)
    assert not dry.changed and "Würde löschen: Spieler Erik" in dry.lines[0]
    assert await session.scalar(select(Player).where(Player.display_name == "Erik")) is not None

    done = await admin.delete_player(session, "Erik", group=None, apply=True)
    assert done.changed
    assert await session.scalar(select(Player).where(Player.display_name == "Erik")) is None


async def test_refuses_player_in_tournament_and_names_it(client, session):
    _, _, t = await five_player_tournament(client, session)
    with pytest.raises(admin.Refused) as exc:
        await admin.delete_player(session, "Ben", group=None, apply=True)
    assert "1 Turnier" in str(exc.value) and t["id"][:8] in str(exc.value)
    assert await session.scalar(select(Player).where(Player.display_name == "Ben")) is not None


async def test_refuses_members(client, session):
    await admin_group(client, session)
    with pytest.raises(admin.Refused, match="hat ein Konto"):
        await admin.delete_player(session, "Peter", group=None, apply=True)


async def test_ambiguous_name_needs_id_or_group(client, session):
    group, _, _ = await admin_group(client, session, reserved=("Ben",))
    other = await make_group(session, "Montagsrunde")
    session.add(Player(group_id=other.id, kind="reserved", display_name="Ben"))
    await session.flush()
    with pytest.raises(admin.Refused, match="passt auf mehrere"):
        await admin.delete_player(session, "Ben", group=None, apply=False)
    res = await admin.delete_player(session, "Ben", group="Montagsrunde", apply=False)
    assert "Würde löschen" in res.lines[0]
    ben = await session.scalar(
        select(Player).where(Player.group_id == group.id, Player.display_name == "Ben")
    )
    res = await admin.delete_player(session, str(ben.id)[:8], group=None, apply=False)
    assert str(ben.id)[:8] in res.lines[0]
    with pytest.raises(admin.Refused, match="Keine Gruppe"):
        await admin.delete_player(session, "Ben", group="Gibtsnicht", apply=False)


async def test_delete_tournament_with_guests(client, session):
    _, _, t = await five_player_tournament(client, session)
    dry = await admin.delete_tournament(session, t["id"][:8], group=None, apply=False)
    assert not dry.changed and any("1 Gäste" in line for line in dry.lines)
    assert await count(session, Tournament) == 1

    done = await admin.delete_tournament(session, "dsk", group=None, apply=True)
    assert done.changed
    assert await count(session, Tournament) == 0
    assert await session.scalar(select(Player).where(Player.display_name == "Gina")) is None
    # danach lassen sich die vorgemerkten Testspieler löschen
    res = await admin.delete_player(session, "Ben", group=None, apply=True)
    assert res.changed


async def test_invite_link_for_reserved_player(client, session):
    _, _, ids = await admin_group(client, session, reserved=("Andreas",))
    res = await admin.invite_link(session, "andreas", group=None, days=30)
    assert res.changed
    url = res.lines[1]
    assert "/einladung/" in url
    inv = await session.get(Invitation, hash_token(url.rsplit("/", 1)[1]))
    assert inv is not None and inv.player_id == uuid.UUID(ids[0]) and inv.max_uses == 1
    assert inv.created_by is not None  # Admin der Gruppe

    info = (await client.get(f"/api/v1/invitations/{url.rsplit('/', 1)[1]}")).json()
    assert info["player_name"] == "Andreas"
    with pytest.raises(admin.Refused, match="nur für Spieler ohne Konto"):
        await admin.invite_link(session, "Peter", group=None, days=None)


def test_parse_args():
    args = admin.parse_args(["delete-player", "Ben", "--group", "Draft-Runde", "--apply"])
    assert (args.cmd, args.ref, args.group, args.apply) == (
        "delete-player",
        "Ben",
        "Draft-Runde",
        True,
    )
    assert admin.parse_args(["delete-tournament", "3f2a"]).apply is False
    assert admin.parse_args(["invite-link", "Andreas", "--days", "30"]).days == 30
