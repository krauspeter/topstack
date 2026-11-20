"""Turnier spielen (UC-08, UC-09, UC-12 bis UC-17, TC-20 bis TC-31)."""

import pytest
from sqlalchemy import select

from tests.api.helpers import is_problem
from tests.api.test_tournaments import admin_group, as_user, five_player_tournament, start
from tests.db.factories import make_user
from topstack.db.models import MatchCorrection, Player
from topstack.db.repo import groups

pytestmark = pytest.mark.usefixtures("client")


async def drafting(client, session):
    """Fünf Spieler (Peter, Ben, Chris, Dora, Gast Gina), Draft läuft."""
    group, peter, t = await five_player_tournament(client, session)
    await client.post(f"/api/v1/tournaments/{t['id']}/seating")
    r = await client.post(f"/api/v1/tournaments/{t['id']}/draft")
    return group, peter, r.json()


async def set_all_colors(client, t):
    for e in t["entries"]:
        r = await client.put(
            f"/api/v1/tournaments/{t['id']}/entries/{e['player_id']}/colors", json={"colors": "G"}
        )
        assert r.status_code == 200, r.text


async def running(client, session):
    group, peter, t = await drafting(client, session)
    await set_all_colors(client, t)
    r = await client.post(f"/api/v1/tournaments/{t['id']}/rounds/next", json={})
    assert r.status_code == 200, r.text
    return group, peter, r.json()


async def report(client, t, match, a, b, drawn=0, version=None):
    body = {"games_a": a, "games_b": b, "games_drawn": drawn}
    if version is not None:
        body["version"] = version
    return await client.put(
        f"/api/v1/tournaments/{t['id']}/matches/{match['id']}/result", json=body
    )


def current_matches(t):
    rnd = next(r for r in t["rounds"] if r["number"] == t["current_round"])
    return rnd["matches"]


async def play_current(client, t, a=2, b=0):
    for m in current_matches(t):
        if m["status"] != "finished":
            r = await report(client, t, m, a, b)
            assert r.status_code == 200, r.text
            t = r.json()
    return t


# ---------------------------------------------------------------------------
# Runde 1 und Spielplan (UC-08)
# ---------------------------------------------------------------------------


async def test_round_one_warns_about_missing_colors(client, session):  # TC-20
    _, _, t = await drafting(client, session)
    r = await client.post(f"/api/v1/tournaments/{t['id']}/rounds/next", json={})
    assert is_problem(r, 409)
    body = r.json()
    assert body["code"] == "missing_colors"
    assert body["names"] == ["Ben", "Chris", "Dora", "Gina", "Peter"]

    r = await client.post(f"/api/v1/tournaments/{t['id']}/rounds/next", json={"confirm": True})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "running"


async def test_schedule_round_robin_with_bye(client, session):  # TC-21
    _, _, t = await running(client, session)
    assert t["status"] == "running"
    assert t["current_round"] == 1
    assert len(t["rounds"]) == 5  # 5 Spieler: 5 Runden mit je einer Pause
    assert [r["status"] for r in t["rounds"]] == ["running"] + ["planned"] * 4
    pairs = set()
    byes = []
    for rnd in t["rounds"]:
        assert len(rnd["matches"]) == 2
        byes.append(rnd["bye"])
        for m in rnd["matches"]:
            pairs.add(frozenset((m["player_a"], m["player_b"])))
    assert len(pairs) == 10  # jeder gegen jeden genau einmal
    assert sorted(byes) == ["Ben", "Chris", "Dora", "Gina", "Peter"]
    assert t["rounds_left"] == 4
    assert [s["match_points"] for s in t["standings"]] == [0] * 5


async def test_only_participants_start_rounds(client, session):
    group, _, t = await drafting(client, session)
    anna = await make_user(session, "Anna")
    await groups.add_member(session, group_id=group.id, user=anna)
    await as_user(client, session, anna)
    r = await client.post(f"/api/v1/tournaments/{t['id']}/rounds/next", json={"confirm": True})
    assert is_problem(r, 403)


# ---------------------------------------------------------------------------
# Ergebnisse (UC-12 bis UC-14)
# ---------------------------------------------------------------------------


