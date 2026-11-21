"""Life-Tracker am Server (UC-10, UC-11, N-01, TC-40 bis TC-46)."""

import itertools
import uuid
from datetime import UTC, datetime, timedelta

import pytest

from tests.api.helpers import is_problem
from tests.api.test_rounds import current_matches, running
from tests.api.test_tournaments import as_user
from tests.db.factories import make_user
from topstack.db.repo import groups

pytestmark = pytest.mark.usefixtures("client")

_clock = itertools.count()
T0 = datetime(2027, 1, 20, 19, 0, tzinfo=UTC)


class Device:
    """Ein Handy: eigene Geräte-ID und fortlaufende Nummern (ADR-0005)."""

    def __init__(self, name: str) -> None:
        self.id = name
        self.seq = 0

    def ev(self, game: uuid.UUID, type_: str, player: str | None = None, **extra) -> dict:
        self.seq += 1
        body = {
            "id": str(uuid.uuid4()),
            "game_id": str(game),
            "type": type_,
            "player_id": player,
            "device_id": self.id,
            "seq": self.seq,
            "client_ts": (T0 + timedelta(seconds=next(_clock))).isoformat(),
        }
        body.update(extra)
        return body


def urls(t, m):
    base = f"/api/v1/tournaments/{t['id']}/matches/{m['id']}"
    return f"{base}/tracker", f"{base}/events"


async def started(client, session, mode="shared"):
    group, peter, t = await running(client, session)
    m = current_matches(t)[0]
    tracker_url, events_url = urls(t, m)
    r = await client.post(tracker_url, json={"mode": mode})
    assert r.status_code == 200, r.text
    return group, peter, t, m, r.json()


async def push(client, url, *events):
    r = await client.post(url, json={"events": list(events)})
    assert r.status_code == 200, r.text
    return r.json()


def won_game(dev: Device, starter: str, winner: str, loser: str, *, rolls=False):
    game = uuid.uuid4()
    evs = []
    if rolls:
        evs += [
            dev.ev(game, "die_roll", starter, value=17),
            dev.ev(game, "die_roll", loser, value=4),
        ]
    evs.append(dev.ev(game, "game_start", starter))
    evs += [dev.ev(game, "life", loser, delta=-7) for _ in range(3)]
    evs.append(dev.ev(game, "game_end", winner, reason="life_zero"))
    return game, evs


async def test_start_tracker(client, session):
    _, _, t, m, tr = await started(client, session)
    assert tr["match"]["status"] == "running"
    assert tr["match"]["tracker_mode"] == "shared"
    assert tr["starting_life"] == 20
    assert {tr["player_a"]["id"], tr["player_b"]["id"]} == {m["player_a_id"], m["player_b_id"]}
    assert tr["events"] == []
    # idempotent, Moduswechsel vor dem ersten Spiel erlaubt
    tracker_url, _ = urls(t, m)
    r = await client.post(tracker_url, json={"mode": "dual"})
    assert r.json()["match"]["tracker_mode"] == "dual"


async def test_two_games_finish_match(client, session):  # TC-40, F-11
    _, _, t, m, _ = await started(client, session)
    tracker_url, events_url = urls(t, m)
    a, b = m["player_a_id"], m["player_b_id"]
    dev = Device("handy-1")
    _, g1 = won_game(dev, a, a, b, rolls=True)
    # Offline gesammelt: Reihenfolge im Stapel egal, game_start steht hinten
    res = await push(client, events_url, *reversed(g1))
    assert len(res["accepted"]) == len(g1) and res["rejected"] == []
    assert res["match"]["status"] == "running" and res["match"]["games_a"] == 1

    _, g2 = won_game(dev, b, a, b)
    res = await push(client, events_url, *g2)
    assert res["match"] == {
        "id": m["id"],
        "status": "finished",
        "tracker_mode": "shared",
        "games_a": 2,
        "games_b": 0,
        "games_drawn": 0,
        "version": 1,
    }

    tr = (await client.get(tracker_url)).json()
    assert len(tr["events"]) == len(g1) + len(g2)
    ends = [e for e in tr["events"] if e["type"] == "game_end"]
    assert [e["reason"] for e in ends] == ["life_zero", "life_zero"]

    tour = (await client.get(f"/api/v1/tournaments/{t['id']}")).json()
    row = next(s for s in tour["standings"] if s["player_id"] == a)
    assert (row["wins"], row["match_points"], row["games_won"]) == (1, 3, 2)

    # Ergebnis lässt sich wie gewohnt mit Version korrigieren
    r = await client.put(
        f"/api/v1/tournaments/{t['id']}/matches/{m['id']}/result",
        json={"games_a": 2, "games_b": 1, "version": 1},
    )
    assert r.status_code == 200, r.text


