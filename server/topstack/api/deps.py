"""Gemeinsame Abhängigkeiten: Datenbanksitzung, angemeldeter Nutzer, Sitzungs-Cookie."""

from typing import Annotated

from fastapi import Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from topstack.api.problems import problem
from topstack.config import settings
from topstack.db.models import AppUser
from topstack.db.session import get_session
from topstack.services import auth
from topstack.services.mail import Mailer, get_mailer

Db = Annotated[AsyncSession, Depends(get_session)]
MailerDep = Annotated[Mailer, Depends(get_mailer)]


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        auth.SESSION_COOKIE,
        token,
        max_age=settings.session_days * 24 * 3600,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        auth.SESSION_COOKIE, httponly=True, secure=settings.secure_cookies, samesite="lax", path="/"
    )


async def current_user(request: Request, response: Response, db: Db) -> AppUser:
    """Angemeldeter Nutzer oder ``401``. Verlängert die Sitzung gleitend."""
    token = request.cookies.get(auth.SESSION_COOKIE)
    resolved = await auth.resolve_session(db, token) if token else None
    if resolved is None:
        raise problem(401, "Bitte melde dich an.")
    if resolved.extended:
        await db.commit()
        set_session_cookie(response, token)
    return resolved.user


CurrentUser = Annotated[AppUser, Depends(current_user)]
