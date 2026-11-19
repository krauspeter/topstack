"""Profil lesen und ändern (TC-06)."""

from sqlalchemy import select

from tests.api.helpers import is_problem, login
from tests.db.factories import make_group, make_user
from topstack.db.models import Player
from topstack.db.repo import groups


async def test_me_lists_groups_with_role_and_player(client, session):
    user = await make_user(session, "Peter")
    group = await make_group(session, "Draft-Runde")
    player = await groups.add_member(session, group_id=group.id, user=user, role="admin")
    await login(client, session, user)

    body = (await client.get("/api/v1/me")).json()
    assert body["display_name"] == "Peter"
    assert body["favorite_colors"] == ""
    assert body["has_passkey"] is False
    assert body["groups"] == [
        {"id": str(group.id), "name": "Draft-Runde", "role": "admin", "player_id": str(player.id)}
    ]


async def test_patch_name_and_colors(client, session):
    user = await make_user(session, "Alt")
    group = await make_group(session)
    await groups.add_member(session, group_id=group.id, user=user)
    await login(client, session, user)

    response = await client.patch(
        "/api/v1/me", json={"display_name": "  Neu  ", "favorite_colors": "ru"}
    )
    assert response.status_code == 200
    assert response.json()["display_name"] == "Neu"
    assert response.json()["favorite_colors"] == "UR"  # WUBRG-Reihenfolge

    player = await session.scalar(select(Player).where(Player.app_user_id == user.id))
    await session.refresh(player)
    assert player.display_name == "Neu"


async def test_patch_rejects_invalid_colors_and_empty_name(client, session):
    user = await make_user(session)
    await login(client, session, user)
    assert is_problem(await client.patch("/api/v1/me", json={"favorite_colors": "UX"}), 422)
    assert is_problem(await client.patch("/api/v1/me", json={"display_name": "   "}), 422)
    assert is_problem(await client.patch("/api/v1/me", json={"display_name": "x" * 41}), 422)


async def test_patch_colorless_allowed(client, session):
    user = await make_user(session)
    await login(client, session, user)
    await client.patch("/api/v1/me", json={"favorite_colors": "WU"})
    response = await client.patch("/api/v1/me", json={"favorite_colors": ""})
    assert response.json()["favorite_colors"] == ""