async def test_resend_is_idempotent(client, session):  # TC-42, TC-43, N-01
    _, _, t, m, _ = await started(client, session)
    _, events_url = urls(t, m)
    dev = Device("handy-1")
    _, g1 = won_game(dev, m["player_a_id"], m["player_a_id"], m["player_b_id"])
    await push(client, events_url, *g1[:3])
    res = await push(client, events_url, *g1)  # Outbox schickt nach Verbindungsabbruch alles
    assert len(res["duplicates"]) == 3 and len(res["accepted"]) == len(g1) - 3
    res = await push(client, events_url, *g1)
    assert len(res["duplicates"]) == len(g1) and res["accepted"] == []


async def test_dual_device_counts_one_player(client, session):  # TC-41, TC-44
    _, _, t, m, _ = await started(client, session, mode="dual")
    _, events_url = urls(t, m)
    a, b = m["player_a_id"], m["player_b_id"]
    one, two = Device("handy-a"), Device("handy-b")
    game = uuid.uuid4()
    await push(client, events_url, one.ev(game, "game_start", a))
    res = await push(client, events_url, one.ev(game, "life", a, delta=-2))
    assert res["rejected"] == []
    wrong = one.ev(game, "life", b, delta=-3)
    res = await push(client, events_url, wrong, two.ev(game, "life", b, delta=-3))
    assert [r["id"] for r in res["rejected"]] == [wrong["id"]]
    assert "anderen Spieler" in res["rejected"][0]["detail"]
    assert len(res["accepted"]) == 1


async def test_shared_device_counts_both(client, session):
    _, _, t, m, _ = await started(client, session)
    _, events_url = urls(t, m)
    dev = Device("handy-1")
    game = uuid.uuid4()
    res = await push(
        client,
        events_url,
        dev.ev(game, "game_start", m["player_a_id"]),
        dev.ev(game, "life", m["player_a_id"], delta=-1),
        dev.ev(game, "life", m["player_b_id"], delta=-1),
    )
    assert res["rejected"] == []


async def test_invalid_events_are_rejected(client, session):
    _, _, t, m, _ = await started(client, session)
    _, events_url = urls(t, m)
    a, b = m["player_a_id"], m["player_b_id"]
    dev = Device("handy-1")
    game = uuid.uuid4()
    await push(client, events_url, dev.ev(game, "game_start", a))
    outsider = next(e["player_id"] for e in t["entries"] if e["player_id"] not in (a, b))
    bad = [
        dev.ev(uuid.uuid4(), "game_start", a),  # es läuft schon ein Spiel
        dev.ev(game, "die_roll", a, value=21),
        dev.ev(game, "life", outsider, delta=-1),
        dev.ev(uuid.uuid4(), "life", a, delta=-1),  # Spiel unbekannt
        dev.ev(game, "undo", None, undo_of=str(uuid.uuid4())),
    ]
    res = await push(client, events_url, *bad)
    assert res["accepted"] == []
    assert len(res["rejected"]) == len(bad)


async def test_conflicting_game_end(client, session):  # TC-45
    _, _, t, m, _ = await started(client, session, mode="dual")
    _, events_url = urls(t, m)
    a, b = m["player_a_id"], m["player_b_id"]
    one, two = Device("handy-a"), Device("handy-b")
    game = uuid.uuid4()
    await push(client, events_url, one.ev(game, "game_start", a))
    await push(client, events_url, one.ev(game, "game_end", a, reason="concede"))
    same = two.ev(game, "game_end", a, reason="concede")
    other = two.ev(game, "game_end", b, reason="life_zero")
    res = await push(client, events_url, same, other)
    assert res["accepted"] == [same["id"]]
    assert [r["id"] for r in res["rejected"]] == [other["id"]]
    assert res["match"]["games_a"] == 1


async def test_drawn_game_ends_match(client, session):  # TC-46
    _, _, t, m, _ = await started(client, session)
    tracker_url, events_url = urls(t, m)
    a, b = m["player_a_id"], m["player_b_id"]
    dev = Device("handy-1")
    _, g1 = won_game(dev, a, b, a)
    g2 = uuid.uuid4()
    res = await push(
        client,
        events_url,
        *g1,
        dev.ev(g2, "game_start", b),
        dev.ev(g2, "game_end", None, reason="concede"),  # Grund wird zu „time“
    )
    assert res["match"]["status"] == "finished"
    assert (res["match"]["games_a"], res["match"]["games_b"], res["match"]["games_drawn"]) == (
        0,
        1,
        1,
    )
    tr = (await client.get(tracker_url)).json()
    assert [e["reason"] for e in tr["events"] if e["type"] == "game_end"] == ["life_zero", "time"]


