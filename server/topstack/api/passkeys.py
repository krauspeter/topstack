"""Passkey anlegen und mit Passkey anmelden (TC-03)."""

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Body, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select

from topstack.api.deps import CurrentUser, Db, set_session_cookie
from topstack.api.me import build_me
from topstack.api.problems import problem
from topstack.api.schemas import Me
from topstack.config import settings
from topstack.db.models import PasskeyCredential
from topstack.services import auth, passkeys

log = logging.getLogger("topstack.passkeys")
router = APIRouter(prefix="/auth/passkey", tags=["Anmeldung"])

COOKIE_PATH = "/api/v1/auth/passkey"
Credential = Annotated[dict[str, Any], Body()]


def _with_challenge_cookie(content: dict[str, Any], challenge_id: object) -> JSONResponse:
    response = JSONResponse(content)
    response.set_cookie(
        passkeys.CHALLENGE_COOKIE,
        str(challenge_id),
        max_age=passkeys.CHALLENGE_MINUTES * 60,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="strict",
        path=COOKIE_PATH,
    )
    return response


def _clear_challenge_cookie(response: Response) -> None:
    response.delete_cookie(
        passkeys.CHALLENGE_COOKIE,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="strict",
        path=COOKIE_PATH,
    )


@router.post("/register/options")
async def register_options(user: CurrentUser, db: Db) -> JSONResponse:
    existing = list(
        await db.scalars(select(PasskeyCredential).where(PasskeyCredential.app_user_id == user.id))
    )
    options, challenge_id = await passkeys.registration_options(db, user, existing)
    await db.commit()
    return _with_challenge_cookie(options, challenge_id)


@router.post("/register/verify", status_code=status.HTTP_201_CREATED)
async def register_verify(
    request: Request,
    response: Response,
    user: CurrentUser,
    db: Db,
    credential: Credential,
) -> dict[str, str]:
    try:
        passkey = await passkeys.register(
            db, user, request.cookies.get(passkeys.CHALLENGE_COOKIE), credential
        )
    except passkeys.PasskeyError as exc:
        await db.commit()  # verbrauchte Challenge trotzdem löschen
        log.info("Passkey-Registrierung abgelehnt: %s", exc)
        raise problem(400, "Der Passkey konnte nicht angelegt werden.") from None
    await db.commit()
    _clear_challenge_cookie(response)
    return {"id": passkeys.credential_id_text(passkey)}


@router.post("/login/options")
async def login_options(db: Db) -> JSONResponse:
    options, challenge_id = await passkeys.login_options(db)
    await db.commit()
    return _with_challenge_cookie(options, challenge_id)


@router.post("/login/verify")
async def login_verify(request: Request, response: Response, db: Db, credential: Credential) -> Me:
    try:
        user = await passkeys.login(db, request.cookies.get(passkeys.CHALLENGE_COOKIE), credential)
    except passkeys.PasskeyError as exc:
        await db.commit()
        log.info("Passkey-Anmeldung abgelehnt: %s", exc)
        raise problem(401, "Anmeldung mit Passkey fehlgeschlagen.") from None
    token = await auth.create_session(db, user, request.headers.get("user-agent"))
    await db.commit()
    set_session_cookie(response, token)
    _clear_challenge_cookie(response)
    return await build_me(db, user)
