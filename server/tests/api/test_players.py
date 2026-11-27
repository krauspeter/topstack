"""Einladungen und Spieler (Phase 5, AP-2): Gruppenlinks, persönliche Links, Gast wird Profil,
Spieler zusammenführen. Testfälle TC-140 bis TC-144."""

from sqlalchemy import func, select

from tests.api.helpers import is_problem, login
from tests.db.factories import make_group, make_member, make_tournament, make_user
from topstack.db.models import (
    AppUser,
    Match,
    Membership,
    Player,
    Round,
    Tournament,
    TournamentEntry,
)
from topstack.db.repo import groups as repo
from topstack.scripts import admin
from topstack.services import invitations


async def user_of(session, player) -> AppUser:
    return await session.get(AppUser, player.app_user_id)


async def test_member_creates_lists_and_revokes_links(client, session):  # TC-140
    group = await make_group(session)
    admin_p = await make_member(session, group, role="admin", name="Anna")
    ben = await make_member(session, group, name="Ben")
    base = f"/api/v1/groups/{group.id}/invitations"

    await login(client, session, await user_of(session, ben))
    r = await client.post(base, json={})
    assert r.status_code == 201
    token = r.json()["token"]
    links = (await client.get(base)).json()
    assert [(link["created_by"], link["mine"], link["max_uses"]) for link in links] == [
        ("Ben", True, None)
    ]

    # Das Admin sieht alle Links, Ben nur seine eigenen
    await login(client, session, await user_of(session, admin_p))
    await client.post(base, json={"max_uses": 2})
    assert len((await client.get(base)).json()) == 2
    await login(client, session, await user_of(session, ben))
    assert len((await client.get(base)).json()) == 1

    # Ben darf den Link des Admins nicht zurückziehen, seinen eigenen schon
    await login(client, session, await user_of(session, admin_p))
    admin_link = next(x for x in (await client.get(base)).json() if x["mine"])
    await login(client, session, await user_of(session, ben))
    assert is_problem(await client.delete(f"{base}/{admin_link['id']}"), 404)
    assert (await client.delete(f"{base}/{links[0]['id']}")).status_code == 204
    assert (await client.get(base)).json() == []
    assert is_problem(await client.get(f"/api/v1/invitations/{token}"), 410)


async def test_personal_link_only_for_admins(client, session):  # TC-141
    group = await make_group(session)
    ben = await make_member(session, group)
    reserved = await repo.add_guest(session, group_id=group.id, display_name="Chris")
    reserved.kind = "reserved"
    await session.flush()
    await login(client, session, await user_of(session, ben))
    r = await client.post(
        f"/api/v1/groups/{group.id}/invitations", json={"player_id": str(reserved.id)}
    )
    assert is_problem(r, 403)


async def test_guest_gets_claim_link_and_becomes_member(client, session):  # TC-142
    t = await make_tournament(session, players=2)
    starter = await session.get(Player, t.started_by)
    await login(client, session, await user_of(session, starter))
    link = (await client.post(f"/api/v1/tournaments/{t.id}/guest-link")).json()

    client.cookies.clear()
    joined = await client.post(f"/api/v1/guest/{link['token']}", json={"display_name": "Gina"})
    assert joined.status_code == 201, joined.text
    claim_url = joined.json()["claim_url"]
    assert "/einladung/" in claim_url
    claim = claim_url.rsplit("/", 1)[1]
    info = (await client.get(f"/api/v1/invitations/{claim}")).json()
    assert info["player_name"] == "Gina"

    gina = await make_user(session, "Gina")
    await login(client, session, gina)
    accepted = await client.post(f"/api/v1/invitations/{claim}/accept")
    assert accepted.status_code == 200, accepted.text
    player = await session.get(Player, joined.json()["player_id"], populate_existing=True)
    assert (player.kind, player.app_user_id) == ("member", gina.id)
    assert await repo.get_membership(session, group_id=t.group_id, user_id=gina.id)
    # Der Link ist danach verbraucht
    assert is_problem(await client.get(f"/api/v1/invitations/{claim}"), 410)


async def _finished_match(session, t: Tournament, a: Player, b: Player) -> Match:
    rnd = Round(tournament_id=t.id, number=1, status="finished")
    session.add(rnd)
    await session.flush()
    m = Match(
        tournament_id=t.id,
        round_id=rnd.id,
        player_a_id=a.id,
        player_b_id=b.id,
        status="finished",
        games_a=2,
        games_b=1,
        result_by=a.id,
    )
    session.add(m)
    await session.flush()
    return m


