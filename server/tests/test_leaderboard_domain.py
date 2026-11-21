"""Rangliste und Spielerstatistik, nachgerechnet von Hand (TC-70, TC-74)."""

from datetime import date

from topstack.domain.leaderboard import (
    EntryResult,
    MatchPointRules,
    MatchRecord,
    TournamentResult,
    leaderboard,
    player_stats,
    rate,
)

# Turnier 1, 4 Spieler: Plätze A, B, C, D → Punkte 6, 4, 2, 1 (Punkte-Tabelle)
T1 = TournamentResult(
    date(2027, 1, 15),
    [
        EntryResult("A", 1, 6, "G"),
        EntryResult("B", 2, 4, "UW"),
        EntryResult("C", 3, 2, ""),  # farblos
        EntryResult("D", 4, 1, None),  # nicht gemeldet
    ],
    [
        MatchRecord("A", "B", 2, 0),
        MatchRecord("A", "C", 2, 0),
        MatchRecord("A", "D", 2, 0),
        MatchRecord("B", "C", 2, 1),
        MatchRecord("B", "D", 2, 0),
        MatchRecord("C", "D", 1, 1),  # Unentschieden
    ],
)
# Turnier 2, 3 Spieler: Plätze B, A, C → Punkte 5, 3, 1
T2 = TournamentResult(
    date(2027, 2, 12),
    [EntryResult("B", 1, 5, "W"), EntryResult("A", 2, 3, "BRG"), EntryResult("C", 3, 1, "R")],
    [MatchRecord("B", "A", 2, 1), MatchRecord("B", "C", 2, 0), MatchRecord("A", "C", 2, 0)],
)


def test_leaderboard_by_hand():  # TC-70
    rows = leaderboard([T1, T2])
    table = [
        (
            r.player,
            r.rank,
            r.tournaments,
            r.wins,
            r.ranking_points,
            r.match_points,
            r.avg_match_points,
        )
        for r in rows
    ]
    # A: 6 + 3 = 9 Punkte; Matchpunkte 9 + 3 = 12; Schnitt 6.0; 1 Turniersieg
    # B: 4 + 5 = 9 Punkte; Matchpunkte 6 + 6 = 12; Schnitt 6.0; 1 Turniersieg → gleicher Rang
    # C: 2 + 1 = 3 Punkte; Matchpunkte 1 + 0 = 1
    # D: 1 Punkt; Matchpunkte 1 (Unentschieden gegen C)
    assert sorted(table[:2]) == [("A", 1, 2, 1, 9, 12, 6.0), ("B", 1, 2, 1, 9, 12, 6.0)]
    assert table[2:] == [("C", 3, 2, 0, 3, 1, 0.5), ("D", 4, 1, 0, 1, 1, 1.0)]


def test_leaderboard_tiebreak_and_rules():
    # Nur Turnier 2: B 5, A 3, C 1
    assert [(r.player, r.rank) for r in leaderboard([T2])] == [("B", 1), ("A", 2), ("C", 3)]
    # Eigene Matchpunkte der Gruppe
    rows = leaderboard([T1], MatchPointRules(win=2, draw=1, loss=0))
    assert {r.player: r.match_points for r in rows} == {"A": 6, "B": 4, "C": 1, "D": 1}
    assert leaderboard([]) == []


def test_player_stats_by_hand():  # TC-74
    s = player_stats([T1, T2], "A")
    assert (s.tournaments, s.tournament_wins, s.ranking_points) == (2, 1, 9)
    assert dict(s.places) == {1: 1, 2: 1} and s.avg_place == 1.5
    # Matches: 3 Siege in T1, in T2 Niederlage gegen B und Sieg gegen C
    assert (s.matches.wins, s.matches.draws, s.matches.losses) == (4, 0, 1)
    assert s.match_win_rate == 80.0
    # Spiele: T1 6:0, T2 1:2 und 2:0 → 9:2
    assert (s.games_won, s.games_lost) == (9, 2) and s.game_win_rate == 81.8
    assert dict(s.colors) == {"G": 2, "B": 1, "R": 1}
    assert dict(s.combos) == {"G": 1, "BRG": 1}
    assert (s.opponents["B"].wins, s.opponents["B"].losses) == (1, 1)


def test_player_stats_draws_and_colorless():
    c = player_stats([T1, T2], "C")
    # T1: gegen A und B verloren, gegen D unentschieden; T2: gegen B und A verloren
    assert (c.matches.wins, c.matches.draws, c.matches.losses) == (0, 1, 4)
    assert c.games_drawn == 0  # 1:1 nach Spielen, kein unentschiedenes Einzelspiel
    assert dict(c.combos) == {"C": 1, "R": 1}
    d = player_stats([T1, T2], "D")
    assert d.tournaments == 1 and dict(d.colors) == {}
    assert player_stats([T1], "X").tournaments == 0


def test_rate():
    assert rate(0, 0) == 0.0
    assert rate(1, 3) == 33.3
