"""Vorschlag für freie Spieler: offenes Match vorziehen (F-08, UC-09).

Kandidaten sind noch nicht gespielte Matches, bei denen beide Spieler gerade frei sind.
Wer am längsten Pause hat, kommt zuerst dran.
"""

from collections.abc import Hashable, Iterable, Mapping
from datetime import datetime


def suggest_open_match[P: Hashable](
    free_players: Iterable[P],
    open_matches: Iterable[tuple[P, P]],
    idle_since: Mapping[P, datetime],
) -> tuple[P, P] | None:
    free = set(free_players)
    candidates = [m for m in open_matches if m[0] in free and m[1] in free]
    if not candidates:
        return None

    def wait_key(match: tuple[P, P]) -> tuple[datetime, datetime]:
        a, b = (idle_since.get(p, datetime.min) for p in match)
        # früheste Pause zuerst, dann die des Partners
        return (min(a, b), max(a, b))

    return min(candidates, key=wait_key)
