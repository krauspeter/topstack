"""Web Push (F-17, TC-60 bis TC-62)."""

import base64
import contextlib
import json

import pytest
from sqlalchemy import select

from tests.api.helpers import is_problem
from tests.api.test_rounds import current_matches, four_member_tournament, report
from tests.api.test_tournaments import admin_group, as_user, start
from tests.db.factories import make_user
from topstack.db.models import PushSubscription
from topstack.db.repo import groups
from topstack.scripts.vapid_keys import generate
from topstack.services import push

pytestmark = pytest.mark.usefixtures("client")


@pytest.fixture
def outbox(monkeypatch, session):
    """Ersetzt den Versand: sammelt Nachrichten, Endpunkte mit „gone“ gelten als abgelaufen."""
    sent: list[tuple[str, dict]] = []

    def fake(d: push.Delivery) -> None:
        if "gone" in d.endpoint:
            raise push.Gone
        sent.append((d.endpoint, json.loads(d.payload)))

    @contextlib.asynccontextmanager
    async def scope():
        yield session

    monkeypatch.setattr(push, "sender", fake)
    monkeypatch.setattr(push, "session_scope", scope)
    return sent


async def subscribe(client, session, user, name: str):
    await as_user(client, session, user)
    r = await client.post(
        "/api/v1/push/subscriptions",
        json={"endpoint": f"https://push.example/{name}", "keys": {"p256dh": "k", "auth": "a"}},
    )
    assert r.status_code == 201, r.text
    return r.json()


def to(outbox, name: str) -> list[dict]:
    return [msg for endpoint, msg in outbox if endpoint.endswith(f"/{name}")]


async def test_vapid_keys_script():
    public, private = generate()
    assert len(base64.urlsafe_b64decode(public + "=")) == 65  # unkomprimierter Punkt
    assert len(base64.urlsafe_b64decode(private + "=")) == 32


async def test_settings_and_subscriptions(client, session, outbox):
    _, peter, _ = await admin_group(client, session)
    r = await client.get("/api/v1/push/vapid-key")
    assert r.status_code == 200 and "key" in r.json()
    out = await subscribe(client, session, peter, "peter")
    assert out["devices"] == 1
    assert [e["event"] for e in out["events"]] == list(push.EVENTS)
    assert all(e["enabled"] for e in out["events"])
    # gleiches Gerät noch einmal: kein zweites Abo
    assert (await subscribe(client, session, peter, "peter"))["devices"] == 1

    r = await client.put("/api/v1/me/notifications/new_round", json={"enabled": False})
    assert {e["event"]: e["enabled"] for e in r.json()["events"]}["new_round"] is False
    assert is_problem(
        await client.put("/api/v1/me/notifications/gibtsnicht", json={"enabled": False}), 404
    )

    r = await client.post("/api/v1/push/test")
    assert r.json() == {"sent": 1}
    await push.drain()
    assert to(outbox, "peter")[0]["title"] == "TopStack"

    r = await client.delete(
        "/api/v1/push/subscriptions", params={"endpoint": "https://push.example/peter"}
    )
    assert r.status_code == 204
    assert (await client.get("/api/v1/me/notifications")).json()["devices"] == 0
    bad = {"endpoint": "http://unsicher.example/x", "keys": {"p256dh": "k", "auth": "a"}}
    assert is_problem(await client.post("/api/v1/push/subscriptions", json=bad), 422)


async def test_without_vapid_no_test_push(client, session):
    _, peter, _ = await admin_group(client, session)
    await subscribe(client, session, peter, "peter")
    assert is_problem(await client.post("/api/v1/push/test"), 503)


async def test_your_turn_on_new_round(client, session, outbox):  # TC-60, TC-61, TC-62
    _, _, (t, users) = await four_member_tournament(client, session)
    anna, ben, chris, dora = users
    await subscribe(client, session, ben, "ben")
    await subscribe(client, session, chris, "gone-chris")  # abgelaufenes Abo
    await subscribe(client, session, dora, "dora")
    await client.put("/api/v1/me/notifications/your_turn", json={"enabled": False})  # Dora

    await as_user(client, session, anna)
    for m in current_matches(t):
        t = (await report(client, t, m, 2, 0)).json()
    r = await client.post(f"/api/v1/tournaments/{t['id']}/rounds/next", json={})
    assert r.status_code == 200, r.text
    await push.drain()

    msgs = to(outbox, "ben")
    assert len(msgs) == 1
    assert msgs[0]["title"] == "Runde 2: Du bist dran"
    assert msgs[0]["body"].startswith("Du spielst gegen ")
    assert msgs[0]["url"] == f"/turnier/{t['id']}"
    assert to(outbox, "dora") == []  # abgeschaltet
    # Abo von Chris ist abgelaufen und wurde entfernt
    remaining = {s.endpoint for s in (await session.scalars(select(PushSubscription))).all()}
    assert "https://push.example/gone-chris" not in remaining
    assert "https://push.example/ben" in remaining


async def test_invitation_push(client, session, outbox):
    group, peter, _ = await admin_group(client, session)
    anna = await make_user(session, "Anna")
    anna_player = await groups.add_member(session, group_id=group.id, user=anna)
    await subscribe(client, session, anna, "anna")
    await as_user(client, session, peter)
    t = (await start(client, group)).json()
    await client.post(
        f"/api/v1/tournaments/{t['id']}/entries", json={"player_ids": [str(anna_player.id)]}
    )
    await push.drain()
    msgs = to(outbox, "anna")
    assert [m["title"] for m in msgs] == ["Einladung zum Draft"]
    assert "Peter" in msgs[0]["body"]


async def test_correction_and_cancel_request_push(client, session, outbox):  # UC-14
    _, _, (t, users) = await four_member_tournament(client, session)
    anna, ben, chris, dora = users
    for u, name in ((anna, "anna"), (ben, "ben"), (chris, "chris"), (dora, "dora")):
        await subscribe(client, session, u, name)
    await as_user(client, session, anna)
    m = current_matches(t)[0]
    t = (await report(client, t, m, 2, 0)).json()
    await push.drain()
    assert outbox == []  # erstes Eintragen ist keine Korrektur

    m = next(x for x in current_matches(t) if x["id"] == m["id"])
    await report(client, t, m, 1, 2, version=m["version"])
    await push.drain()
    players = {m["player_a"].lower(), m["player_b"].lower()}
    got = {name for name in ("anna", "ben", "chris", "dora") if to(outbox, name)}
    assert got == players - {"anna"}
    msg = next(iter(to(outbox, next(iter(got)))))
    assert msg["title"] == "Ergebnis korrigiert" and "Anna" in msg["body"]

    outbox.clear()
    await client.post(f"/api/v1/tournaments/{t['id']}/cancel-request")
    await push.drain()
    assert {n for n in ("anna", "ben", "chris", "dora") if to(outbox, n)} == {
        "ben",
        "chris",
        "dora",
    }
    assert to(outbox, "ben")[0]["title"] == "Abbruch beantragt"
