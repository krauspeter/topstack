"""Turnier vorbereiten (UC-03 bis UC-07, TC-10 bis TC-19)."""

import uuid
from datetime import date

import pytest
from sqlalchemy import select

from tests.api.helpers import is_problem, login
from tests.db.factories import make_group, make_user
from topstack.db.models import AppUser, Player, Tournament
from topstack.db.repo import groups

pytestmark = pytest.mark.usefixtures("client")


async def admin_group(client, session, *, reserved=()):
    """Gruppe mit Peter als Admin (angemeldet) und vorgemerkten Spielern."""
    group = await make_group(session, "Draft-Runde")
    peter = await make_user(session, "Peter")
    await groups.add_member(session, group_id=group.id, user=peter, role="admin")
    await login(client, session, peter)
    ids = []
    for name in reserved:
        r = await client.post(f"/api/v1/groups/{group.id}/players", json={"display_name": name})
        assert r.status_code == 201, r.text
        ids.append(r.json()["id"])
    return group, peter, ids


async def start(client, group, set_code="dsk"):
    return await client.post(f"/api/v1/groups/{group.id}/tournaments", json={"set_code": set_code})


async def as_user(client, session, user: AppUser):
    client.cookies.clear()
    await login(client, session, user)


# ---------------------------------------------------------------------------
# Spieler ohne Konto (ADR-0015)
# ---------------------------------------------------------------------------


async def test_admin_creates_reserved_players(client, session):
    group, _, _ = await admin_group(client, session, reserved=("Ben", "Chris"))
    players = (await client.get(f"/api/v1/groups/{group.id}/players")).json()
    assert [(p["display_name"], p["kind"], p["is_me"]) for p in players] == [
        ("Ben", "reserved", False),
        ("Chris", "reserved", False),
        ("Peter", "member", True),
    ]
    dup = await client.post(f"/api/v1/groups/{group.id}/players", json={"display_name": "ben"})
    assert is_problem(dup, 409)


async def test_member_cannot_create_reserved(client, session):
    group = await make_group(session)
    user = await make_user(session)
    await groups.add_member(session, group_id=group.id, user=user)
    await login(client, session, user)
    r = await client.post(f"/api/v1/groups/{group.id}/players", json={"display_name": "X"})
    assert is_problem(r, 403)


# ---------------------------------------------------------------------------
# Starten (UC-03)
# ---------------------------------------------------------------------------


async def test_start_tournament(client, session):
    group, peter, _ = await admin_group(client, session)
    season = await groups.create_season(
        session, group_id=group.id, name="S", starts_on=date(2020, 1, 1), ends_on=None
    )
    r = await start(client, group)
    assert r.status_code == 201, r.text
    t = r.json()
    assert t["set_code"] == "dsk"  # Schreibweise bleibt (Name des Drafts)
    assert t["status"] == "setup"
    assert t["group_name"] == "Draft-Runde"
    assert [(e["display_name"], e["status"], e["is_me"]) for e in t["entries"]] == [
        ("Peter", "accepted", True)
    ]
    assert t["actions"] == ["invite", "respond", "seat", "cancel"]
    stored = await session.get(Tournament, t["id"])
    assert stored.season_id == season.id


async def test_set_code_required_and_validated(client, session):  # TC-10
    group, _, _ = await admin_group(client, session)
    assert is_problem(await client.post(f"/api/v1/groups/{group.id}/tournaments", json={}), 422)
    assert is_problem(await start(client, group, "D"), 422)


async def test_only_one_open_tournament(client, session):  # TC-11
    group, _, _ = await admin_group(client, session)
    first = (await start(client, group)).json()
    assert is_problem(await start(client, group, "FDN"), 409)
    assert (await client.post(f"/api/v1/tournaments/{first['id']}/cancel")).json()["status"] == (
        "cancelled"
    )
    assert (await start(client, group, "FDN")).status_code == 201


async def test_outsider_sees_404(client, session):
    group, _, _ = await admin_group(client, session)
    t = (await start(client, group)).json()
    await as_user(client, session, await make_user(session))
    assert is_problem(await client.get(f"/api/v1/tournaments/{t['id']}"), 404)
    assert is_problem(await start(client, group), 404)


async def test_list_tournaments_open_first(client, session):
    group, _, _ = await admin_group(client, session)
    old = (await start(client, group, "MKM")).json()
    await client.post(f"/api/v1/tournaments/{old['id']}/cancel")
    new = (await start(client, group, "FDN")).json()
    rows = (await client.get(f"/api/v1/groups/{group.id}/tournaments")).json()
    assert [r["id"] for r in rows] == [new["id"], old["id"]]
    assert rows[0]["players"] == 1


# ---------------------------------------------------------------------------
# Einladen, Zusage, Entfernen (UC-04)
# ---------------------------------------------------------------------------


