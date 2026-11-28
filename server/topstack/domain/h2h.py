"""Head-to-Head ohne Datenbank (F-22, Phase 5 AP-6).

Bilanz zweier Spieler aus ihren gemeinsamen Matches, ab dem ersten Match (Festlegung vom
22.11.2026). Importierte Matches aus den Altdaten zählen mit und werden gezählt, damit die
App sie markieren kann (ADR-0019).
"""

from __future__ import annotations

from collections.abc import Hashable, Iterable
from dataclasses import dataclass, field
from datetime import date


@dataclass(frozen=True)
class Meeting[P: Hashable]:
    a: P
    b: P
    games_a: int
    games_b: int
    games_drawn: int
    played_on: date
    set_code: str
    imported: bool


@dataclass
class Pair[P: Hashable]:
    """Bilanz aus Sicht von ``a``."""

    a: P
    b: P
    wins: int = 0
    draws: int = 0
    losses: int = 0
    games_won: int = 0
    games_lost: int = 0
    imported: int = 0  # davon aus Altdaten
    meetings: list[Meeting[P]] = field(default_factory=list)

    @property
    def played(self) -> int:
        return self.wins + self.draws + self.losses

    def add(self, m: Meeting[P]) -> None:
        mine, theirs = (m.games_a, m.games_b) if m.a == self.a else (m.games_b, m.games_a)
        if mine > theirs:
            self.wins += 1
        elif mine < theirs:
            self.losses += 1
        else:
            self.draws += 1
        self.games_won += mine
        self.games_lost += theirs
        self.imported += m.imported
        self.meetings.append(m)


def pair[P: Hashable](meetings: Iterable[Meeting[P]], a: P, b: P) -> Pair[P]:
    """Direktvergleich von ``a`` gegen ``b``; Begegnungen in der gegebenen Reihenfolge."""
    p: Pair[P] = Pair(a, b)
    for m in meetings:
        if {m.a, m.b} == {a, b}:
            p.add(m)
    return p


def matrix[P: Hashable](meetings: Iterable[Meeting[P]]) -> dict[tuple[P, P], Pair[P]]:
    """Alle Paarungen in beide Richtungen: ``(a, b)`` ist die Bilanz von a gegen b."""
    pairs: dict[tuple[P, P], Pair[P]] = {}
    for m in meetings:
        for me, other in ((m.a, m.b), (m.b, m.a)):
            pairs.setdefault((me, other), Pair(me, other)).add(m)
    return pairs
