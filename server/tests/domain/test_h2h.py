"""Head-to-Head (Phase 5, AP-6, TC-154)."""

from datetime import date

from topstack.domain.h2h import Meeting, matrix, pair

D = date(2026, 12, 27)


def m(a, b, ga, gb, imported=False):
    return Meeting(a, b, ga, gb, 0, D, "DSK", imported)


def test_pair_with_draw_and_both_directions():
    meetings = [m("anna", "ben", 2, 1), m("ben", "anna", 2, 0), m("anna", "ben", 1, 1, True)]
    p = pair(meetings, "anna", "ben")
    assert (p.wins, p.draws, p.losses) == (1, 1, 1)
    assert (p.games_won, p.games_lost, p.imported, p.played) == (3, 4, 1, 3)
    q = pair(meetings, "ben", "anna")
    assert (q.wins, q.draws, q.losses) == (1, 1, 1)
    assert (q.games_won, q.games_lost) == (4, 3)


def test_pair_without_common_matches():
    p = pair([m("anna", "chris", 2, 0)], "anna", "ben")
    assert (p.played, p.meetings) == (0, [])


def test_matrix_has_both_directions():
    t = matrix([m("anna", "ben", 2, 0), m("ben", "chris", 0, 2)])
    assert (t[("anna", "ben")].wins, t[("ben", "anna")].losses) == (1, 1)
    assert (t[("chris", "ben")].wins, ("anna", "chris") in t) == (1, False)
