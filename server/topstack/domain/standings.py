"""Turniertabelle mit Tiebreakern (F-16, Punkteregeln vom 15.11.2026).

Reihenfolge bei Punktgleichheit:
1. Matchpunkte (Standard 3/1/0)
2. Direkter Vergleich; bei drei oder mehr Gleichen eine Mini-Tabelle nur aus deren
   Matches untereinander. Trennt die Mini-Tabelle nur teilweise, wird sie für die
   verbleibenden Gleichen erneut nur aus deren Matches gebildet.
3. Spieldifferenz (gewonnene minus verlorene Spiele, über das ganze Turnier)
4. Mehr gewonnene Spiele
5. W20-Wurf in der App – ist noch kein Wurf bekannt, wird `needs_roll` gesetzt.
"""

from collections import defaultdict
from collections.abc import Hashable, Iterable, Mapping
from dataclasses import dataclass, field


@dataclass(frozen=True)
class MatchResult[P: Hashable]:
    player_a: P
    player_b: P
    games_a: int
    games_b: int
    games_drawn: int = 0

    @property
    def is_draw(self) -> bool:
        return self.games_a == self.games_b


@dataclass(frozen=True)
class MatchPoints:
    win: int = 3
    draw: int = 1
    loss: int = 0


@dataclass
class StandingRow[P: Hashable]:
    player: P
    rank: int = 0
    played: int = 0
    wins: int = 0
    draws: int = 0
    losses: int = 0
    match_points: int = 0
    games_won: int = 0
    games_lost: int = 0
    needs_roll: bool = False
    tied_with: list[P] = field(default_factory=list)

    @property
    def game_diff(self) -> int:
        return self.games_won - self.games_lost


def _points_between[P: Hashable](
    group: set[P], results: Iterable[MatchResult[P]], pts: MatchPoints
) -> dict[P, int]:
    mini: dict[P, int] = {p: 0 for p in group}
    for m in results:
        if m.player_a in group and m.player_b in group:
            for me, my_games, their_games in (
                (m.player_a, m.games_a, m.games_b),
                (m.player_b, m.games_b, m.games_a),
            ):
                if my_games > their_games:
                    mini[me] += pts.win
                elif my_games == their_games:
                    mini[me] += pts.draw
                else:
                    mini[me] += pts.loss
    return mini


def _partition[P: Hashable](items: list[P], key) -> list[list[P]]:
    buckets: dict[object, list[P]] = defaultdict(list)
    for item in items:
        buckets[key(item)].append(item)
    return [buckets[k] for k in sorted(buckets, reverse=True)]


def compute_standings[P: Hashable](
    players: Iterable[P],
    results: Iterable[MatchResult[P]],
    points: MatchPoints | None = None,
    rolls: Mapping[P, int] | None = None,
) -> list[StandingRow[P]]:
    results = list(results)
    points = points or MatchPoints()
    rows: dict[P, StandingRow[P]] = {p: StandingRow(player=p) for p in players}

    for m in results:
        for me, my_games, their_games in (
            (m.player_a, m.games_a, m.games_b),
            (m.player_b, m.games_b, m.games_a),
        ):
            row = rows[me]
            row.played += 1
            row.games_won += my_games
            row.games_lost += their_games
            if my_games > their_games:
                row.wins += 1
                row.match_points += points.win
            elif my_games == their_games:
                row.draws += 1
                row.match_points += points.draw
            else:
                row.losses += 1
                row.match_points += points.loss

    rolls = rolls or {}

    def resolve(group: list[P]) -> list[list[P]]:
        """Sortiert eine punktgleiche Gruppe; Rückgabe: Liste von (ggf. weiter gleichen) Blöcken."""
        if len(group) == 1:
            return [group]
        mini = _points_between(set(group), results, points)
        parts = _partition(group, key=lambda p: mini[p])
        if len(parts) > 1:
            return [block for part in parts for block in resolve(part)]
        # Mini-Tabelle trennt nicht: Spieldifferenz, dann gewonnene Spiele
        parts = _partition(group, key=lambda p: (rows[p].game_diff, rows[p].games_won))
        blocks: list[list[P]] = []
        for part in parts:
            if len(part) == 1:
                blocks.append(part)
                continue
            # Letzte Stufe: W20-Wurf
            known = [p for p in part if p in rolls]
            if len(known) == len(part):
                blocks.extend(_partition(part, key=lambda p: rolls[p]))
            else:
                blocks.append(part)
        return blocks

    ordered: list[list[P]] = []
    for tier in _partition(list(rows), key=lambda p: rows[p].match_points):
        ordered.extend(resolve(tier))

    result: list[StandingRow[P]] = []
    rank = 1
    for block in ordered:
        for p in block:
            row = rows[p]
            row.rank = rank
            if len(block) > 1:
                row.needs_roll = True
                row.tied_with = [q for q in block if q != p]
            result.append(row)
        rank += len(block)
    return result
