"""Web Push: Abos und Einstellungen pro Ereignis (F-17, AP-8)."""

import uuid

from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from topstack.api.deps import CurrentUser, Db
from topstack.api.problems import problem
from topstack.services import push

router = APIRouter(tags=["Push"])


class VapidKey(BaseModel):
    key: str | None  # null = Push auf diesem Server nicht eingerichtet


class SubscriptionKeys(BaseModel):
    p256dh: str = Field(min_length=1, max_length=200)
    auth: str = Field(min_length=1, max_length=100)


class SubscriptionBody(BaseModel):
    """Genau das, was ``PushSubscription.toJSON()`` im Browser liefert."""

    endpoint: str = Field(min_length=10, max_length=2000)
    keys: SubscriptionKeys


class EventPref(BaseModel):
    event: str
    label: str
    enabled: bool


class NotificationSettings(BaseModel):
    devices: int  # Geräte mit Push-Abo
    events: list[EventPref]


class PrefBody(BaseModel):
    enabled: bool


class TestResult(BaseModel):
    sent: int


@router.get("/push/vapid-key")
async def vapid_key() -> VapidKey:
    return VapidKey(key=push.public_key())


@router.post("/push/subscriptions", status_code=status.HTTP_201_CREATED)
async def subscribe(body: SubscriptionBody, user: CurrentUser, db: Db) -> NotificationSettings:
    if not body.endpoint.startswith("https://"):
        raise problem(422, "Push-Adresse muss mit https:// beginnen.")
    await push.subscribe(db, user.id, body.endpoint, body.keys.p256dh, body.keys.auth)
    await db.commit()
    return await settings_out(db, user.id)


@router.delete("/push/subscriptions", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(endpoint: str, user: CurrentUser, db: Db) -> None:
    await push.unsubscribe(db, user.id, endpoint)
    await db.commit()


async def settings_out(db: Db, user_id: uuid.UUID) -> NotificationSettings:
    prefs = await push.prefs(db, user_id)
    return NotificationSettings(
        devices=await push.subscription_count(db, user_id),
        events=[EventPref(event=e, label=push.EVENTS[e], enabled=on) for e, on in prefs.items()],
    )


@router.get("/me/notifications")
async def get_settings(user: CurrentUser, db: Db) -> NotificationSettings:
    return await settings_out(db, user.id)


@router.put("/me/notifications/{event}")
async def set_pref(event: str, body: PrefBody, user: CurrentUser, db: Db) -> NotificationSettings:
    """Ein Ereignis ein- oder ausschalten."""
    if event not in push.EVENTS:
        raise problem(404, "Unbekanntes Ereignis.")
    await push.set_pref(db, user.id, event, body.enabled)
    await db.commit()
    return await settings_out(db, user.id)


@router.post("/push/test")
async def test_push(user: CurrentUser, db: Db) -> TestResult:
    """Testnachricht an alle eigenen Geräte, unabhängig von den Einstellungen."""
    if not push.enabled():
        raise problem(
            503, "Push ist auf diesem Server noch nicht eingerichtet (VAPID-Schlüssel fehlen)."
        )
    msg = push.Message("TopStack", "Push funktioniert auf diesem Gerät.", "/profil", "test")
    sent = await push.send_direct(db, user.id, msg)
    return TestResult(sent=sent)
