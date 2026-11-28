"""Elo-Wertung ohne Datenbank (F-19, Phase 5 AP-5, ADR-0019).

Die Elo wird jedes Mal aus den zeitlich sortierten Matches berechnet, nie fortgeschrieben.
Korrekturen, zusammengeführte Spieler und zurückgenommene Importe wirken dadurch sofort.

Regeln (Festlegung vom 22.11.2026): Start 1000, ein Match ist ein Spiel um Elo, Sieg 1,
Unentschieden 0,5, Niederlage 0. K = 40 in den ersten 10 Matches eines Spielers, danach 32.
Welche Matches zählen (ohne Gäste, ohne Altdaten), entscheidet der Aufrufer.
"""

from __future__ import annotations

from collections.abc import Hashable, Iterable
from dataclasses import dataclass, field
from datetime import date

START = 1000.0
K_NEW = 40
K = 32
NEW_MATCHES = 10


@dataclass(frozen=True)
class EloMatch[P: Hashable]:
    a: P
    b: P
    games_a: int
    games_b: int
    played_on: date


@dataclass
class EloPoint:
    played_on: date
    rating: float


@dataclass
class EloState:
    rating: float = START
    matches: int = 0
    history: list[EloPoint] = field(default_factory=list)

    @property
    def k(self) -> int:
        return K_NEW if self.matches < NEW_MATCHES else K


def expected(rating: float, other: float) -> float:
    """Erwartete Punkte gegen ``other`` (0 bis 1)."""
    return 1.0 / (1.0 + 10 ** ((other - rating) / 400))


def score(games_a: int, games_b: int) -> float:
    """Punkte für Spieler A: 1 Sieg, 0,5 Unentschieden, 0 Niederlage."""
    return 1.0 if games_a > games_b else 0.5 if games_a == games_b else 0.0


def ratings[P: Hashable](matches: Iterable[EloMatch[P]]) -> dict[P, EloState]:
    """Elo aller Spieler nach den Matches in der gegebenen Reihenfolge."""
    states: dict[P, EloState] = {}
    for m in matches:
        a = states.setdefault(m.a, EloState())
        b = states.setdefault(m.b, EloState())
        s = score(m.games_a, m.games_b)
        ea = expected(a.rating, b.rating)
        delta_a = a.k * (s - ea)
        delta_b = b.k * ((1 - s) - (1 - ea))
        a.rating += delta_a
        b.rating += delta_b
        for st in (a, b):
            st.matches += 1
            st.history.append(EloPoint(m.played_on, round(st.rating, 1)))
    return states
