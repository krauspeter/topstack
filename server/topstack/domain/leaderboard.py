"""Rangliste und Spielerstatistik (F-18, F-22), ohne Datenbank.

Eingabe sind abgeschlossene Turniere mit Endplätzen, Ranglistenpunkten, Farben und
Matches. Gäste und abgebrochene Turniere filtert der Aufrufer vorher heraus (TC-72, TC-73).
"""

from collections import Counter
from collections.abc import Hashable, Iterable
from dataclasses import dataclass, field
from datetime import date


@dataclass(frozen=True)
class EntryResult[P: Hashable]:
    player: P
    place: int
    ranking_points: int
    colors: str | None = None


@dataclass(frozen=True)
class MatchRecord[P: Hashable]:
    a: P
    b: P
    games_a: int
    games_b: int
    games_drawn: int = 0


@dataclass(frozen=True)
class TournamentResult[P: Hashable]:
    held_on: date
    entries: list[EntryResult[P]]
    matches: list[MatchRecord[P]]
    # Farben aller Teilnehmer, auch der Gäste, die in ``entries`` fehlen (für „Gegen Farben“)
    colors: dict[P, str | None] = field(default_factory=dict)
    # Matchpunkte, wenn das Turnier eigene hatte (Phase 5, AP-3); sonst die der Gruppe
    points: "MatchPointRules | None" = None

    def deck(self, player: P) -> str | None:
        """Farbkombination eines Teilnehmers; ``"C"`` für farblos, ``None`` wenn nicht gemeldet."""
        colors = self.colors.get(player)
        if colors is None:
            colors = next((e.colors for e in self.entries if e.player == player), None)
        return None if colors is None else colors or "C"


@dataclass(frozen=True)
class MatchPointRules:
    win: int = 3
    draw: int = 1
    loss: int = 0

    def points(self, outcome: int) -> int:
        return self.win if outcome > 0 else self.draw if outcome == 0 else self.loss


DEFAULT_RULES = MatchPointRules()


def _outcome(mine: int, theirs: int) -> int:
    """1 Sieg, 0 Unentschieden, -1 Niederlage (Unentschieden bei gleich vielen Spielen)."""
    return (mine > theirs) - (mine < theirs)


@dataclass
class LeaderboardRow[P: Hashable]:
    player: P
    rank: int = 0
    tournaments: int = 0
    wins: int = 0  # Turniersiege
    ranking_points: int = 0
    match_points: int = 0

    @property
    def avg_match_points(self) -> float:
        return round(self.match_points / self.tournaments, 2) if self.tournaments else 0.0


def leaderboard[P: Hashable](
    tournaments: Iterable[TournamentResult[P]], rules: MatchPointRules = DEFAULT_RULES
) -> list[LeaderboardRow[P]]:
    """Sortiert nach Ranglistenpunkten, dann Summe und Schnitt der Matchpunkte, dann Turniersiegen.

    Gleiche Werte in allen vier teilen sich den Rang.
    """
    rows: dict[P, LeaderboardRow[P]] = {}
    for t in tournaments:
        players = {e.player for e in t.entries}
        for e in t.entries:
            row = rows.setdefault(e.player, LeaderboardRow(e.player))
            row.tournaments += 1
            row.ranking_points += e.ranking_points
            row.wins += e.place == 1
        for m in t.matches:
            for me, mine, theirs in ((m.a, m.games_a, m.games_b), (m.b, m.games_b, m.games_a)):
                if me not in players:
                    continue
                rows[me].match_points += (t.points or rules).points(_outcome(mine, theirs))

    def key(r: LeaderboardRow[P]) -> tuple[int, int, float, int]:
        return (r.ranking_points, r.match_points, r.avg_match_points, r.wins)

    ordered = sorted(rows.values(), key=key, reverse=True)
    for i, row in enumerate(ordered):
        row.rank = ordered[i - 1].rank if i and key(ordered[i - 1]) == key(row) else i + 1
    return ordered


@dataclass
class Record:
    wins: int = 0
    draws: int = 0
    losses: int = 0

    @property
    def played(self) -> int:
        return self.wins + self.draws + self.losses

    def add(self, outcome: int) -> None:
        if outcome > 0:
            self.wins += 1
        elif outcome < 0:
            self.losses += 1
        else:
            self.draws += 1


def rate(won: int, total: int) -> float:
    """Siegquote in Prozent, eine Nachkommastelle; Unentschieden zählen als nicht gewonnen."""
    return round(100 * won / total, 1) if total else 0.0


@dataclass
class PlayerStats[P: Hashable]:
    player: P
    tournaments: int = 0
    tournament_wins: int = 0
    places: Counter[int] = field(default_factory=Counter)
    ranking_points: int = 0
    matches: Record = field(default_factory=Record)
    games_won: int = 0
    games_lost: int = 0
    games_drawn: int = 0
    colors: Counter[str] = field(default_factory=Counter)  # einzelne Farben W, U, B, R, G, C
    combos: Counter[str] = field(default_factory=Counter)  # ganze Kombination wie „BRG“
    opponents: dict[P, Record] = field(default_factory=dict)
    with_combo: dict[str, Record] = field(default_factory=dict)  # Bilanz je eigener Kombination
    vs_color: dict[str, Record] = field(default_factory=dict)  # Bilanz gegen Farbkombinationen

    @property
    def avg_place(self) -> float:
        n = sum(self.places.values())
        return round(sum(p * c for p, c in self.places.items()) / n, 2) if n else 0.0

    @property
    def match_win_rate(self) -> float:
        return rate(self.matches.wins, self.matches.played)

    @property
    def game_win_rate(self) -> float:
        return rate(self.games_won, self.games_won + self.games_lost + self.games_drawn)


def player_stats[P: Hashable](
    tournaments: Iterable[TournamentResult[P]], player: P
) -> PlayerStats[P]:
    s: PlayerStats[P] = PlayerStats(player)
    for t in tournaments:
        mine = next((e for e in t.entries if e.player == player), None)
        if mine is None:
            continue
        s.tournaments += 1
        s.tournament_wins += mine.place == 1
        s.places[mine.place] += 1
        s.ranking_points += mine.ranking_points
        combo = t.deck(player)
        if combo is not None:
            s.combos[combo] += 1
            for c in combo:
                s.colors[c] += 1
        for m in t.matches:
            if player not in (m.a, m.b):
                continue
            other, won, lost = (
                (m.b, m.games_a, m.games_b) if m.a == player else (m.a, m.games_b, m.games_a)
            )
            o = _outcome(won, lost)
            s.matches.add(o)
            s.opponents.setdefault(other, Record()).add(o)
            if combo is not None:
                s.with_combo.setdefault(combo, Record()).add(o)
            # Gegen die ganze Kombination des Gegners, wie bei den eigenen Farben (Beta-Test
            # vom 28.11.2026): „BR“ zählt als Schwarz-Rot, nicht für Schwarz und Rot einzeln
            vs = t.deck(other)
            if vs is not None:
                s.vs_color.setdefault(vs, Record()).add(o)
            s.games_won += won
            s.games_lost += lost
            s.games_drawn += m.games_drawn
    return s
