"""Profilbilder (Phase 5, AP-15), Testfälle TC-168 bis TC-171."""

import base64

from sqlalchemy import select

from tests.api.helpers import is_problem
from tests.api.test_rounds import current_matches, running
from tests.api.test_tournaments import admin_group, as_user
from tests.db.factories import make_member
from topstack.db.models import AppUser, Player

PNG = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 64).decode()


async def test_preset_shows_everywhere(client, session):  # TC-168
    group, _, t = await running(client, session)
    r = await client.put("/api/v1/me/avatar", json={"preset": "drache"})
    assert r.status_code == 200 and r.json()["avatar"] == "preset:drache"
    me = r.json()
    view = (await client.get(f"/api/v1/tournaments/{t['id']}")).json()
    mine = next(e for e in view["entries"] if e["is_me"])
    assert mine["avatar"] == "preset:drache"
    assert next(s for s in view["standings"] if s["player_id"] == mine["player_id"])["avatar"] == (
        "preset:drache"
    )
    m = next(
        x
        for x in current_matches(view)
        if mine["player_id"] in (x["player_a_id"], x["player_b_id"])
    )
    side = "avatar_a" if m["player_a_id"] == mine["player_id"] else "avatar_b"
    assert m[side] == "preset:drache"
    players = (await client.get(f"/api/v1/groups/{group.id}/players")).json()
    assert {p["avatar"] for p in players if p["is_me"]} == {"preset:drache"}
    assert me["display_name"]


async def test_own_image_and_removal(client, session):  # TC-169, TC-171
    group, _, _ = await admin_group(client, session)
    r = await client.put("/api/v1/me/avatar", json={"image": PNG})
    assert r.status_code == 200, r.text
    url = r.json()["avatar"]
    assert url.startswith("/api/v1/avatars/") and "?v=" in url
    img = await client.get(url)
    assert img.status_code == 200 and img.headers["content-type"] == "image/png"
    assert img.content.startswith(b"\x89PNG")

    gif = "data:image/gif;base64," + base64.b64encode(b"GIF89a" + b"0" * 10).decode()
    assert is_problem(await client.put("/api/v1/me/avatar", json={"image": gif}), 422)
    big = (
        "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 400_000).decode()
    )
    assert is_problem(await client.put("/api/v1/me/avatar", json={"image": big}), 422)
    assert is_problem(await client.put("/api/v1/me/avatar", json={"preset": "einhorn-x"}), 422)
    assert is_problem(await client.put("/api/v1/me/avatar", json={}), 422)

    r = await client.delete("/api/v1/me/avatar")
    assert r.status_code == 200 and r.json()["avatar"] is None
    assert is_problem(await client.get(url), 404)
    user = await session.scalar(select(AppUser).where(AppUser.display_name == "Peter"))
    await session.refresh(user, ["avatar_image"])
    assert user.avatar_image is None
    assert group


async def test_admin_sets_preset_for_reserved(client, session):  # TC-170
    group, _, reserved = await admin_group(client, session, reserved=("Ben",))
    url = f"/api/v1/groups/{group.id}/players/{reserved[0]}/avatar"
    assert (await client.put(url, json={"preset": "goblin"})).status_code == 204
    players = (await client.get(f"/api/v1/groups/{group.id}/players")).json()
    assert {p["display_name"]: p["avatar"] for p in players}["Ben"] == "preset:goblin"
    assert (await client.put(url, json={"preset": None})).status_code == 204

    me = await session.scalar(
        select(Player).where(Player.group_id == group.id, Player.kind == "member")
    )
    own = f"/api/v1/groups/{group.id}/players/{me.id}/avatar"
    assert is_problem(await client.put(own, json={"preset": "goblin"}), 422)

    member = await make_member(session, group)
    await as_user(client, session, await session.get(AppUser, member.app_user_id))
    assert is_problem(await client.put(url, json={"preset": "elf"}), 403)
