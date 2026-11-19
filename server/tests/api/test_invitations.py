"""Einladungslinks in die Gruppe (UC-02, TC-04)."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from tests.api.helpers import is_problem, login
from tests.db.factories import make_group, make_member, make_user
from topstack.db.models import Invitation, Membership, Player
from topstack.db.repo import accounts, groups
from topstack.services.tokens import hash_token


async def admin_with_group(session):
    group = await make_group(session, "Draft-Runde")
    admin = await make_member(session, group, role="admin")
    user = await session.get(accounts.AppUser, admin.app_user_id)
    return group, user


async def create_invite(client, group, **body) -> dict:
    response = await client.post(f"/api/v1/groups/{group.id}/invitations", json=body)
    assert response.status_code == 201, response.text
    return response.json()


async def test_admin_creates_invitation(client, session):
    group, admin = await admin_with_group(session)
    await login(client, session, admin)
    invite = await create_invite(client, group, max_uses=3)
    assert invite["url"].endswith(f"/einladung/{invite['token']}")
    assert invite["max_uses"] == 3
    stored = await session.get(Invitation, hash_token(invite["token"]))
    assert stored is not None and stored.group_id == group.id


async def test_member_cannot_invite_and_outsider_sees_404(client, session):
    group = await make_group(session)
    member = await make_member(session, group)
    await login(client, session, await session.get(accounts.AppUser, member.app_user_id))
    assert is_problem(await client.post(f"/api/v1/groups/{group.id}/invitations", json={}), 403)

    other = await make_group(session)
    assert is_problem(await client.post(f"/api/v1/groups/{other.id}/invitations", json={}), 404)


async def test_invitation_info_is_public(client, session):
    group, admin = await admin_with_group(session)
    await login(client, session, admin)
    invite = await create_invite(client, group)
    client.cookies.clear()
    response = await client.get(f"/api/v1/invitations/{invite['token']}")
    assert response.status_code == 200
    assert response.json()["group_name"] == "Draft-Runde"


async def test_new_friend_joins_via_magic_link(client, session, mailer):
    """TC-04: Einladung → Magic-Link für neue Adresse → Konto, Mitglied, Spieler."""
    group, admin = await admin_with_group(session)
    await login(client, session, admin)
    invite = await create_invite(client, group)
    client.cookies.clear()

    response = await client.post(
        "/api/v1/auth/magic-link",
        json={"email": "freund@example.org", "invitation": invite["token"]},
    )
    assert response.status_code == 202
    assert "Draft-Runde" in mailer.sent[-1].text
    assert f"einladung={invite['token']}" in mailer.sent[-1].text

    response = await client.post(
        "/api/v1/auth/magic-link/verify",
        json={"token": mailer.last_link_token(), "invitation": invite["token"]},
    )
    assert response.status_code == 200
    me = response.json()
    assert me["email"] == "freund@example.org"
    assert me["display_name"] == "freund"
    assert [(g["name"], g["role"]) for g in me["groups"]] == [("Draft-Runde", "member")]

    player = await session.scalar(select(Player).where(Player.id == me["groups"][0]["player_id"]))
    assert player.kind == "member"
    stored = await session.get(Invitation, hash_token(invite["token"]))
    await session.refresh(stored)
    assert stored.uses == 1


async def test_logged_in_user_accepts_invitation(client, session):
    group, admin = await admin_with_group(session)
    await login(client, session, admin)
    invite = await create_invite(client, group)

    friend = await make_user(session, "Ben")
    client.cookies.clear()
    await login(client, session, friend)
    response = await client.post(f"/api/v1/invitations/{invite['token']}/accept")
    assert response.status_code == 200
    assert response.json()["joined"] is True
    membership = await groups.get_membership(session, group_id=group.id, user_id=friend.id)
    assert membership is not None and membership.role == "member"

    again = await client.post(f"/api/v1/invitations/{invite['token']}/accept")
    assert again.json()["joined"] is False
    count = await session.scalar(
        select(func.count()).select_from(Membership).where(Membership.group_id == group.id)
    )
    assert count == 2


async def test_expired_and_used_up_invitations_are_410(client, session):
    group, admin = await admin_with_group(session)
    await login(client, session, admin)
    expired = await create_invite(client, group)
    single = await create_invite(client, group, max_uses=1)

    stored = await session.get(Invitation, hash_token(expired["token"]))
    stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await session.flush()

    friend = await make_user(session)
    client.cookies.clear()
    await login(client, session, friend)
    assert is_problem(await client.post(f"/api/v1/invitations/{expired['token']}/accept"), 410)
    assert is_problem(await client.get(f"/api/v1/invitations/{expired['token']}"), 410)

    assert (await client.post(f"/api/v1/invitations/{single['token']}/accept")).status_code == 200
    third = await make_user(session)
    client.cookies.clear()
    await login(client, session, third)
    assert is_problem(await client.post(f"/api/v1/invitations/{single['token']}/accept"), 410)


async def test_accept_needs_login(client, session):
    group, admin = await admin_with_group(session)
    await login(client, session, admin)
    invite = await create_invite(client, group)
    client.cookies.clear()
    assert is_problem(await client.post(f"/api/v1/invitations/{invite['token']}/accept"), 401)


async def test_link_without_valid_invitation_creates_no_account(client, session, mailer):
    group, admin = await admin_with_group(session)
    await login(client, session, admin)
    invite = await create_invite(client, group)
    client.cookies.clear()
    await client.post(
        "/api/v1/auth/magic-link",
        json={"email": "neu@example.org", "invitation": invite["token"]},
    )
    token = mailer.last_link_token()
    # Einladung läuft zwischen Mail und Klick ab
    stored = await session.get(Invitation, hash_token(invite["token"]))
    stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await session.flush()

    response = await client.post(
        "/api/v1/auth/magic-link/verify", json={"token": token, "invitation": invite["token"]}
    )
    assert is_problem(response, 403)
    assert await accounts.get_user_by_email(session, "neu@example.org") is None