async def test_report_and_correct_result(client, session):  # TC-22, TC-23
    _, _, t = await running(client, session)
    m = current_matches(t)[0]
    r = await report(client, t, m, 2, 1)
    assert r.status_code == 200, r.text
    m2 = next(x for x in current_matches(r.json()) if x["id"] == m["id"])
    assert (m2["status"], m2["games_a"], m2["games_b"], m2["version"]) == ("finished", 2, 1, 1)

    # Korrektur ohne Version oder mit veralteter Version scheitert
    assert is_problem(await report(client, t, m, 1, 2), 409)
    assert is_problem(await report(client, t, m, 1, 2, version=0), 409)
    r = await report(client, t, m, 1, 2, version=1)
    assert r.status_code == 200, r.text
    m3 = next(x for x in current_matches(r.json()) if x["id"] == m["id"])
    assert (m3["games_a"], m3["games_b"], m3["version"]) == (1, 2, 2)

    log = (await session.scalars(select(MatchCorrection))).all()
    assert len(log) == 1
    assert log[0].old_result == {"a": 2, "b": 1, "drawn": 0}
    assert log[0].new_result == {"a": 1, "b": 2, "drawn": 0}


async def test_invalid_results(client, session):
    _, _, t = await running(client, session)
    m = current_matches(t)[0]
    assert is_problem(await report(client, t, m, 2, 2), 422)
    assert is_problem(await report(client, t, m, 2, 1, drawn=1), 422)
    assert (await report(client, t, m, 3, 0)).status_code == 422


async def test_draw_counts_one_point(client, session):
    _, _, t = await running(client, session)
    m = current_matches(t)[0]
    t = (await report(client, t, m, 1, 1)).json()
    points = {s["display_name"]: s["match_points"] for s in t["standings"]}
    assert points[m["player_a"]] == 1 and points[m["player_b"]] == 1


async def test_cannot_report_future_match(client, session):
    _, _, t = await running(client, session)
    later = t["rounds"][2]["matches"][0]
    assert is_problem(await report(client, t, later, 2, 0), 409)


async def test_member_reports_only_own_match(client, session):  # TC-24
    group, peter, t = await drafting(client, session)
    anna = await make_user(session, "Anna")
    await groups.add_member(session, group_id=group.id, user=anna)
    # Anna ist kein Teilnehmer und nicht Starter: kein Eintragen
    await set_all_colors(client, t)
    t = (await client.post(f"/api/v1/tournaments/{t['id']}/rounds/next", json={})).json()
    await as_user(client, session, anna)
    m = current_matches(t)[0]
    assert is_problem(await report(client, t, m, 2, 0), 403)


# ---------------------------------------------------------------------------
# Nächste Runde und Vorziehen (UC-09, UC-15)
# ---------------------------------------------------------------------------


async def test_next_round_warns_about_open_matches(client, session):  # TC-25
    _, _, t = await running(client, session)
    r = await client.post(f"/api/v1/tournaments/{t['id']}/rounds/next", json={})
    assert is_problem(r, 409)
    assert r.json()["code"] == "open_matches" and r.json()["count"] == 2

    t = await play_current(client, t)
    assert t["open_in_current"] == 0
    r = await client.post(f"/api/v1/tournaments/{t['id']}/rounds/next", json={})
    assert r.status_code == 200, r.text
    t = r.json()
    assert t["current_round"] == 2
    assert [r["status"] for r in t["rounds"][:2]] == ["finished", "running"]


async def test_next_round_with_confirm_keeps_open_match(client, session):
    _, _, t = await running(client, session)
    open_match = current_matches(t)[0]
    t = (
        await client.post(f"/api/v1/tournaments/{t['id']}/rounds/next", json={"confirm": True})
    ).json()
    assert t["current_round"] == 2
    # offenes Match aus Runde 1 kann weiter eingetragen werden
    assert (await report(client, t, open_match, 2, 0)).status_code == 200


