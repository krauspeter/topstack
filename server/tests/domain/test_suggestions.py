from datetime import datetime, timedelta

from topstack.domain.suggestions import suggest_open_match

T0 = datetime(2027, 1, 20, 19, 0)


def test_longest_waiting_first():
    idle = {
        "A": T0,
        "B": T0 + timedelta(minutes=20),
        "C": T0 + timedelta(minutes=5),
        "D": T0 + timedelta(minutes=30),
    }
    open_matches = [("B", "D"), ("A", "C"), ("C", "D")]
    assert suggest_open_match("ABCD", open_matches, idle) == ("A", "C")


def test_only_if_both_free():
    assert suggest_open_match("AB", [("A", "C")], {}) is None
