"""Sitzungen und Magic-Links (ADR-0008).

- Sitzung: zufälliges Token im HttpOnly-Cookie, in der Tabelle ``session`` nur der Hash;
  gültig ``session_days`` Tage, gleitend verlängert (höchstens einmal am Tag geschrieben).
- Magic-Link: 15 Minuten gültig, einmal nutzbar. Konten entstehen nur mit gültiger
  Einladung; unbekannte Adressen ohne Einladung bekommen stillschweigend keine Mail.
"""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from topstack.config import settings
from topstack.db.models import AppUser, MagicLink, UserSession
from topstack.db.repo import accounts
from topstack.services import invitations
from topstack.services.mail import Mail, Mailer
from topstack.services.tokens import hash_token, new_token

log = logging.getLogger("topstack.auth")

SESSION_COOKIE = "topstack_session"


class LinkGone(Exception):
    """Magic-Link unbekannt, abgelaufen oder schon benutzt."""


class NoAccount(Exception):
    """Gültiger Link, aber kein Konto und keine gültige Einladung."""


def now() -> datetime:
    return datetime.now(UTC)


# ---------------------------------------------------------------------------
# Sitzungen
# ---------------------------------------------------------------------------


async def create_session(db: AsyncSession, user: AppUser, user_agent: str | None) -> str:
    token = new_token()
    db.add(
        UserSession(
            token_hash=hash_token(token),
            app_user_id=user.id,
            expires_at=now() + timedelta(days=settings.session_days),
            user_agent=(user_agent or "")[:300] or None,
        )
    )
    await db.flush()
    return token


@dataclass
class Resolved:
    user: AppUser
    session: UserSession
    extended: bool


async def resolve_session(db: AsyncSession, token: str) -> Resolved | None:
    """Gültige Sitzung zum Cookie, verlängert sie bei Bedarf (gleitend)."""
    sess = await db.get(UserSession, hash_token(token))
    if sess is None or sess.expires_at <= now():
        return None
    user = await db.get(AppUser, sess.app_user_id)
    if user is None or user.deleted_at is not None:
        return None
    extended = False
    target = now() + timedelta(days=settings.session_days)
    if target - sess.expires_at > timedelta(days=1):
        sess.expires_at = target
        extended = True
    return Resolved(user, sess, extended)


async def delete_session(db: AsyncSession, token: str) -> None:
    await db.execute(delete(UserSession).where(UserSession.token_hash == hash_token(token)))


# ---------------------------------------------------------------------------
# Magic-Links
# ---------------------------------------------------------------------------


def _mail_text(link: str, group_name: str | None) -> str:
    intro = (
        f"du bist in die TopStack-Gruppe „{group_name}“ eingeladen."
        if group_name
        else "hier ist dein Anmeldelink für TopStack."
    )
    return (
        f"Hallo,\n\n{intro}\n\n"
        f"Zum Anmelden diesen Link öffnen (gültig {settings.magic_link_minutes} Minuten, "
        f"nur einmal nutzbar):\n{link}\n\n"
        "Hast du das nicht angefordert, kannst du diese Mail einfach löschen.\n\n"
        "TopStack\n"
    )


async def request_magic_link(
    db: AsyncSession, mailer: Mailer, *, email: str, invitation_token: str | None
) -> bool:
    """Legt einen Link an und verschickt ihn. Gibt zurück, ob eine Mail rausging."""
    email = accounts.normalize_email(email)
    user = await accounts.get_user_by_email(db, email)
    invitation = await invitations.get_valid(db, invitation_token) if invitation_token else None
    if user is None and invitation is None:
        log.info("Magic-Link für unbekannte Adresse ohne Einladung verworfen")
        return False

    recent = await db.scalar(
        select(func.count())
        .select_from(MagicLink)
        .where(MagicLink.email == email, MagicLink.expires_at > now())
    )
    if (recent or 0) >= settings.magic_links_per_quarter_hour:
        log.warning("Zu viele Magic-Links für eine Adresse, Anfrage verworfen")
        return False

    token = new_token()
    db.add(
        MagicLink(
            token_hash=hash_token(token),
            email=email,
            expires_at=now() + timedelta(minutes=settings.magic_link_minutes),
        )
    )
    await db.flush()

    link = f"{settings.public_origin}/anmelden?token={token}"
    group_name = None
    if invitation is not None:
        link += f"&einladung={invitation_token}"
        group_name = await invitations.group_name(db, invitation)
    await mailer.send(
        Mail(to=email, subject="Dein Anmeldelink für TopStack", text=_mail_text(link, group_name))
    )
    return True


async def redeem_magic_link(
    db: AsyncSession, *, token: str, invitation_token: str | None
) -> AppUser:
    """Löst einen Link ein. Ohne Konto wird mit gültiger Einladung eines angelegt."""
    link = await db.get(MagicLink, hash_token(token), with_for_update=True)
    if link is None or link.used_at is not None or link.expires_at <= now():
        raise LinkGone
    link.used_at = now()

    user = await accounts.get_user_by_email(db, link.email)
    invitation = (
        await invitations.get_valid(db, invitation_token, lock=True) if invitation_token else None
    )
    if user is None:
        if invitation is None:
            raise NoAccount
        user = await accounts.create_user(
            db, email=link.email, display_name=link.email.split("@", 1)[0][:40]
        )
    if invitation is not None:
        await invitations.accept(db, invitation, user)
    return user