async def test_pull_forward_open_match(client, session):  # TC-26
    _, _, t = await running(client, session)
    first, second = current_matches(t)
    t = (await report(client, t, first, 2, 0)).json()
    bye = t["rounds"][0]["bye"]
    free = {first["player_a"], first["player_b"], bye}
    assert t["suggestion"] is not None
    suggested = next(m for r in t["rounds"] for m in r["matches"] if m["id"] == t["suggestion"])
    assert {suggested["player_a"], suggested["player_b"]} <= free

    r = await client.post(f"/api/v1/tournaments/{t['id']}/matches/{suggested['id']}/start")
    assert r.status_code == 200, r.text
    t = r.json()
    pulled = next(m for r in t["rounds"] for m in r["matches"] if m["id"] == suggested["id"])
    assert pulled["status"] == "running"
    assert (await report(client, t, pulled, 0, 2)).status_code == 200

    # Spieler aus dem laufenden Match sind nicht frei
    busy = next(
        m
        for r in t["rounds"]
        if r["status"] == "planned"
        for m in r["matches"]
        if second["player_a"] in (m["player_a"], m["player_b"]) and m["status"] == "scheduled"
    )
    r = await client.post(f"/api/v1/tournaments/{t['id']}/matches/{busy['id']}/start")
    assert is_problem(r, 409)


# ---------------------------------------------------------------------------
# Pause (UC-16)
# ---------------------------------------------------------------------------


async def test_pause_and_resume(client, session):  # TC-27
    _, _, t = await running(client, session)
    t = (await client.post(f"/api/v1/tournaments/{t['id']}/pause")).json()
    assert t["status"] == "paused"
    assert is_problem(await client.post(f"/api/v1/tournaments/{t['id']}/rounds/next", json={}), 409)
    # Ergebnisse dürfen in der Pause nachgetragen werden
    assert (await report(client, t, current_matches(t)[0], 2, 0)).status_code == 200
    t = (await client.post(f"/api/v1/tournaments/{t['id']}/resume")).json()
    assert t["status"] == "running"


# ---------------------------------------------------------------------------
# Abschluss (UC-17)
# ---------------------------------------------------------------------------


async def play_all(client, t, score=None):
    """Alle Runden durchspielen; ``score(match) -> (a, b)``."""
    while True:
        for m in current_matches(t):
            if m["status"] != "finished":
                a, b = score(m) if score else (2, 0)
                t = (await report(client, t, m, a, b)).json()
        if t["rounds_left"] == 0:
            return t
        t = (await client.post(f"/api/v1/tournaments/{t['id']}/rounds/next", json={})).json()


async def test_five_players_from_round_one_to_ceremony(client, session):  # TC-28
    _, _, t = await running(client, session)
    finish = await client.post(f"/api/v1/tournaments/{t['id']}/finish")
    assert is_problem(finish, 409) and finish.json()["code"] == "open_matches"

    order = ["Peter", "Ben", "Chris", "Dora", "Gina"]  # wer weiter vorne steht, gewinnt

    def score(m):
        return (2, 0) if order.index(m["player_a"]) < order.index(m["player_b"]) else (0, 2)

    t = await play_all(client, t, score)
    r = await client.post(f"/api/v1/tournaments/{t['id']}/finish")
    assert r.status_code == 200, r.text
    t = r.json()
    assert t["status"] == "finished"
    table = [(s["display_name"], s["final_place"], s["ranking_points"]) for s in t["standings"]]
    # 5 Spieler: Platz 1 = 5 + 2, Platz 2 = 4 + 1, dann 3, 2, 1
    assert table == [
        ("Peter", 1, 7),
        ("Ben", 2, 5),
        ("Chris", 3, 3),
        ("Dora", 4, 2),
        ("Gina", 5, 1),
    ]
    assert all(r["status"] == "finished" for r in t["rounds"])
    assert "finish" not in t["actions"]


async def test_full_tie_needs_roll(client, session):  # TC-29
    _, _, t = await running(client, session)
    t = await play_all(client, t, lambda m: (1, 1))  # alles Unentschieden
    r = await client.post(f"/api/v1/tournaments/{t['id']}/finish")
    assert is_problem(r, 409) and r.json()["code"] == "needs_roll"
    assert len(r.json()["names"]) == 5
    assert all(s["needs_roll"] for s in t["standings"])

    t = (await client.post(f"/api/v1/tournaments/{t['id']}/tiebreak-roll")).json()
    rolls = [s["roll"] for s in t["standings"]]
    assert len(set(rolls)) == 5 and all(1 <= x <= 20 for x in rolls)
    assert rolls == sorted(rolls, reverse=True)  # höherer Wurf steht vorne
    assert (await client.post(f"/api/v1/tournaments/{t['id']}/finish")).status_code == 200


async def test_no_corrections_after_finish(client, session):
    _, _, t = await running(client, session)
    t = await play_all(client, t)
    t = (await client.post(f"/api/v1/tournaments/{t['id']}/tiebreak-roll")).json()
    t = (await client.post(f"/api/v1/tournaments/{t['id']}/finish")).json()
    m = t["rounds"][0]["matches"][0]
    assert is_problem(await report(client, t, m, 0, 2, version=m["version"]), 409)


