"""Spielplan jeder gegen jeden nach dem Kreisverfahren (F-07, UC-08).

Bei ungerader Spielerzahl pausiert pro Runde genau ein Spieler.
Die ersten Paarungen sind zufällig, weil die Spielerliste vorher gemischt wird.
"""

import random
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Round[P]:
    number: int
    pairings: list[tuple[P, P]]
    bye: P | None = None


@dataclass
class Schedule[P]:
    rounds: list[Round[P]] = field(default_factory=list)

    def all_pairings(self) -> list[tuple[P, P]]:
        return [pair for rnd in self.rounds for pair in rnd.pairings]


def round_robin[P](players: list[P], rng: random.Random | None = None) -> Schedule[P]:
    if len(players) < 2:
        raise ValueError("Ein Spielplan braucht mindestens 2 Spieler")
    if len(set(players)) != len(players):
        raise ValueError("Spieler doppelt in der Liste")

    pool: list[P | None] = list(players)
    (rng or random.Random()).shuffle(pool)
    if len(pool) % 2:
        pool.append(None)  # Platzhalter für die Pause

    n = len(pool)
    schedule: Schedule[P] = Schedule()
    for r in range(n - 1):
        pairings: list[tuple[P, P]] = []
        bye: P | None = None
        for i in range(n // 2):
            a, b = pool[i], pool[n - 1 - i]
            if a is None or b is None:
                bye = b if a is None else a
                continue
            # Heim/Gast abwechseln, damit niemand immer "Spieler A" ist
            pairings.append((a, b) if (r + i) % 2 == 0 else (b, a))
        schedule.rounds.append(Round(number=r + 1, pairings=pairings, bye=bye))
        # Kreisverfahren: erster Platz fest, Rest rotiert im Uhrzeigersinn
        pool = [pool[0], pool[-1], *pool[1:-1]]
    return schedule
