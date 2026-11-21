"""Web Push (F-17, AP-8).

Abos pro Gerät in ``push_subscription``, Einstellungen pro Ereignis in
``notification_pref`` (fehlt eine Zeile, ist das Ereignis an). Gesendet wird nach dem
Speichern im Hintergrund, damit keine Antwort an die App auf Push-Dienste wartet.
Abgelaufene Abos (404/410) werden beim Senden entfernt.
"""

import asyncio
import contextlib
import json
import logging
import uuid
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from topstack.config import settings
from topstack.db.models import NotificationPref, PushSubscription
from topstack.db.session import get_sessionmaker

log = logging.getLogger(__name__)

# Reihenfolge = Anzeige im Profil
EVENTS: dict[str, str] = {
    "your_turn": "Du bist dran",
    "new_round": "Neue Runde",
    "tournament_end": "Turnierende",
    "invitation": "Einladung zu einem Turnier",
    "result_corrected": "Ergebnis korrigiert",
    "cancel_requested": "Abbruch beantragt",
}

TTL_S = 6 * 3600  # Nachrichten, die nach 6 Stunden noch nicht zugestellt sind, verfallen


@dataclass(frozen=True)
class Message:
    title: str
    body: str
    url: str = "/"
    tag: str | None = None  # gleiche Tags ersetzen sich auf dem Handy

    def payload(self) -> str:
        data = {"title": self.title, "body": self.body, "url": self.url}
        if self.tag:
            data["tag"] = self.tag
        return json.dumps(data, ensure_ascii=False)


@dataclass(frozen=True)
class Delivery:
    subscription_id: uuid.UUID
    endpoint: str
    p256dh: str
    auth: str
    payload: str


class Gone(Exception):
    """Abo gibt es beim Push-Dienst nicht mehr."""


def _webpush_send(d: Delivery) -> None:
    from pywebpush import WebPushException, webpush

    try:
        webpush(
            subscription_info={
                "endpoint": d.endpoint,
                "keys": {"p256dh": d.p256dh, "auth": d.auth},
            },
            data=d.payload,
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
            ttl=TTL_S,
            timeout=10,
        )
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        if status in (404, 410):
            raise Gone from exc
        raise


# Austauschbar für Tests
sender: Callable[[Delivery], None] = _webpush_send


@contextlib.asynccontextmanager
async def _default_scope() -> AsyncIterator[AsyncSession]:
    async with get_sessionmaker()() as session:
        yield session


session_scope: Callable[[], AbstractAsyncContextManager[AsyncSession]] = _default_scope
_pending: set[asyncio.Task[None]] = set()


def enabled() -> bool:
    """Ohne VAPID-Schlüssel wird nichts gesendet (in Tests ersetzt ``sender`` den Versand)."""
    keys = bool(settings.vapid_public_key and settings.vapid_private_key)
    return keys or sender is not _webpush_send


async def drain() -> None:
    """Auf laufende Zustellungen warten (Tests, sauberes Herunterfahren)."""
    while _pending:
        await asyncio.gather(*list(_pending), return_exceptions=True)


# ---------------------------------------------------------------------------
# Abos und Einstellungen
# ---------------------------------------------------------------------------


async def subscribe(
    db: AsyncSession, user_id: uuid.UUID, endpoint: str, p256dh: str, auth: str
) -> None:
    """Abo speichern; gehört der Endpunkt schon jemandem, wechselt er zu diesem Nutzer."""
    sub = await db.scalar(select(PushSubscription).where(PushSubscription.endpoint == endpoint))
    if sub is None:
        db.add(PushSubscription(app_user_id=user_id, endpoint=endpoint, p256dh=p256dh, auth=auth))
    else:
        sub.app_user_id, sub.p256dh, sub.auth = user_id, p256dh, auth
    await db.flush()


async def unsubscribe(db: AsyncSession, user_id: uuid.UUID, endpoint: str) -> None:
    await db.execute(
        delete(PushSubscription).where(
            PushSubscription.endpoint == endpoint, PushSubscription.app_user_id == user_id
        )
    )


async def subscription_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    rows = await db.scalars(
        select(PushSubscription.id).where(PushSubscription.app_user_id == user_id)
    )
    return len(list(rows))


async def prefs(db: AsyncSession, user_id: uuid.UUID) -> dict[str, bool]:
    stored = {
        p.event: p.enabled
        for p in await db.scalars(
            select(NotificationPref).where(NotificationPref.app_user_id == user_id)
        )
    }
    return {event: stored.get(event, True) for event in EVENTS}


async def set_pref(db: AsyncSession, user_id: uuid.UUID, event: str, on: bool) -> None:
    if event not in EVENTS:
        raise KeyError(event)
    pref = await db.get(NotificationPref, (user_id, event))
    if pref is None:
        db.add(NotificationPref(app_user_id=user_id, event=event, enabled=on))
    else:
        pref.enabled = on
    await db.flush()


# ---------------------------------------------------------------------------
# Senden
# ---------------------------------------------------------------------------


async def send(db: AsyncSession, items: list[tuple[uuid.UUID, str, Message]]) -> list[Delivery]:
    """Nachrichten an Nutzer; abgeschaltete Ereignisse fallen weg. Zustellung im Hintergrund."""
    if not items or not enabled():
        return []
    users = {u for u, _, _ in items}
    off = {
        (p.app_user_id, p.event)
        for p in await db.scalars(
            select(NotificationPref).where(
                NotificationPref.app_user_id.in_(users), NotificationPref.enabled.is_(False)
            )
        )
    }
    subs: dict[uuid.UUID, list[PushSubscription]] = {}
    for s in await db.scalars(
        select(PushSubscription).where(PushSubscription.app_user_id.in_(users))
    ):
        subs.setdefault(s.app_user_id, []).append(s)
    deliveries = [
        Delivery(s.id, s.endpoint, s.p256dh, s.auth, msg.payload())
        for user, event, msg in items
        if (user, event) not in off
        for s in subs.get(user, [])
    ]
    if deliveries:
        task = asyncio.create_task(_deliver(deliveries))
        _pending.add(task)
        task.add_done_callback(_pending.discard)
    return deliveries


async def send_direct(db: AsyncSession, user_id: uuid.UUID, msg: Message) -> int:
    """An alle Geräte eines Nutzers, ohne Einstellungen (Test-Knopf im Profil)."""
    subs = list(
        await db.scalars(select(PushSubscription).where(PushSubscription.app_user_id == user_id))
    )
    deliveries = [Delivery(s.id, s.endpoint, s.p256dh, s.auth, msg.payload()) for s in subs]
    if deliveries:
        task = asyncio.create_task(_deliver(deliveries))
        _pending.add(task)
        task.add_done_callback(_pending.discard)
    return len(deliveries)


async def _deliver(deliveries: list[Delivery]) -> None:
    gone: list[uuid.UUID] = []

    async def one(d: Delivery) -> None:
        try:
            await asyncio.to_thread(sender, d)
        except Gone:
            gone.append(d.subscription_id)
        except Exception as exc:  # ein Handy darf die anderen nicht aufhalten
            log.warning("Push an %s… fehlgeschlagen: %s", d.endpoint[:40], exc)

    await asyncio.gather(*(one(d) for d in deliveries))
    if gone:
        async with session_scope() as db:
            await db.execute(delete(PushSubscription).where(PushSubscription.id.in_(gone)))
            await db.commit()


def public_key() -> str | None:
    return settings.vapid_public_key
