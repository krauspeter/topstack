"""Gruppen anlegen und verwalten (Phase 5, AP-1, ADR-0018), Testfälle TC-130 bis TC-139."""

import base64
from datetime import date, timedelta

from sqlalchemy import select

from tests.api.helpers import is_problem, login
from tests.db.factories import make_group, make_member, make_tournament, make_user
from topstack.db.models import AppUser, GroupRules, PlayGroup, Season, Tournament
from topstack.db.repo import groups as repo
from topstack.services import groups as svc
from topstack.services import invitations

PNG = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 64).decode()


async def user_of(session, player) -> AppUser:
    return await session.get(AppUser, player.app_user_id)


async def create(client, name="Freitagsrunde"):
    response = await client.post("/api/v1/groups", json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()


async def test_create_group(client, session):  # TC-130
    user = await make_user(session, "Anna")
    await login(client, session, user)
    group = await create(client, "  Freitagsrunde ")
    assert group["name"] == "Freitagsrunde"
    assert group["role"] == "admin" and group["can_manage"] and group["player_id"]
    assert group["rules"]["starting_life"] == 20
    seasons = list(await session.scalars(select(Season).where(Season.group_id == group["id"])))
    year = date.today().year
    assert [(s.name, s.starts_on) for s in seasons] == [(f"Saison {year}", date(year, 1, 1))]

    me = (await client.get("/api/v1/me")).json()
    assert [g["name"] for g in me["groups"]] == ["Freitagsrunde"]


async def test_at_most_five_own_groups(client, session):  # TC-131
    user = await make_user(session)
    await login(client, session, user)
    for n in range(5):
        await create(client, f"Gruppe {n}")
    assert is_problem(await client.post("/api/v1/groups", json={"name": "Sechs"}), 409)


async def test_two_groups_two_tournaments(client, session):  # TC-133
    a = await make_group(session, "A")
    admin = await make_member(session, a, role="admin")
    user = await user_of(session, admin)
    await login(client, session, user)
    b = await create(client, "B")
    for gid in (a.id, b["id"]):
        r = await client.post(f"/api/v1/groups/{gid}/tournaments", json={"set_code": "DSK"})
        assert r.status_code == 201, r.text
    assert len((await client.get("/api/v1/me")).json()["groups"]) == 2


async def test_viewer_sees_but_cannot_act(client, session):  # TC-134
    group = await make_group(session)
    viewer = await make_member(session, group, role="viewer")
    await make_tournament(session, group=group, players=2, status="finished")
    await login(client, session, await user_of(session, viewer))
    base = f"/api/v1/groups/{group.id}"

    info = (await client.get(base)).json()
    assert info["role"] == "viewer" and not info["can_play"] and not info["can_view_profiles"]
    assert (await client.get(f"{base}/tournaments")).status_code == 200
    assert (await client.get(f"{base}/leaderboard")).status_code == 200
    assert is_problem(await client.get(f"{base}/players"), 403)
    assert is_problem(await client.get(f"{base}/members"), 403)
    assert is_problem(await client.post(f"{base}/tournaments", json={"set_code": "DSK"}), 403)
    assert is_problem(await client.patch(base, json={"name": "X"}), 403)
    assert is_problem(await client.post(f"{base}/invitations", json={}), 403)


async def test_member_cannot_manage(client, session):
    group = await make_group(session)
    m = await make_member(session, group)
    await login(client, session, await user_of(session, m))
    base = f"/api/v1/groups/{group.id}"
    assert is_problem(await client.patch(base, json={"name": "X"}), 403)
    assert is_problem(await client.patch(f"{base}/rules", json={"starting_life": 30}), 403)
    assert is_problem(await client.post(f"{base}/archive"), 403)
    assert is_problem(await client.delete(base), 403)
    assert (await client.get(f"{base}/members")).status_code == 200


async def test_roles_and_last_admin(client, session):  # TC-135
    group = await make_group(session)
    admin = await make_member(session, group, role="admin", name="Anna")
    ben = await make_member(session, group, name="Ben")
    await make_member(session, group, name="Chris")
    admin_user = await user_of(session, admin)
    await login(client, session, admin_user)
    base = f"/api/v1/groups/{group.id}"

    r = await client.put(f"{base}/members/{admin_user.id}/role", json={"role": "member"})
    assert is_problem(r, 409)
    r = await client.put(f"{base}/members/{ben.app_user_id}/role", json={"role": "viewer"})
    assert r.status_code == 200
    assert {m["display_name"]: m["role"] for m in r.json()}["Ben"] == "viewer"

    left = await client.delete(f"{base}/members/me")
    assert left.status_code == 200 and left.json()["new_admin"] == "Chris"
    assert is_problem(await client.get(base), 404)
    assert all(g["id"] != str(group.id) for g in (await client.get("/api/v1/me")).json()["groups"])


async def test_left_member_rejoins_with_old_player(client, session):
    group = await make_group(session)
    await make_member(session, group, role="admin")
    m = await make_member(session, group)
    user = await user_of(session, m)
    await login(client, session, user)
    assert (await client.delete(f"/api/v1/groups/{group.id}/members/me")).status_code == 200

    token, inv = await invitations.create(session, group_id=group.id, created_by=user.id)
    player, joined = await invitations.accept(session, inv, user)
    assert joined and player.id == m.id
    assert await repo.get_membership(session, group_id=group.id, user_id=user.id) is not None


async def test_last_member_leaving_moves_group_to_trash(client, session):
    user = await make_user(session)
    await login(client, session, user)
    group = await create(client)
    assert (await client.delete(f"/api/v1/groups/{group['id']}/members/me")).status_code == 200
    stored = await session.get(PlayGroup, group["id"], populate_existing=True)
    assert stored.deleted_at is not None


async def test_archive_is_read_only(client, session):  # TC-136
    group = await make_group(session)
    admin = await make_member(session, group, role="admin")
    await login(client, session, await user_of(session, admin))
    base = f"/api/v1/groups/{group.id}"

    open_t = await make_tournament(session, group=group, players=2, status="running")
    assert is_problem(await client.post(f"{base}/archive"), 409)
    open_t.status = "finished"
    await session.flush()

    r = await client.post(f"{base}/archive")
    assert r.status_code == 200 and r.json()["archived"]
    assert is_problem(await client.post(f"{base}/tournaments", json={"set_code": "DSK"}), 409)
    assert is_problem(await client.patch(base, json={"name": "Neu"}), 409)
    assert is_problem(await client.post(f"{base}/players", json={"display_name": "Dana"}), 409)
    assert (await client.get(f"{base}/leaderboard")).status_code == 200
    me = (await client.get("/api/v1/me")).json()
    assert me["groups"][0]["archived"] is True

    token, _ = await invitations.create(session, group_id=group.id, created_by=admin.app_user_id)
    assert is_problem(await client.get(f"/api/v1/invitations/{token}"), 410)

    r = await client.delete(f"{base}/archive")
    assert r.status_code == 200 and not r.json()["archived"]


async def test_delete_restore_and_purge(client, session):  # TC-137
    group = await make_group(session, "Alt")
    admin = await make_member(session, group, role="admin")
    other = await make_member(session, group)
    await make_tournament(session, group=group, players=2, status="finished")
    await login(client, session, await user_of(session, admin))
    base = f"/api/v1/groups/{group.id}"

    assert (await client.delete(base)).status_code == 204
    assert is_problem(await client.get(base), 404)
    deleted = (await client.get("/api/v1/me/deleted-groups")).json()
    assert [d["name"] for d in deleted] == ["Alt"]

    r = await client.post(f"{base}/restore")
    assert r.status_code == 200 and r.json()["name"] == "Alt"

    # Nicht-Admins können nicht wiederherstellen
    assert (await client.delete(base)).status_code == 204
    await login(client, session, await user_of(session, other))
    assert is_problem(await client.post(f"{base}/restore"), 404)

    stored = await session.get(PlayGroup, group.id, populate_existing=True)
    assert await svc.purge(session, at=stored.deleted_at + timedelta(days=29)) == []
    assert await svc.purge(session, at=stored.deleted_at + timedelta(days=31)) == ["Alt"]
    session.expunge_all()
    assert await session.get(PlayGroup, group.id) is None
    assert await session.scalar(select(Tournament).where(Tournament.group_id == group.id)) is None


async def test_rules_apply_now_without_tournaments(client, session):
    user = await make_user(session)
    await login(client, session, user)
    group = await create(client)
    r = await client.patch(f"/api/v1/groups/{group['id']}/rules", json={"starting_life": 30})
    assert r.status_code == 200 and r.json()["applied_now"]
    assert r.json()["group"]["rules"]["starting_life"] == 30
    assert is_problem(
        await client.patch(f"/api/v1/groups/{group['id']}/rules", json={"games_to_win": 9}), 422
    )


async def test_rules_wait_for_next_season(client, session):  # TC-138
    group = await make_group(session)
    admin = await make_member(session, group, role="admin")
    await repo.create_season(
        session,
        group_id=group.id,
        name="Saison alt",
        starts_on=date(2020, 1, 1),
        ends_on=date(2020, 12, 31),
    )
    await make_tournament(session, group=group, players=2, status="finished")
    await login(client, session, await user_of(session, admin))
    base = f"/api/v1/groups/{group.id}"

    r = await client.patch(f"{base}/rules", json={"starting_life": 25})
    assert r.status_code == 200 and not r.json()["applied_now"]
    assert r.json()["group"]["rules"]["starting_life"] == 20
    assert r.json()["group"]["pending_rules"] == {"starting_life": 25}

    # Das nächste Turnier beginnt die neue Saison und übernimmt die Regeln
    r = await client.post(f"{base}/tournaments", json={"set_code": "DSK"})
    assert r.status_code == 201, r.text
    rules = await session.get(GroupRules, group.id, populate_existing=True)
    assert rules.starting_life == 25
    stored = await session.get(PlayGroup, group.id, populate_existing=True)
    assert stored.pending_rules is None
    seasons = list(await session.scalars(select(Season).where(Season.group_id == group.id)))
    assert any(s.name == f"Saison {date.today().year}" for s in seasons)


async def test_no_new_season_before_a_prepared_one(session):
    group = await make_group(session)
    future = date.today() + timedelta(days=10)
    await repo.create_season(
        session, group_id=group.id, name="Später", starts_on=future, ends_on=None
    )
    assert await svc.ensure_season(session, group, date.today()) is None


async def test_groups_are_separate(client, session):  # TC-139
    a = await make_group(session, "A")
    b = await make_group(session, "B")
    in_a = await make_member(session, a, role="admin")
    await make_member(session, b, role="admin")
    t_b = await make_tournament(session, group=b, players=2)
    await login(client, session, await user_of(session, in_a))
    for path in ("", "/players", "/members", "/tournaments", "/leaderboard", "/seasons", "/image"):
        assert is_problem(await client.get(f"/api/v1/groups/{b.id}{path}"), 404), path
    assert is_problem(await client.get(f"/api/v1/tournaments/{t_b.id}"), 404)
    assert is_problem(await client.patch(f"/api/v1/groups/{b.id}", json={"name": "X"}), 404)


async def test_group_image(client, session):
    user = await make_user(session)
    await login(client, session, user)
    group = await create(client)
    base = f"/api/v1/groups/{group['id']}"
    assert is_problem(await client.get(f"{base}/image"), 404)

    r = await client.put(f"{base}/image", json={"image": PNG})
    assert r.status_code == 200 and r.json()["has_image"]
    img = await client.get(f"{base}/image")
    assert img.status_code == 200 and img.headers["content-type"] == "image/png"
    assert img.content.startswith(b"\x89PNG")
    bad = "data:image/png;base64," + base64.b64encode(b"GIF89a").decode()
    assert is_problem(await client.put(f"{base}/image", json={"image": bad}), 422)

    r = await client.delete(f"{base}/image")
    assert r.status_code == 200 and not r.json()["has_image"]
