"""Persönlicher Einladungslink übernimmt einen vorgemerkten Spieler (ADR-0015)."""

from tests.api.helpers import is_problem, login
from tests.db.factories import make_group, make_user
from topstack.db.models import Player, TournamentEntry
from topstack.db.repo import groups


async def setup(client, session):
    group = await make_group(session, "Draft-Runde")
    peter = await make_user(session, "Peter")
    await groups.add_member(session, group_id=group.id, user=peter, role="admin")
    await login(client, session, peter)
    ben = (
        await client.post(f"/api/v1/groups/{group.id}/players", json={"display_name": "Ben"})
    ).json()
    t = (
        await client.post(f"/api/v1/groups/{group.id}/tournaments", json={"set_code": "DSK"})
    ).json()
    await client.post(f"/api/v1/tournaments/{t['id']}/entries", json={"player_ids": [ben["id"]]})
    invite = (
        await client.post(f"/api/v1/groups/{group.id}/invitations", json={"player_id": ben["id"]})
    ).json()
    return group, ben, t, invite


async def test_friend_takes_over_reserved_player(client, session, mailer):
    group, ben, t, invite = await setup(client, session)
    assert invite["max_uses"] == 1
    client.cookies.clear()

    info = (await client.get(f"/api/v1/invitations/{invite['token']}")).json()
    assert info["player_name"] == "Ben"

    await client.post(
        "/api/v1/auth/magic-link", json={"email": "ben@example.org", "invitation": invite["token"]}
    )
    r = await client.post(
        "/api/v1/auth/magic-link/verify",
        json={"token": mailer.last_link_token(), "invitation": invite["token"]},
    )
    assert r.status_code == 200, r.text
    me = r.json()
    assert me["display_name"] == "Ben"  # Name vom vorgemerkten Spieler
    assert me["groups"][0]["player_id"] == ben["id"]  # derselbe Spieler, keine Kopie

    player = await session.get(Player, ben["id"])
    await session.refresh(player)
    assert player.kind == "member"
    assert str(player.app_user_id) == me["id"]
    entry = await session.get(TournamentEntry, (t["id"], player.id))
    assert entry is not None and entry.status == "accepted"  # Turnierteilnahme bleibt


async def test_personal_link_works_only_once(client, session):
    group, ben, _, invite = await setup(client, session)
    first = await make_user(session, "Ben echt")
    client.cookies.clear()
    await login(client, session, first)
    assert (await client.post(f"/api/v1/invitations/{invite['token']}/accept")).status_code == 200

    second = await make_user(session, "Jemand")
    client.cookies.clear()
    await login(client, session, second)
    assert is_problem(await client.post(f"/api/v1/invitations/{invite['token']}/accept"), 410)


async def test_personal_link_only_for_reserved(client, session):
    group = await make_group(session)
    peter = await make_user(session, "Peter")
    me = await groups.add_member(session, group_id=group.id, user=peter, role="admin")
    await login(client, session, peter)
    r = await client.post(f"/api/v1/groups/{group.id}/invitations", json={"player_id": str(me.id)})
    assert is_problem(r, 409)