async def test_undo_only_own_device(client, session):
    _, _, t, m, _ = await started(client, session)
    _, events_url = urls(t, m)
    a = m["player_a_id"]
    one, two = Device("handy-a"), Device("handy-b")
    game = uuid.uuid4()
    hit = one.ev(game, "life", a, delta=-5)
    await push(client, events_url, one.ev(game, "game_start", a), hit)
    res = await push(client, events_url, two.ev(game, "undo", None, undo_of=hit["id"]))
    assert len(res["rejected"]) == 1
    res = await push(client, events_url, one.ev(game, "undo", None, undo_of=hit["id"]))
    assert res["rejected"] == []


async def test_tracker_rules(client, session):
    group, peter, t = await running(client, session)
    later = t["rounds"][2]["matches"][0]
    m = current_matches(t)[0]
    tracker_url, events_url = urls(t, later)
    assert is_problem(await client.post(tracker_url, json={"mode": "shared"}), 409)
    _, events_now = urls(t, m)
    r = await client.post(events_now, json={"events": []})
    assert is_problem(r, 409)  # noch nicht mit dem Tracker gestartet
    assert (await client.post(urls(t, m)[0], json={"mode": "x"})).status_code == 422

    anna = await make_user(session, "Anna")
    await groups.add_member(session, group_id=group.id, user=anna)
    await as_user(client, session, anna)
    assert is_problem(await client.post(urls(t, m)[0], json={"mode": "shared"}), 403)


async def test_dual_lobby_seats_and_rolls(client, session):  # TC-41a
    _, _, t, m, _ = await started(client, session, mode="dual")
    tracker_url, _ = urls(t, m)
    a, b = m["player_a_id"], m["player_b_id"]
    seat = f"{tracker_url}/seats"

    r = await client.put(f"{seat}/{a}", json={"device_id": "handy-a"})
    assert r.status_code == 200, r.text
    assert r.json()["seats"] == [{"player_id": a, "device_id": "handy-a", "roll": None}]
    # Würfeln erst, wenn der Gegner da ist
    assert is_problem(
        await client.put(f"{seat}/{a}/roll", json={"device_id": "handy-a", "value": 5}), 409
    )
    # Ein zweites Handy kann Spieler A nicht einfach übernehmen
    assert is_problem(await client.put(f"{seat}/{a}", json={"device_id": "handy-x"}), 409)
    await client.put(f"{seat}/{b}", json={"device_id": "handy-b"})

    # Jeder würfelt nur für sich
    assert is_problem(
        await client.put(f"{seat}/{b}/roll", json={"device_id": "handy-a", "value": 5}), 403
    )
    await client.put(f"{seat}/{a}/roll", json={"device_id": "handy-a", "value": 9})
    assert is_problem(
        await client.put(f"{seat}/{a}/roll", json={"device_id": "handy-a", "value": 3}), 409
    )
    r = await client.put(f"{seat}/{b}/roll", json={"device_id": "handy-b", "value": 9})
    assert r.json()["tie"] == 9  # Gleichstand: beide neu
    assert all(s["roll"] is None for s in r.json()["seats"])
    await client.put(f"{seat}/{a}/roll", json={"device_id": "handy-a", "value": 17})
    r = await client.put(f"{seat}/{b}/roll", json={"device_id": "handy-b", "value": 4})
    rolls = {s["player_id"]: s["roll"] for s in r.json()["seats"]}
    assert rolls == {a: 17, b: 4} and r.json()["tie"] is None

    # Übernehmen mit force, z. B. wenn ein Handy leer ist
    r = await client.put(f"{seat}/{b}", json={"device_id": "handy-c", "force": True})
    seats = {s["player_id"]: (s["device_id"], s["roll"]) for s in r.json()["seats"]}
    assert seats[b] == ("handy-c", None)


async def test_lobby_only_in_dual_mode(client, session):
    _, _, t, m, _ = await started(client, session, mode="shared")
    tracker_url, _ = urls(t, m)
    r = await client.put(f"{tracker_url}/seats/{m['player_a_id']}", json={"device_id": "x"})
    assert is_problem(r, 409)
