"""Passkey anlegen und damit anmelden (TC-03), mit einem Software-Passkey."""

import pytest

pytest.importorskip("webauthn")
pytest.importorskip("cbor2")

from sqlalchemy import select  # noqa: E402

from tests.api.helpers import is_problem, login  # noqa: E402
from tests.api.soft_authenticator import SoftAuthenticator  # noqa: E402
from tests.db.factories import make_user  # noqa: E402
from topstack.db.models import PasskeyCredential, WebauthnChallenge  # noqa: E402
from topstack.services import auth  # noqa: E402

BASE = "/api/v1/auth/passkey"


async def register(client, device: SoftAuthenticator):
    options = (await client.post(f"{BASE}/register/options")).json()
    return await client.post(f"{BASE}/register/verify", json=device.create(options))


async def passkey_login(client, device: SoftAuthenticator):
    options = (await client.post(f"{BASE}/login/options")).json()
    return await client.post(f"{BASE}/login/verify", json=device.get(options))


async def test_register_and_login_with_passkey(client, session):
    user = await make_user(session, "Anna")
    await login(client, session, user)
    device = SoftAuthenticator()

    options = (await client.post(f"{BASE}/register/options")).json()
    assert options["rp"] == {"id": "localhost", "name": "TopStack"}
    assert options["authenticatorSelection"]["residentKey"] == "required"
    response = await client.post(f"{BASE}/register/verify", json=device.create(options))
    assert response.status_code == 201, response.text
    assert response.json()["id"] == device.id
    assert (await client.get("/api/v1/me")).json()["has_passkey"] is True

    stored = await session.scalar(
        select(PasskeyCredential).where(PasskeyCredential.app_user_id == user.id)
    )
    assert stored.transports == ["internal", "hybrid"]

    await client.post("/api/v1/auth/logout")
    client.cookies.clear()
    assert (await client.get("/api/v1/me")).status_code == 401

    response = await passkey_login(client, device)
    assert response.status_code == 200, response.text
    assert response.json()["display_name"] == "Anna"
    assert auth.SESSION_COOKIE in response.headers["set-cookie"]
    assert (await client.get("/api/v1/me")).status_code == 200

    await session.refresh(stored)
    assert stored.sign_count == device.count
    assert stored.last_used_at is not None


async def test_register_needs_login(client):
    assert is_problem(await client.post(f"{BASE}/register/options"), 401)


async def test_second_registration_excludes_known_passkey(client, session):
    user = await make_user(session)
    await login(client, session, user)
    device = SoftAuthenticator()
    assert (await register(client, device)).status_code == 201
    options = (await client.post(f"{BASE}/register/options")).json()
    assert [c["id"] for c in options["excludeCredentials"]] == [device.id]


async def test_challenge_is_single_use(client, session):
    user = await make_user(session)
    await login(client, session, user)
    device = SoftAuthenticator()
    await register(client, device)
    client.cookies.clear()

    options = (await client.post(f"{BASE}/login/options")).json()
    assertion = device.get(options)
    assert (await client.post(f"{BASE}/login/verify", json=assertion)).status_code == 200
    # gleiche Antwort noch einmal: Challenge ist verbraucht
    replay = await client.post(f"{BASE}/login/verify", json=assertion)
    assert is_problem(replay, 401)


async def test_replay_with_new_challenge_fails(client, session):
    user = await make_user(session)
    await login(client, session, user)
    device = SoftAuthenticator()
    await register(client, device)
    client.cookies.clear()

    old = device.get((await client.post(f"{BASE}/login/options")).json())
    await client.post(f"{BASE}/login/options")  # neue Challenge im Cookie
    assert is_problem(await client.post(f"{BASE}/login/verify", json=old), 401)


async def test_unknown_passkey_is_401(client):
    stranger = SoftAuthenticator()
    stranger.user_handle = "AAAA"
    assert is_problem(await passkey_login(client, stranger), 401)


async def test_login_without_options_is_401(client, session):
    user = await make_user(session)
    await login(client, session, user)
    device = SoftAuthenticator()
    await register(client, device)
    client.cookies.clear()
    fake_options = {"challenge": "AAAAAAAAAAAAAAAAAAAAAA"}
    assert is_problem(await client.post(f"{BASE}/login/verify", json=device.get(fake_options)), 401)


async def test_wrong_origin_is_rejected(client, session):
    user = await make_user(session)
    await login(client, session, user)
    phishing = SoftAuthenticator(origin="https://topstack.example")
    assert is_problem(await register(client, phishing), 400)
    assert await session.scalar(select(PasskeyCredential)) is None


async def test_challenges_are_removed_after_use(client, session):
    user = await make_user(session)
    await login(client, session, user)
    await register(client, SoftAuthenticator())
    assert await session.scalar(select(WebauthnChallenge)) is None
