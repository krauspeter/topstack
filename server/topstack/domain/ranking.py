"""Ranglistenpunkte pro Turnier (Punkteregeln vom 15.11.2026).

Punkte = Spielerzahl - Platz + 1, dazu Bonus für die ersten Plätze (Standard: +2 / +1).
Jeder Platz bekommt Punkte, der letzte immer 1.
"""

from collections.abc import Sequence

DEFAULT_PLACEMENT_BONUS: tuple[int, ...] = (2, 1)


def ranking_points(
    player_count: int,
    place: int,
    bonus: Sequence[int] = DEFAULT_PLACEMENT_BONUS,
) -> int:
    if player_count < 2:
        raise ValueError("Ein Turnier braucht mindestens 2 Spieler")
    if not 1 <= place <= player_count:
        raise ValueError(f"Platz {place} liegt außerhalb von 1..{player_count}")
    extra = bonus[place - 1] if place <= len(bonus) else 0
    return player_count - place + 1 + extra