# ---------------------------------------------------------------------------
# Abbruch ab Runde 1 (ADR-0013)
# ---------------------------------------------------------------------------


async def test_admin_cancels_running_directly(client, session):  # TC-30
    _, _, t = await running(client, session)
    r = await client.post(f"/api/v1/tournaments/{t['id']}/cancel")
    assert r.json()["status"] == "cancelled"


async def four_member_tournament(client, session):
    """Vier Konten spielen: Anna startet (kein Admin), Peter ist Admin und spielt nicht mit."""
    group, peter, _ = await admin_group(client, session)
    users = []
    for name in ("Anna", "Ben", "Chris", "Dora"):
        u = await make_user(session, name)
        p = await groups.add_member(session, group_id=group.id, user=u)
        users.append((u, p))
    anna = users[0][0]
    await as_user(client, session, anna)
    t = (await start(client, group)).json()
    await client.post(
        f"/api/v1/tournaments/{t['id']}/entries",
        json={"player_ids": [str(p.id) for _, p in users[1:]]},
    )
    for u, _ in users[1:]:
        await as_user(client, session, u)
        await client.put(f"/api/v1/tournaments/{t['id']}/entries/me", json={"accept": True})
    await as_user(client, session, anna)
    await client.post(f"/api/v1/tournaments/{t['id']}/seating")
    await client.post(f"/api/v1/tournaments/{t['id']}/draft")
    r = await client.post(f"/api/v1/tournaments/{t['id']}/rounds/next", json={"confirm": True})
    assert r.status_code == 200, r.text
    return group, peter, (r.json(), [u for u, _ in users])


async def test_cancel_by_vote(client, session):  # TC-31
    _, _, (t, users) = await four_member_tournament(client, session)
    anna, ben, chris, dora = users
    tid = t["id"]

    # Starter kann ab Runde 1 nicht mehr direkt abbrechen, nur beantragen
    assert is_problem(await client.post(f"/api/v1/tournaments/{tid}/cancel"), 403)
    r = await client.post(f"/api/v1/tournaments/{tid}/cancel-request")
    assert r.status_code == 200, r.text
    vote = r.json()["cancel_vote"]
    assert vote == {
        "requested_by": "Anna",
        "confirmed": 1,
        "required": 3,
        "participants": 4,
        "i_voted": True,
    }
    assert is_problem(await client.post(f"/api/v1/tournaments/{tid}/cancel-request"), 409)

    await as_user(client, session, ben)
    assert is_problem(await client.post(f"/api/v1/tournaments/{tid}/cancel-request"), 403)
    r = await client.put(f"/api/v1/tournaments/{tid}/cancel-request/vote")
    assert r.json()["status"] == "running"  # 2 von 4 ist nicht mehr als die Hälfte
    r = await client.delete(f"/api/v1/tournaments/{tid}/cancel-request/vote")
    assert r.json()["cancel_vote"]["confirmed"] == 1
    await client.put(f"/api/v1/tournaments/{tid}/cancel-request/vote")

    await as_user(client, session, chris)
    r = await client.put(f"/api/v1/tournaments/{tid}/cancel-request/vote")
    assert r.json()["status"] == "cancelled"
    assert r.json()["cancel_vote"] is None


async def test_withdraw_cancel_request(client, session):
    _, _, (t, users) = await four_member_tournament(client, session)
    tid = t["id"]
    await client.post(f"/api/v1/tournaments/{tid}/cancel-request")
    await as_user(client, session, users[1])
    assert is_problem(await client.delete(f"/api/v1/tournaments/{tid}/cancel-request"), 403)
    await as_user(client, session, users[0])
    r = await client.delete(f"/api/v1/tournaments/{tid}/cancel-request")
    assert r.status_code == 200 and r.json()["cancel_vote"] is None


async def test_reserved_players_keep_names_in_standings(client, session):
    _, _, t = await running(client, session)
    names = {s["display_name"] for s in t["standings"]}
    kinds = {
        p.display_name: p.kind
        for p in (await session.scalars(select(Player))).all()
        if p.display_name in names
    }
    assert kinds["Ben"] == "reserved" and kinds["Gina"] == "guest"
