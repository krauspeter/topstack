"""Elo-Wertung (Phase 5, AP-5, TC-151)."""

from datetime import date

import pytest

from topstack.domain.elo import EloMatch, expected, ratings, score

D = date(2026, 12, 27)


def m(a: str, b: str, ga: int, gb: int) -> EloMatch[str]:
    return EloMatch(a, b, ga, gb, D)


def test_first_win_between_newcomers():
    # Gleich stark: erwartet 0,5, K = 40 → ±20
    r = ratings([m("anna", "ben", 2, 1)])
    assert r["anna"].rating == pytest.approx(1020)
    assert r["ben"].rating == pytest.approx(980)
    assert r["anna"].matches == r["ben"].matches == 1


def test_draw_between_equal_players_changes_nothing():
    r = ratings([m("anna", "ben", 1, 1)])
    assert r["anna"].rating == pytest.approx(1000)
    assert r["ben"].rating == pytest.approx(1000)


def test_draw_moves_points_to_the_weaker_player():
    r = ratings([m("anna", "ben", 2, 0), m("anna", "ben", 1, 1)])
    # Nach Match 1: Anna 1020, Ben 980; erwartet für Anna 0,5573 → 40·(0,5−0,5573) = −2,29
    assert r["anna"].rating == pytest.approx(1017.71, abs=0.01)
    assert r["ben"].rating == pytest.approx(982.29, abs=0.01)


def test_k_drops_after_ten_matches():
    # Anna schlägt 10 Neulinge, jeder mit 1000; im 11. Match gilt K = 32
    games = [m("anna", f"n{i}", 2, 0) for i in range(10)]
    before = ratings(games)["anna"].rating
    after = ratings([*games, m("anna", "neu", 2, 0)])["anna"]
    assert after.matches == 11
    assert after.rating - before == pytest.approx(32 * (1 - expected(before, 1000)))


def test_history_per_match():
    r = ratings([m("anna", "ben", 2, 0), m("ben", "chris", 2, 1)])
    # 980 + 40·(1−0,4712)
    assert [p.rating for p in r["ben"].history] == [980.0, pytest.approx(1001.2, abs=0.05)]


def test_score_and_expected():
    assert (score(2, 0), score(1, 1), score(0, 2)) == (1.0, 0.5, 0.0)
    assert expected(1400, 1000) == pytest.approx(0.909, abs=0.001)
