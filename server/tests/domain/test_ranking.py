import pytest

from topstack.domain.ranking import ranking_points

# Tabelle aus den Punkteregeln vom 15.11.2026
EXPECTED = {
    4: [6, 4, 2, 1],
    5: [7, 5, 3, 2, 1],
    6: [8, 6, 4, 3, 2, 1],
    7: [9, 7, 5, 4, 3, 2, 1],
    8: [10, 8, 6, 5, 4, 3, 2, 1],
}


@pytest.mark.parametrize("players", EXPECTED)
def test_matches_rule_table(players):
    assert [ranking_points(players, p) for p in range(1, players + 1)] == EXPECTED[players]


def test_last_place_always_one():
    for n in range(3, 13):
        assert ranking_points(n, n) == 1


def test_custom_bonus():
    assert ranking_points(4, 1, bonus=(0,)) == 4


@pytest.mark.parametrize("place", [0, 5])
def test_invalid_place(place):
    with pytest.raises(ValueError):
        ranking_points(4, place)
