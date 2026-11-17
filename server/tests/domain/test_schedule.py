import itertools
import random

import pytest

from topstack.domain.schedule import round_robin


@pytest.mark.parametrize("n", range(2, 11))
def test_everyone_meets_everyone_exactly_once(n):
    players = [f"P{i}" for i in range(n)]
    schedule = round_robin(players, random.Random(n))
    pairs = [frozenset(p) for p in schedule.all_pairings()]
    assert len(pairs) == len(set(pairs)) == n * (n - 1) // 2
    assert set(pairs) == {frozenset(c) for c in itertools.combinations(players, 2)}


@pytest.mark.parametrize("n", range(2, 11))
def test_nobody_plays_twice_per_round(n):
    schedule = round_robin(list(range(n)), random.Random(1))
    assert len(schedule.rounds) == (n if n % 2 else n - 1)
    for rnd in schedule.rounds:
        seen = [p for pair in rnd.pairings for p in pair]
        assert len(seen) == len(set(seen))
        if n % 2:
            assert rnd.bye is not None and rnd.bye not in seen
        else:
            assert rnd.bye is None


@pytest.mark.parametrize("n", [3, 5, 7, 9])
def test_odd_count_everyone_pauses_once(n):
    schedule = round_robin(list(range(n)), random.Random(7))
    assert sorted(r.bye for r in schedule.rounds) == list(range(n))


def test_first_pairings_are_random():
    players = list(range(8))
    firsts = {tuple(round_robin(players, random.Random(s)).rounds[0].pairings) for s in range(20)}
    assert len(firsts) > 1


def test_rejects_duplicates():
    with pytest.raises(ValueError):
        round_robin(["A", "A", "B"])
