"""WebSocket ``/ws`` für die Live-Ansicht (ADR-0006, F-15, N-04).

Anmeldung über das Sitzungs-Cookie. Abonnieren darf ein Turnier, wer es auch per REST
sehen darf (Mitglieder der Gruppe). Nachrichten sind Hinweise: Die App lädt bei
``tournament.updated`` den Stand per REST nach; ``game.events`` bringt neue Lebenspunkte
direkt mit.
"""

import asyncio
import contextlib
import uuid
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager
from typing import Any, Protocol

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from topstack.db.models import AppUser
from topstack.db.session import get_sessionmaker
from topstack.live import Hub, hub, tournament_topic
from topstack.services import auth
from topstack.services import tournaments as svc

router = APIRouter(tags=["Live"])

PING_INTERVAL_S = 25.0
CLOSE_UNAUTHORIZED = 4401

SessionScope = Callable[[], AbstractAsyncContextManager[AsyncSession]]


class Client(Protocol):
    cookies: dict[str, str]

    async def accept(self) -> None: ...
    async def close(self, code: int = 1000) -> None: ...
    async def receive_json(self) -> Any: ...
    async def send_json(self, data: Any) -> None: ...


@contextlib.asynccontextmanager
async def _default_scope() -> AsyncIterator[AsyncSession]:
    async with get_sessionmaker()() as session:
        yield session


async def _user(scope: SessionScope, token: str | None) -> AppUser | None:
    if not token:
        return None
    async with scope() as db:
        resolved = await auth.resolve_session(db, token)
        if resolved is None:
            return None
        await db.commit()  # gleitende Verlängerung wie bei REST
        return resolved.user


async def _may_watch(scope: SessionScope, user: AppUser, topic: str) -> bool:
    kind, _, raw = topic.partition(":")
    if kind != "tournament":
        return False
    try:
        tid = uuid.UUID(raw)
    except ValueError:
        return False
    async with scope() as db:
        try:
            await svc.load(db, tid, user)
        except (svc.NotFound, svc.Forbidden):
            return False
    return True


async def serve(ws: Client, scope: SessionScope = _default_scope, live: Hub = hub) -> None:
    user = await _user(scope, ws.cookies.get(auth.SESSION_COOKIE))
    if user is None:
        await ws.close(code=CLOSE_UNAUTHORIZED)
        return
    await ws.accept()

    async def ping() -> None:
        while True:
            await asyncio.sleep(PING_INTERVAL_S)
            await ws.send_json({"type": "ping"})

    pinger = asyncio.create_task(ping())
    try:
        while True:
            msg = await ws.receive_json()
            if not isinstance(msg, dict):
                continue
            kind, topic = msg.get("type"), msg.get("topic")
            if kind == "subscribe" and isinstance(topic, str):
                if await _may_watch(scope, user, topic):
                    live.subscribe(ws, topic)
                    await ws.send_json({"type": "subscribed", "topic": topic})
                else:
                    await ws.send_json(
                        {
                            "type": "error",
                            "topic": topic,
                            "detail": "Kein Zugriff auf dieses Turnier.",
                        }
                    )
            elif kind == "unsubscribe" and isinstance(topic, str):
                live.unsubscribe(ws, topic)
            # "pong" und Unbekanntes: nichts zu tun
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        pinger.cancel()
        live.disconnect(ws)


@router.websocket("/ws")
async def websocket(ws: WebSocket) -> None:
    await serve(ws)


__all__ = ["router", "serve", "tournament_topic"]
