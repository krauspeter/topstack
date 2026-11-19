"""Passkeys (WebAuthn) mit der Bibliothek ``webauthn`` (ADR-0008).

Relying Party ist der Hostname von ``TOPSTACK_PUBLIC_ORIGIN`` (``topstack.win``). Die
Challenge liegt in der Tabelle ``webauthn_challenge``; der Browser kennt nur deren ID
(Cookie). Anmeldung ohne Benutzernamen über auffindbare Passkeys (resident keys).
"""

import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlsplit

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    AuthenticatorTransport,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from topstack.config import settings
from topstack.db.models import AppUser, PasskeyCredential, WebauthnChallenge

CHALLENGE_COOKIE = "topstack_webauthn"
CHALLENGE_MINUTES = 5
RP_NAME = "TopStack"


class PasskeyError(Exception):
    """Challenge fehlt oder abgelaufen, Antwort ungültig oder Passkey unbekannt."""


def now() -> datetime:
    return datetime.now(UTC)


def rp_id() -> str:
    return urlsplit(settings.public_origin).hostname or "localhost"


def _transports(values: list[str] | None) -> list[AuthenticatorTransport]:
    result = []
    for value in values or []:
        try:
            result.append(AuthenticatorTransport(value))
        except ValueError:
            continue
    return result


async def _store_challenge(
    db: AsyncSession, purpose: str, challenge: bytes, user: AppUser | None
) -> uuid.UUID:
    await db.execute(delete(WebauthnChallenge).where(WebauthnChallenge.expires_at <= now()))
    row = WebauthnChallenge(
        purpose=purpose,
        challenge=challenge,
        app_user_id=user.id if user else None,
        expires_at=now() + timedelta(minutes=CHALLENGE_MINUTES),
    )
    db.add(row)
    await db.flush()
    return row.id


async def _take_challenge(
    db: AsyncSession, challenge_id: str | None, purpose: str, user: AppUser | None
) -> bytes:
    """Holt die Challenge und löscht sie sofort (einmal nutzbar)."""
    try:
        cid = uuid.UUID(challenge_id or "")
    except ValueError:
        raise PasskeyError("Challenge fehlt") from None
    row = await db.get(WebauthnChallenge, cid, with_for_update=True)
    if row is None:
        raise PasskeyError("Challenge unbekannt")
    await db.delete(row)
    await db.flush()
    if (
        row.purpose != purpose
        or row.expires_at <= now()
        or (user is not None and row.app_user_id != user.id)
    ):
        raise PasskeyError("Challenge ungültig")
    return row.challenge


async def registration_options(
    db: AsyncSession, user: AppUser, existing: list[PasskeyCredential]
) -> tuple[dict[str, Any], uuid.UUID]:
    options = generate_registration_options(
        rp_id=rp_id(),
        rp_name=RP_NAME,
        user_id=user.id.bytes,
        user_name=user.email or user.display_name,
        user_display_name=user.display_name,
        exclude_credentials=[
            PublicKeyCredentialDescriptor(id=c.id, transports=_transports(c.transports))
            for c in existing
        ],
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
    )
    challenge_id = await _store_challenge(db, "register", options.challenge, user)
    return json.loads(options_to_json(options)), challenge_id


async def register(
    db: AsyncSession, user: AppUser, challenge_id: str | None, credential: dict[str, Any]
) -> PasskeyCredential:
    challenge = await _take_challenge(db, challenge_id, "register", user)
    try:
        verified = verify_registration_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=rp_id(),
            expected_origin=settings.public_origin,
        )
    except Exception as exc:  # noqa: BLE001  (Bibliothek wirft viele Fehlertypen)
        raise PasskeyError(f"Registrierung ungültig: {exc}") from exc
    if await db.get(PasskeyCredential, verified.credential_id) is not None:
        raise PasskeyError("Passkey ist schon registriert")
    transports = (credential.get("response") or {}).get("transports")
    passkey = PasskeyCredential(
        id=verified.credential_id,
        app_user_id=user.id,
        public_key=verified.credential_public_key,
        sign_count=verified.sign_count,
        transports=[t for t in transports if isinstance(t, str)] if transports else None,
    )
    db.add(passkey)
    await db.flush()
    return passkey


async def login_options(db: AsyncSession) -> tuple[dict[str, Any], uuid.UUID]:
    options = generate_authentication_options(
        rp_id=rp_id(), user_verification=UserVerificationRequirement.PREFERRED
    )
    challenge_id = await _store_challenge(db, "login", options.challenge, None)
    return json.loads(options_to_json(options)), challenge_id


async def login(db: AsyncSession, challenge_id: str | None, credential: dict[str, Any]) -> AppUser:
    challenge = await _take_challenge(db, challenge_id, "login", None)
    try:
        raw_id = base64url_to_bytes(str(credential.get("rawId") or credential.get("id") or ""))
    except Exception:  # noqa: BLE001
        raise PasskeyError("Passkey-ID ungültig") from None
    passkey = await db.get(PasskeyCredential, raw_id)
    if passkey is None:
        raise PasskeyError("Passkey unbekannt")
    try:
        verified = verify_authentication_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=rp_id(),
            expected_origin=settings.public_origin,
            credential_public_key=passkey.public_key,
            credential_current_sign_count=passkey.sign_count,
        )
    except Exception as exc:  # noqa: BLE001
        raise PasskeyError(f"Anmeldung ungültig: {exc}") from exc
    user = await db.get(AppUser, passkey.app_user_id)
    if user is None or user.deleted_at is not None:
        raise PasskeyError("Konto nicht mehr vorhanden")
    passkey.sign_count = verified.new_sign_count
    passkey.last_used_at = now()
    await db.flush()
    return user


def credential_id_text(passkey: PasskeyCredential) -> str:
    return bytes_to_base64url(passkey.id)