async def test_invite_member_and_respond(client, session):  # TC-12
    group, peter, _ = await admin_group(client, session)
    anna = await make_user(session, "Anna")
    anna_player = await groups.add_member(session, group_id=group.id, user=anna)
    t = (await start(client, group)).json()

    r = await client.post(
        f"/api/v1/tournaments/{t['id']}/entries", json={"player_ids": [str(anna_player.id)]}
    )
    statuses = {e["display_name"]: e["status"] for e in r.json()["entries"]}
    assert statuses == {"Peter": "accepted", "Anna": "invited"}

    await as_user(client, session, anna)
    r = await client.put(f"/api/v1/tournaments/{t['id']}/entries/me", json={"accept": False})
    assert {e["display_name"]: e["status"] for e in r.json()["entries"]}["Anna"] == "declined"
    r = await client.put(f"/api/v1/tournaments/{t['id']}/entries/me", json={"accept": True})
    assert {e["display_name"]: e["status"] for e in r.json()["entries"]}["Anna"] == "accepted"


async def test_reserved_players_are_accepted_directly(client, session):
    group, _, (ben, chris) = await admin_group(client, session, reserved=("Ben", "Chris"))
    t = (await start(client, group)).json()
    r = await client.post(
        f"/api/v1/tournaments/{t['id']}/entries", json={"player_ids": [ben, chris]}
    )
    assert {e["display_name"]: e["status"] for e in r.json()["entries"]} == {
        "Ben": "accepted",
        "Chris": "accepted",
        "Peter": "accepted",
    }


async def test_remove_before_seating(client, session):  # TC-14
    group, _, (ben,) = await admin_group(client, session, reserved=("Ben",))
    t = (await start(client, group)).json()
    await client.post(f"/api/v1/tournaments/{t['id']}/entries", json={"player_ids": [ben]})
    r = await client.delete(f"/api/v1/tournaments/{t['id']}/entries/{ben}")
    assert [e["display_name"] for e in r.json()["entries"]] == ["Peter"]
    # wieder einladen geht
    r = await client.post(f"/api/v1/tournaments/{t['id']}/entries", json={"player_ids": [ben]})
    assert len(r.json()["entries"]) == 2
    starter = t["started_by"]
    assert is_problem(await client.delete(f"/api/v1/tournaments/{t['id']}/entries/{starter}"), 409)


async def test_invite_foreign_player_is_404(client, session):
    group, _, _ = await admin_group(client, session)
    other = await make_group(session)
    stranger = Player(group_id=other.id, kind="reserved", display_name="X")
    session.add(stranger)
    await session.flush()
    t = (await start(client, group)).json()
    r = await client.post(
        f"/api/v1/tournaments/{t['id']}/entries", json={"player_ids": [str(stranger.id)]}
    )
    assert is_problem(r, 404)


# ---------------------------------------------------------------------------
# Gäste (UC-05)
# ---------------------------------------------------------------------------


async def test_guest_joins_with_link(client, session):  # TC-13
    group, _, _ = await admin_group(client, session)
    t = (await start(client, group)).json()
    link = (await client.post(f"/api/v1/tournaments/{t['id']}/guest-link")).json()
    assert link["url"].endswith(f"/gast/{link['token']}")

    client.cookies.clear()
    info = (await client.get(f"/api/v1/guest/{link['token']}")).json()
    assert info == {"group_name": "Draft-Runde", "set_code": "dsk", "open": True}
    r = await client.post(f"/api/v1/guest/{link['token']}", json={"display_name": " Gast Gina "})
    assert r.status_code == 201, r.text
    assert r.json()["display_name"] == "Gast Gina"
    assert r.json()["tournament_id"] == t["id"]

    guest = await session.get(Player, r.json()["player_id"])
    assert guest.kind == "guest" and guest.app_user_id is None
    dup = await client.post(f"/api/v1/guest/{link['token']}", json={"display_name": "gast gina"})
    assert is_problem(dup, 409)
    assert is_problem(await client.get("/api/v1/guest/falsch-falsch"), 404)


async def test_guests_not_in_player_list(client, session):
    group, _, _ = await admin_group(client, session)
    t = (await start(client, group)).json()
    link = (await client.post(f"/api/v1/tournaments/{t['id']}/guest-link")).json()
    await client.post(f"/api/v1/guest/{link['token']}", json={"display_name": "Gina"})
    names = [
        p["display_name"] for p in (await client.get(f"/api/v1/groups/{group.id}/players")).json()
    ]
    assert names == ["Peter"]


# ---------------------------------------------------------------------------
# Auslosung (UC-06)
# ---------------------------------------------------------------------------


