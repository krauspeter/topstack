"""Lebenspunkte aus dem Ereignisprotokoll berechnen (ADR-0005).

Muss sich exakt wie `app/src/domain/lifeEvents.ts` verhalten.
"""

from collections.abc import Hashable, Iterable
from dataclasses import dataclass
from typing import Literal

EventType = Literal["game_start", "die_roll", "life", "undo", "game_end"]


@dataclass(frozen=True)
class GameEvent:
    id: str
    player_id: Hashable | None
    type: EventType
    device_id: str
    seq: int
    delta: int | None = None
    value: int | None = None
    undo_of: str | None = None


def life_totals[P: Hashable](
    players: Iterable[P], events: Iterable[GameEvent], starting_life: int = 20
) -> dict[P, int]:
    events = list(events)
    undone = {e.undo_of for e in events if e.type == "undo"}
    totals: dict[P, int] = {p: starting_life for p in players}
    for e in sorted(events, key=lambda ev: (ev.device_id, ev.seq)):
        if e.type == "life" and e.id not in undone and e.player_id in totals:
            totals[e.player_id] += e.delta or 0  # type: ignore[index]
    return totals
