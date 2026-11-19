"""Anmeldung per Magic-Link und Abmeldung (ADR-0008).

Abweichung vom ersten Entwurf in docs/schnittstellen.md: Der Link in der Mail führt zur
App (``/anmelden?token=…``), die ihn per ``POST /auth/magic-link/verify`` einlöst. Ein
``GET`` würde von Link-Prüfern in Mailprogrammen (z. B. Outlook Safe Links) schon vor dem
Klick aufgerufen und den einmaligen Link verbrauchen.
"""

from fastapi import APIRouter, Request, Response, status

from topstack.api.deps import Db, MailerDep, clear_session_cookie, set_session_cookie
from topstack.api.me import build_me
from topstack.api.problems import problem
from topstack.api.schemas import Accepted, MagicLinkRequest, MagicLinkVerify, Me
from topstack.services import auth

router = APIRouter(prefix="/auth", tags=["Anmeldung"])


@router.post("/magic-link", status_code=status.HTTP_202_ACCEPTED)
async def request_magic_link(body: MagicLinkRequest, db: Db, mailer: MailerDep) -> Accepted:
    """Antwortet immer gleich, damit niemand herausfindet, welche Adressen ein Konto haben."""
    await auth.request_magic_link(
        db, mailer, email=str(body.email), invitation_token=body.invitation
    )
    await db.commit()
    return Accepted()


@router.post("/magic-link/verify")
async def verify_magic_link(
    body: MagicLinkVerify, request: Request, response: Response, db: Db
) -> Me:
    try:
        user = await auth.redeem_magic_link(db, token=body.token, invitation_token=body.invitation)
    except auth.LinkGone:
        raise problem(410, "Der Link ist abgelaufen oder wurde schon benutzt.") from None
    except auth.NoAccount:
        await db.commit()  # Link trotzdem verbrauchen
        raise problem(
            403, "Zu dieser Adresse gibt es kein Konto. Du brauchst eine Einladung."
        ) from None
    token = await auth.create_session(db, user, request.headers.get("user-agent"))
    await db.commit()
    set_session_cookie(response, token)
    return await build_me(db, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, db: Db) -> Response:
    token = request.cookies.get(auth.SESSION_COOKIE)
    if token:
        await auth.delete_session(db, token)
        await db.commit()
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_session_cookie(response)
    return response
