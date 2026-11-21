"""Live-Verteiler für den WebSocket (ADR-0006, AP-7).

Ein API-Prozess, deshalb reicht ein Verteiler im Speicher. Kommt später ein zweiter
Prozess dazu, wird ``publish`` über PostgreSQL ``LISTEN/NOTIFY`` verteilt.
"""

import asyncio
import contextlib
import logging
from typing import Any, Protocol

log = logging.getLogger(__name__)

SEND_TIMEOUT_S = 2.0


class Socket(Protocol):
    async def send_json(self, data: Any) -> None: ...


class Hub:
    def __init__(self) -> None:
        self._topics: dict[str, set[Socket]] = {}

    def subscribe(self, socket: Socket, topic: str) -> None:
        self._topics.setdefault(topic, set()).add(socket)

    def unsubscribe(self, socket: Socket, topic: str) -> None:
        subs = self._topics.get(topic)
        if subs is not None:
            subs.discard(socket)
            if not subs:
                del self._topics[topic]

    def disconnect(self, socket: Socket) -> None:
        for topic in list(self._topics):
            self.unsubscribe(socket, topic)

    def subscribers(self, topic: str) -> int:
        return len(self._topics.get(topic, ()))

    async def publish(self, topic: str, message: dict[str, Any]) -> None:
        """An alle Abonnenten; wer nicht rechtzeitig annimmt, fliegt raus und lädt später nach."""
        subs = list(self._topics.get(topic, ()))
        if not subs:
            return
        payload = {**message, "topic": topic}
        results = await asyncio.gather(
            *(asyncio.wait_for(s.send_json(payload), SEND_TIMEOUT_S) for s in subs),
            return_exceptions=True,
        )
        for socket, result in zip(subs, results, strict=True):
            if isinstance(result, BaseException):
                log.info("WebSocket ohne Antwort, wird abgemeldet: %s", result)
                self.disconnect(socket)


hub = Hub()


def tournament_topic(tid: object) -> str:
    return f"tournament:{tid}"


async def tournament_changed(tid: object, reason: str) -> None:
    """Hinweis an alle Zuschauer: Stand per REST neu laden (Runde, Ergebnis, Status …)."""
    with contextlib.suppress(Exception):
        await hub.publish(
            tournament_topic(tid),
            {"type": "tournament.updated", "tournament_id": str(tid), "reason": reason},
        )


async def game_events(tid: object, match_id: object, events: list[dict[str, Any]]) -> None:
    """Neue Lebenspunkte live; die Ereignisse haben dasselbe Format wie im REST-Stapel."""
    if not events:
        return
    with contextlib.suppress(Exception):
        await hub.publish(
            tournament_topic(tid),
            {"type": "game.events", "match_id": str(match_id), "events": events},
        )
