"""Anmeldung per Magic-Link, Sitzung, Abmeldung (TC-01, TC-02, TC-05)."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from tests.api.helpers import is_problem, login
from tests.db.factories import make_user
from topstack.db.models import MagicLink, UserSession
from topstack.services import auth
from topstack.services.tokens import hash_token


async def test_protected_route_without_session_is_401(client):
    response = await client.get("/api/v1/me")
    assert is_problem(response, 401)


async def test_garbage_cookie_is_401(client):
    client.cookies.set(auth.SESSION_COOKIE, "kaputt")
    assert (await client.get("/api/v1/me")).status_code == 401


async def test_magic_link_for_known_user_logs_in(client, session, mailer):
    user = await make_user(session, "Anna")
    response = await client.post("/api/v1/auth/magic-link", json={"email": user.email.upper()})
    assert response.status_code == 202
    assert len(mailer.sent) == 1
    assert mailer.sent[0].to == user.email
    assert "/anmelden?token=" in mailer.sent[0].text

    response = await client.post(
        "/api/v1/auth/magic-link/verify", json={"token": mailer.last_link_token()}
    )
    assert response.status_code == 200
    set_cookie = response.headers["set-cookie"]
    assert auth.SESSION_COOKIE in set_cookie
    assert "httponly" in set_cookie.lower()
    assert "samesite=lax" in set_cookie.lower()
    assert response.json()["display_name"] == "Anna"

    me = await client.get("/api/v1/me")
    assert me.status_code == 200
    assert me.json()["id"] == str(user.id)


async def test_unknown_email_without_invitation_gets_no_mail(client, mailer):
    response = await client.post("/api/v1/auth/magic-link", json={"email": "fremd@example.org"})
    assert response.status_code == 202  # gleiche Antwort wie bei bekannten Adressen
    assert mailer.sent == []


async def test_invalid_email_is_422_problem(client):
    response = await client.post("/api/v1/auth/magic-link", json={"email": "keine-mail"})
    assert is_problem(response, 422)
    assert response.json()["errors"]


async def test_magic_link_only_once(client, session, mailer):
    user = await make_user(session)
    await client.post("/api/v1/auth/magic-link", json={"email": user.email})
    token = mailer.last_link_token()
    first = await client.post("/api/v1/auth/magic-link/verify", json={"token": token})
    assert first.status_code == 200
    second = await client.post("/api/v1/auth/magic-link/verify", json={"token": token})
    assert is_problem(second, 410)


async def test_expired_magic_link_is_410(client, session, mailer):
    user = await make_user(session)
    await client.post("/api/v1/auth/magic-link", json={"email": user.email})
    token = mailer.last_link_token()
    link = await session.get(MagicLink, hash_token(token))
    link.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await session.flush()
    response = await client.post("/api/v1/auth/magic-link/verify", json={"token": token})
    assert is_problem(response, 410)
    assert "set-cookie" not in response.headers


async def test_unknown_token_is_410(client):
    response = await client.post("/api/v1/auth/magic-link/verify", json={"token": "x" * 43})
    assert is_problem(response, 410)


async def test_only_hash_is_stored(client, session, mailer):
    user = await make_user(session)
    await client.post("/api/v1/auth/magic-link", json={"email": user.email})
    token = mailer.last_link_token()
    links = list(await session.scalars(select(MagicLink).where(MagicLink.email == user.email)))
    assert len(links) == 1
    assert links[0].token_hash == hash_token(token)
    assert token.encode() not in links[0].token_hash


async def test_rate_limit_per_address(client, session, mailer):
    user = await make_user(session)
    for _ in range(7):
        response = await client.post("/api/v1/auth/magic-link", json={"email": user.email})
        assert response.status_code == 202
    assert len(mailer.sent) == 5


async def test_logout_ends_session(client, session):
    user = await make_user(session)
    token = await login(client, session, user)
    assert (await client.get("/api/v1/me")).status_code == 200

    response = await client.post("/api/v1/auth/logout")
    assert response.status_code == 204
    assert await session.get(UserSession, hash_token(token)) is None
    client.cookies.set(auth.SESSION_COOKIE, token)
    assert (await client.get("/api/v1/me")).status_code == 401


async def test_expired_session_is_401(client, session):
    user = await make_user(session)
    token = await login(client, session, user)
    sess = await session.get(UserSession, hash_token(token))
    sess.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    await session.flush()
    assert (await client.get("/api/v1/me")).status_code == 401


async def test_session_slides(client, session):
    user = await make_user(session)
    token = await login(client, session, user)
    sess = await session.get(UserSession, hash_token(token))
    sess.expires_at = datetime.now(UTC) + timedelta(days=30)
    await session.flush()

    response = await client.get("/api/v1/me")
    assert response.status_code == 200
    assert auth.SESSION_COOKIE in response.headers.get("set-cookie", "")
    await session.refresh(sess)
    assert sess.expires_at > datetime.now(UTC) + timedelta(days=360)


async def test_fresh_session_is_not_rewritten(client, session):
    user = await make_user(session)
    await login(client, session, user)
    response = await client.get("/api/v1/me")
    assert "set-cookie" not in response.headers
