from topstack.domain.standings import MatchResult as M
from topstack.domain.standings import compute_standings


def order(rows):
    return [r.player for r in rows]


def test_simple_points_3_1_0():
    rows = compute_standings(
        "ABC",
        [M("A", "B", 2, 0), M("A", "C", 2, 1), M("B", "C", 1, 1)],
    )
    a = rows[0]
    assert (a.player, a.match_points, a.wins, a.game_diff) == ("A", 6, 2, 3)
    # B und C: je 1 Punkt, direkter Vergleich 1:1 -> Spieldifferenz B: 1-3=-2, C: 2-3=-1
    assert order(rows) == ["A", "C", "B"]
    assert [r.rank for r in rows] == [1, 2, 3]


def test_head_to_head_beats_game_diff():
    # A und B je 6 Punkte; B hat bessere Spieldifferenz, aber A schlug B direkt
    results = [
        M("A", "B", 2, 1),
        M("A", "C", 2, 1),
        M("B", "C", 2, 0),
        M("A", "D", 0, 2),
        M("B", "D", 2, 0),
        M("C", "D", 2, 0),
    ]
    rows = compute_standings("ABCD", results)
    assert rows[0].match_points == rows[1].match_points == 6
    assert rows[1].game_diff > rows[0].game_diff
    assert order(rows)[:2] == ["A", "B"]


def test_three_way_tie_mini_table_partially_separates():
    # A, B, C haben je 6 Punkte. Untereinander: A>B, B>C, C>A (Kreis) -> Mini-Tabelle gleich.
    # Dann entscheidet Spieldifferenz.
    results = [
        M("A", "B", 2, 0),
        M("B", "C", 2, 0),
        M("C", "A", 2, 1),
        M("A", "D", 2, 0),
        M("B", "D", 2, 1),
        M("C", "D", 2, 1),
    ]
    rows = compute_standings("ABCD", results)
    # Spieldifferenz: A 5:2 = +3, B 4:3 = +1, C 4:4 = 0
    assert order(rows) == ["A", "B", "C", "D"]
    assert not any(r.needs_roll for r in rows)


def test_mini_table_reapplied_to_remaining_tie():
    # A, B, C, D alle 6 Punkte (E verliert alles). Mini-Tabelle aus A–D trennt A (vorn)
    # ab; B, C, D bleiben gleich -> neue Mini-Tabelle nur aus B, C, D.
    results = [
        M("A", "B", 2, 0),
        M("A", "C", 2, 0),
        M("A", "D", 2, 0),
        M("B", "C", 2, 0),
        M("C", "D", 2, 0),
        M("D", "B", 2, 0),
        M("E", "A", 2, 0),
        M("E", "B", 0, 2),
        M("E", "C", 0, 2),
        M("E", "D", 0, 2),
    ]
    rows = compute_standings("ABCDE", results)
    assert rows[0].player == "A"
    assert rows[-1].player == "E"
    # B, C, D: Kreis untereinander und gleiche Spieldifferenz -> W20 nötig
    middle = rows[1:4]
    assert {r.player for r in middle} == {"B", "C", "D"}
    assert all(r.needs_roll and r.rank == 2 for r in middle)


def test_full_tie_needs_d20_then_uses_rolls():
    results = [M("A", "B", 1, 1)]
    rows = compute_standings("AB", results)
    assert all(r.needs_roll for r in rows)
    assert [r.rank for r in rows] == [1, 1]
    assert rows[0].tied_with == [rows[1].player]

    rows = compute_standings("AB", results, rolls={"A": 4, "B": 17})
    assert order(rows) == ["B", "A"]
    assert [r.rank for r in rows] == [1, 2]
    assert not any(r.needs_roll for r in rows)


def test_unplayed_players_listed():
    rows = compute_standings("ABC", [M("A", "B", 2, 0)])
    assert {r.player for r in rows} == {"A", "B", "C"}
    assert next(r for r in rows if r.player == "C").played == 0
