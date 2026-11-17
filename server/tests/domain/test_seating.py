import random

from topstack.domain.seating import PassDirection, draw_seats, neighbour, pass_direction


def test_draw_is_permutation_and_random():
    players = list("ABCDEFGH")
    draws = {tuple(draw_seats(players, random.Random(s))) for s in range(10)}
    assert all(sorted(d) == players for d in draws)
    assert len(draws) > 1


def test_pass_direction_alternates():
    assert [pass_direction(b) for b in (1, 2, 3)] == [
        PassDirection.LEFT,
        PassDirection.RIGHT,
        PassDirection.LEFT,
    ]


def test_neighbour_wraps_around_table():
    seats = list("ABCD")
    assert neighbour(seats, "D", 1) == "A"
    assert neighbour(seats, "A", 2) == "D"