async def five_player_tournament(client, session):
    group, peter, reserved = await admin_group(client, session, reserved=("Ben", "Chris", "Dora"))
    t = (await start(client, group)).json()
    await client.post(f"/api/v1/tournaments/{t['id']}/entries", json={"player_ids": reserved})
    link = (await client.post(f"/api/v1/tournaments/{t['id']}/guest-link")).json()
    await client.post(f"/api/v1/guest/{link['token']}", json={"display_name": "Gina"})
    return group, peter, t


async def test_seating_five_players(client, session):  # TC-15
    group, _, t = await five_player_tournament(client, session)
    anna = await make_user(session, "Anna")
    anna_player = await groups.add_member(session, group_id=group.id, user=anna)
    await client.post(
        f"/api/v1/tournaments/{t['id']}/entries", json={"player_ids": [str(anna_player.id)]}
    )

    r = await client.post(f"/api/v1/tournaments/{t['id']}/seating")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "seated"
    seated = [e for e in body["entries"] if e["status"] == "accepted"]
    assert sorted(e["seat_no"] for e in seated) == [1, 2, 3, 4, 5]
    assert [e["seat_no"] for e in body["entries"][:5]] == [1, 2, 3, 4, 5]  # nach Platz sortiert
    anna_entry = next(e for e in body["entries"] if e["display_name"] == "Anna")
    assert anna_entry["status"] == "declined" and anna_entry["seat_no"] is None  # Anmeldung zu
    assert body["seating"]["draw"] == 1
    assert 0 <= body["seating"]["seed"] < 2**31


async def test_reseat(client, session):  # TC-16
    _, _, t = await five_player_tournament(client, session)
    await client.post(f"/api/v1/tournaments/{t['id']}/seating")
    second = (await client.post(f"/api/v1/tournaments/{t['id']}/seating")).json()
    assert second["seating"]["draw"] == 2
    assert sorted(e["seat_no"] for e in second["entries"]) == [1, 2, 3, 4, 5]


async def test_registration_closed_after_seating(client, session):  # TC-17
    group, _, t = await five_player_tournament(client, session)
    link = (await client.post(f"/api/v1/tournaments/{t['id']}/guest-link")).json()
    await client.post(f"/api/v1/tournaments/{t['id']}/seating")
    late = await client.post(f"/api/v1/groups/{group.id}/players", json={"display_name": "Spät"})
    r = await client.post(
        f"/api/v1/tournaments/{t['id']}/entries", json={"player_ids": [late.json()["id"]]}
    )
    assert is_problem(r, 409)
    assert is_problem(await client.post(f"/api/v1/tournaments/{t['id']}/guest-link"), 409)
    client.cookies.clear()
    assert (await client.get(f"/api/v1/guest/{link['token']}")).json()["open"] is False
    assert is_problem(
        await client.post(f"/api/v1/guest/{link['token']}", json={"display_name": "Zu spät"}), 409
    )


async def test_only_starter_seats(client, session):  # TC-19
    group, _, t = await five_player_tournament(client, session)
    anna = await make_user(session, "Anna")
    await groups.add_member(session, group_id=group.id, user=anna)
    await as_user(client, session, anna)
    assert is_problem(await client.post(f"/api/v1/tournaments/{t['id']}/seating"), 403)


async def test_seating_needs_two_players(client, session):
    group, _, _ = await admin_group(client, session)
    t = (await start(client, group)).json()
    assert is_problem(await client.post(f"/api/v1/tournaments/{t['id']}/seating"), 409)


async def test_start_draft(client, session):
    _, _, t = await five_player_tournament(client, session)
    assert is_problem(await client.post(f"/api/v1/tournaments/{t['id']}/draft"), 409)
    await client.post(f"/api/v1/tournaments/{t['id']}/seating")
    r = await client.post(f"/api/v1/tournaments/{t['id']}/draft")
    assert r.json()["status"] == "drafting"
    assert is_problem(await client.post(f"/api/v1/tournaments/{t['id']}/seating"), 409)


# ---------------------------------------------------------------------------
# Farben (UC-07)
# ---------------------------------------------------------------------------


async def test_colors(client, session):  # TC-18
    _, peter, t = await five_player_tournament(client, session)
    me = t["my_player_id"]
    url = f"/api/v1/tournaments/{t['id']}/entries/{me}/colors"
    assert is_problem(await client.put(url, json={"colors": "WU"}), 409)  # noch nicht ausgelost

    await client.post(f"/api/v1/tournaments/{t['id']}/seating")
    r = await client.put(url, json={"colors": "uw"})
    assert next(e for e in r.json()["entries"] if e["is_me"])["colors"] == "WU"
    r = await client.put(url, json={"colors": ""})
    assert next(e for e in r.json()["entries"] if e["is_me"])["colors"] == ""
    assert is_problem(await client.put(url, json={"colors": "X"}), 422)

    # Starter meldet für Gast und vorgemerkten Spieler
    gina = next(e for e in r.json()["entries"] if e["display_name"] == "Gina")
    ben = next(e for e in r.json()["entries"] if e["display_name"] == "Ben")
    for entry, colors in ((gina, "BR"), (ben, "G")):
        r = await client.put(
            f"/api/v1/tournaments/{t['id']}/entries/{entry['player_id']}/colors",
            json={"colors": colors},
        )
        assert r.status_code == 200, r.text
    colors = {e["display_name"]: e["colors"] for e in r.json()["entries"]}
    assert colors["Gina"] == "BR" and colors["Ben"] == "G"


