"""Live-Ansicht über WebSocket (F-15, N-04, TC-50 bis TC-53)."""

import asyncio
import contextlib
import uuid

import pytest
from fastapi import WebSocketDisconnect

from tests.api.test_rounds import current_matches, report, running
from tests.api.test_tournaments import as_user
from tests.api.test_tracker import Device, urls
from tests.db.factories import make_user
from topstack.api.live import CLOSE_UNAUTHORIZED, serve
from topstack.db.repo import groups
from topstack.live import Hub
from topstack.services import auth

pytestmark = pytest.mark.usefixtures("client")


class FakeSocket:
    """Steht für einen Browser-WebSocket; läuft im selben Event-Loop wie die Tests."""

    def __init__(self, cookies: dict[str, str]) -> None:
        self.cookies = cookies
        self.inbox: asyncio.Queue = asyncio.Queue()
        self.outbox: asyncio.Queue = asyncio.Queue()
        self.closed: int | None = None
        self.accepted = False

    async def accept(self) -> None:
        self.accepted = True

    async def close(self, code: int = 1000) -> None:
        self.closed = code

    async def receive_json(self):
        msg = await self.inbox.get()
        if msg is None:
            raise WebSocketDisconnect()
        return msg

    async def send_json(self, data) -> None:
        await self.outbox.put(data)

    async def expect(self, type_: str, timeout: float = 2.0) -> dict:
        while True:
            msg = await asyncio.wait_for(self.outbox.get(), timeout)
            if msg["type"] == type_:
                return msg


@contextlib.asynccontextmanager
async def connected(client, session):
    """Verbindet einen WebSocket mit dem Cookie des angemeldeten Test-Clients."""

    @contextlib.asynccontextmanager
    async def scope():
        yield session

    sock = FakeSocket({auth.SESSION_COOKIE: client.cookies.get(auth.SESSION_COOKIE) or ""})
    task = asyncio.create_task(serve(sock, scope))
    try:
        yield sock
    finally:
        await sock.inbox.put(None)
        await asyncio.wait_for(task, 2)


async def subscribe(sock: FakeSocket, tid: str) -> dict:
    await sock.inbox.put({"type": "subscribe", "topic": f"tournament:{tid}"})
    return await asyncio.wait_for(sock.outbox.get(), 2)


async def test_without_session_is_closed(client, session):
    @contextlib.asynccontextmanager
    async def scope():
        yield session

    sock = FakeSocket({})
    await serve(sock, scope)
    assert sock.closed == CLOSE_UNAUTHORIZED and not sock.accepted


async def test_member_gets_live_updates(client, session):  # TC-50
    _, _, t = await running(client, session)
    async with connected(client, session) as sock:
        assert await subscribe(sock, t["id"]) == {
            "type": "subscribed",
            "topic": f"tournament:{t['id']}",
        }
        # Ergebnis eintragen: alle Zuschauer bekommen den Hinweis zum Nachladen
        await report(client, t, current_matches(t)[0], 2, 0)
        msg = await sock.expect("tournament.updated")
        assert msg["tournament_id"] == t["id"]

        # Lebenspunkte kommen direkt mit
        m = current_matches(t)[1]
        tracker_url, events_url = urls(t, m)
        await client.post(tracker_url, json={"mode": "shared"})
        await sock.expect("tournament.updated")
        dev = Device("handy-1")
        game = uuid.uuid4()
        start = dev.ev(game, "game_start", m["player_a_id"])
        hit = dev.ev(game, "life", m["player_b_id"], delta=-4)
        await client.post(events_url, json={"events": [start, hit]})
        msg = await sock.expect("game.events")
        assert msg["match_id"] == m["id"]
        assert [e["id"] for e in msg["events"]] == [start["id"], hit["id"]]

        # Doppelt gesendet: keine zweite Live-Nachricht
        await client.post(events_url, json={"events": [hit]})
        assert sock.outbox.empty()
        await client.post(f"/api/v1/tournaments/{t['id']}/pause")
        assert (await sock.expect("tournament.updated"))["reason"] == "updated"