async def test_merge_guest_into_member(client, session):  # TC-143
    group = await make_group(session)
    admin_p = await make_member(session, group, role="admin")
    ben = await make_member(session, group, name="Ben")
    guest = await repo.add_guest(session, group_id=group.id, display_name="Ben B.")
    t = await make_tournament(session, group=group, players=0, status="finished")
    other = await make_member(session, group, name="Chris")
    for p in (guest, other):
        session.add(TournamentEntry(tournament_id=t.id, player_id=p.id, status="accepted"))
    await session.flush()
    m = await _finished_match(session, t, guest, other)
    await login(client, session, await user_of(session, admin_p))
    url = f"/api/v1/groups/{group.id}/players/merge"
    body = {"source_id": str(guest.id), "target_id": str(ben.id)}

    preview = await client.post(url, json=body)
    assert preview.status_code == 200
    assert preview.json() == {
        "source": "Ben B.",
        "target": "Ben",
        "tournaments": 1,
        "matches": 1,
        "merged": False,
    }
    assert await session.get(Player, guest.id) is not None

    done = await client.post(url, json={**body, "apply": True})
    assert done.status_code == 200 and done.json()["merged"]
    session.expunge_all()
    assert await session.get(Player, guest.id) is None
    stored = await session.get(Match, m.id)
    assert (stored.player_a_id, stored.result_by) == (ben.id, ben.id)
    assert await session.get(TournamentEntry, (t.id, ben.id)) is not None

    # Gäste stehen jetzt in der Liste für Admins, Ben B. ist weg
    everyone = (await client.get(f"/api/v1/groups/{group.id}/players?all=true")).json()
    assert "Ben B." not in [p["display_name"] for p in everyone]


async def test_merge_refused(client, session):  # TC-144
    group = await make_group(session)
    admin_p = await make_member(session, group, role="admin")
    ben = await make_member(session, group, name="Ben")
    guest = await repo.add_guest(session, group_id=group.id, display_name="Ben B.")
    t = await make_tournament(session, group=group, players=0, status="finished")
    t.set_code = "MKM"
    for p in (guest, ben):
        session.add(TournamentEntry(tournament_id=t.id, player_id=p.id, status="accepted"))
    await session.flush()
    await login(client, session, await user_of(session, admin_p))
    url = f"/api/v1/groups/{group.id}/players/merge"

    same = await client.post(url, json={"source_id": str(guest.id), "target_id": str(ben.id)})
    assert is_problem(same, 409) and "MKM" in same.json()["detail"]
    account = await client.post(url, json={"source_id": str(ben.id), "target_id": str(guest.id)})
    assert is_problem(account, 409) and "Konto" in account.json()["detail"]

    elsewhere = await make_group(session)
    stranger = await repo.add_guest(session, group_id=elsewhere.id, display_name="X")
    r = await client.post(url, json={"source_id": str(stranger.id), "target_id": str(ben.id)})
    assert is_problem(r, 409)

    await login(client, session, await user_of(session, ben))
    r = await client.post(url, json={"source_id": str(guest.id), "target_id": str(ben.id)})
    assert is_problem(r, 403)
    assert is_problem(await client.get(f"/api/v1/groups/{group.id}/players?all=true"), 403)


async def test_admin_script_merge_player(session):
    group = await make_group(session, "Draft-Runde")
    await make_member(session, group, name="Ben")
    await repo.add_guest(session, group_id=group.id, display_name="Gina")
    dry = await admin.merge_player(session, "Gina", "Ben", group="Draft-Runde", apply=False)
    assert not dry.changed and "Würde zusammenführen" in dry.lines[0]
    done = await admin.merge_player(session, "Gina", "Ben", group="Draft-Runde", apply=True)
    assert done.changed
    left = await session.scalar(
        select(func.count()).select_from(Player).where(Player.display_name == "Gina")
    )
    assert left == 0


async def test_claim_link_for_member_with_account_keeps_both(client, session):
    """Hat der Gast schon ein Konto in der Gruppe, bleibt alles; das Admin führt zusammen."""
    group = await make_group(session)
    ben = await make_member(session, group, name="Ben")
    guest = await repo.add_guest(session, group_id=group.id, display_name="Ben B.")
    token = await invitations.guest_claim(session, guest)
    user = await user_of(session, ben)
    inv = await invitations.get_valid(session, token)
    player, joined = await invitations.accept(session, inv, user)
    assert (player.id, joined) == (ben.id, False)
    assert (await session.get(Player, guest.id)).kind == "guest"
    rows = await session.scalar(
        select(func.count()).select_from(Membership).where(Membership.app_user_id == user.id)
    )
    assert rows == 1