async def test_member_cannot_report_for_guest(client, session):
    group, _, t = await five_player_tournament(client, session)
    anna = await make_user(session, "Anna")
    anna_player = await groups.add_member(session, group_id=group.id, user=anna)
    await client.post(
        f"/api/v1/tournaments/{t['id']}/entries", json={"player_ids": [str(anna_player.id)]}
    )
    t = (await client.post(f"/api/v1/tournaments/{t['id']}/seating")).json()
    gina = next(e for e in t["entries"] if e["display_name"] == "Gina")
    await as_user(client, session, anna)
    r = await client.put(
        f"/api/v1/tournaments/{t['id']}/entries/{gina['player_id']}/colors", json={"colors": "U"}
    )
    assert is_problem(r, 403)


# ---------------------------------------------------------------------------
# Abbruch vor Runde 1
# ---------------------------------------------------------------------------


async def test_participant_cannot_cancel(client, session):
    group, _, _ = await admin_group(client, session)
    t = (await start(client, group)).json()
    anna = await make_user(session, "Anna")
    anna_player = await groups.add_member(session, group_id=group.id, user=anna)
    await client.post(
        f"/api/v1/tournaments/{t['id']}/entries", json={"player_ids": [str(anna_player.id)]}
    )
    await as_user(client, session, anna)
    await client.put(f"/api/v1/tournaments/{t['id']}/entries/me", json={"accept": True})
    assert is_problem(await client.post(f"/api/v1/tournaments/{t['id']}/cancel"), 403)
    stored = await session.scalar(select(Tournament).where(Tournament.id == t["id"]))
    assert stored.status == "setup"


# ---------------------------------------------------------------------------
# Name des Drafts, Löschen (Anpassungen vom 20.11.2026)
# ---------------------------------------------------------------------------


async def test_draft_name_up_to_20_chars(client, session):
    group, _, _ = await admin_group(client, session)
    r = await start(client, group, "  Mirrodin   Besieged ")
    assert r.status_code == 201, r.text
    assert r.json()["set_code"] == "Mirrodin Besieged"  # Schreibweise bleibt
    await client.post(f"/api/v1/tournaments/{r.json()['id']}/cancel")
    assert is_problem(await start(client, group, "x" * 21), 422)
    assert is_problem(await start(client, group, "A"), 422)
    assert is_problem(await start(client, group, "<script>"), 422)


async def test_delete_cancelled_tournament_with_guests(client, session):
    group, _, (ben,) = await admin_group(client, session, reserved=("Ben",))
    t = (await start(client, group)).json()
    await client.post(f"/api/v1/tournaments/{t['id']}/entries", json={"player_ids": [ben]})
    link = (await client.post(f"/api/v1/tournaments/{t['id']}/guest-link")).json()
    guest = (
        await client.post(f"/api/v1/guest/{link['token']}", json={"display_name": "Gina"})
    ).json()

    assert is_problem(await client.delete(f"/api/v1/tournaments/{t['id']}"), 409)  # erst abbrechen
    cancelled = (await client.post(f"/api/v1/tournaments/{t['id']}/cancel")).json()
    assert cancelled["actions"] == ["delete"]
    r = await client.delete(f"/api/v1/tournaments/{t['id']}")
    assert r.status_code == 204

    assert await session.get(Tournament, uuid.UUID(t["id"])) is None
    assert await session.get(Player, uuid.UUID(guest["player_id"])) is None  # Gast weg
    assert await session.get(Player, uuid.UUID(ben)) is not None  # Spieler der Gruppe bleibt
    assert (await client.get(f"/api/v1/groups/{group.id}/tournaments")).json() == []


async def test_participant_cannot_delete(client, session):
    group, _, _ = await admin_group(client, session)
    t = (await start(client, group)).json()
    anna = await make_user(session, "Anna")
    anna_player = await groups.add_member(session, group_id=group.id, user=anna)
    await client.post(
        f"/api/v1/tournaments/{t['id']}/entries", json={"player_ids": [str(anna_player.id)]}
    )
    await client.post(f"/api/v1/tournaments/{t['id']}/cancel")
    await as_user(client, session, anna)
    assert is_problem(await client.delete(f"/api/v1/tournaments/{t['id']}"), 403)