async def test_non_member_is_rejected(client, session):  # TC-53
    _, _, t = await running(client, session)
    stranger = await make_user(session, "Fremd")
    await as_user(client, session, stranger)
    async with connected(client, session) as sock:
        msg = await subscribe(sock, t["id"])
        assert msg["type"] == "error"
        msg = await subscribe(sock, "kein-uuid")
        assert msg["type"] == "error"
        await sock.inbox.put({"type": "subscribe", "topic": "game:123"})
        assert (await asyncio.wait_for(sock.outbox.get(), 2))["type"] == "error"


async def test_live_life_in_tournament(client, session):  # F-15
    _, _, t = await running(client, session)
    m = current_matches(t)[0]
    tracker_url, events_url = urls(t, m)
    await client.post(tracker_url, json={"mode": "shared"})
    dev = Device("handy-1")
    game = uuid.uuid4()
    hit = dev.ev(game, "life", m["player_b_id"], delta=-4)
    await client.post(
        events_url,
        json={
            "events": [
                dev.ev(game, "game_start", m["player_a_id"]),
                hit,
                dev.ev(game, "life", m["player_a_id"], delta=-1),
                dev.ev(game, "undo", None, undo_of=hit["id"]),
                dev.ev(game, "life", m["player_b_id"], delta=-2),
            ]
        },
    )
    t = (await client.get(f"/api/v1/tournaments/{t['id']}")).json()
    live = next(x for x in current_matches(t) if x["id"] == m["id"])
    assert (live["game_no"], live["life_a"], live["life_b"], live["tracker_mode"]) == (
        1,
        19,
        18,
        "shared",
    )
    other = next(x for x in current_matches(t) if x["id"] != m["id"])
    assert other["life_a"] is None


async def test_pause_view_next_opponent(client, session):  # TC-52
    group, peter, t = await running(client, session)
    me = t["my_player_id"]
    mine = next((m for m in current_matches(t) if me in (m["player_a_id"], m["player_b_id"])), None)
    if mine is not None:
        assert t["next_opponent"] is None  # Peter spielt gerade
        t = (await report(client, t, mine, 2, 0)).json()
    nxt = t["next_opponent"]
    assert nxt is not None
    upcoming = [
        (r["number"], m)
        for r in t["rounds"]
        if r["status"] == "planned"
        for m in r["matches"]
        if me in (m["player_a_id"], m["player_b_id"])
    ]
    number, first = min(upcoming, key=lambda x: x[0])
    other = first["player_b_id"] if first["player_a_id"] == me else first["player_a_id"]
    assert (nxt["player_id"], nxt["round"]) == (other, number)
    assert (nxt["wins"], nxt["draws"], nxt["losses"]) == (0, 0, 0)

    # Wer nicht mitspielt, bekommt keine Pause-Ansicht
    anna = await make_user(session, "Anna")
    await groups.add_member(session, group_id=group.id, user=anna)
    await as_user(client, session, anna)
    assert (await client.get(f"/api/v1/tournaments/{t['id']}")).json()["next_opponent"] is None


class SlowSocket:
    async def send_json(self, data) -> None:
        await asyncio.sleep(10)


class ListSocket:
    def __init__(self) -> None:
        self.got: list[dict] = []

    async def send_json(self, data) -> None:
        self.got.append(data)


async def test_hub_drops_slow_sockets(monkeypatch):  # TC-51
    import topstack.live as live

    monkeypatch.setattr(live, "SEND_TIMEOUT_S", 0.05)
    hub = Hub()
    fast, slow = ListSocket(), SlowSocket()
    hub.subscribe(fast, "tournament:1")
    hub.subscribe(slow, "tournament:1")
    await hub.publish("tournament:1", {"type": "tournament.updated"})
    assert fast.got == [{"type": "tournament.updated", "topic": "tournament:1"}]
    assert hub.subscribers("tournament:1") == 1  # langsamer Client fliegt raus und lädt nach
    hub.disconnect(fast)
    assert hub.subscribers("tournament:1") == 0
    await hub.publish("tournament:1", {"type": "x"})  # ohne Abonnenten kein Fehler
