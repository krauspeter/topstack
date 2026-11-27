"""Regeln pro Turnier (Phase 5, AP-3, TC-145): Matchformat, Startleben, Zeitlimit, Punkte."""

import pytest

from tests.api.helpers import is_problem
from tests.api.test_rounds import current_matches, report, set_all_colors
from tests.api.test_tournaments import admin_group
from topstack.domain.groups import effective_rules, tournament_overrides
from topstack.domain.tournament import valid_result

BO1 = {"games_to_win": 1, "starting_life": 30, "match_points_win": 2, "match_time_limit_min": 20}


async def start_with(client, group, rules):
    return await client.post(
        f"/api/v1/groups/{group.id}/tournaments", json={"set_code": "DSK", "rules": rules}
    )


async def running_bo1(client, session):
    group, _, reserved = await admin_group(client, session, reserved=("Ben", "Chris"))
    r = await start_with(client, group, {**BO1, "match_points_loss": 0})
    assert r.status_code == 201, r.text
    t = r.json()
    await client.post(f"/api/v1/tournaments/{t['id']}/entries", json={"player_ids": reserved})
    await client.post(f"/api/v1/tournaments/{t['id']}/seating")
    t = (await client.post(f"/api/v1/tournaments/{t['id']}/draft")).json()
    await set_all_colors(client, t)
    t = (await client.post(f"/api/v1/tournaments/{t['id']}/rounds/next", json={})).json()
    return group, t


async def test_rules_stored_only_where_they_differ(client, session):  # TC-145
    group, _, _ = await admin_group(client, session)
    r = await start_with(client, group, {**BO1, "match_points_loss": 0})
    assert r.status_code == 201, r.text
    rules = r.json()["rules"]
    assert rules["games_to_win"] == 1 and rules["starting_life"] == 30
    assert rules["match_points_win"] == 2 and rules["match_time_limit_min"] == 20
    # Niederlage 0 ist der Gruppenstandard und gilt nicht als Abweichung
    assert rules["custom"] == [
        "games_to_win",
        "starting_life",
        "match_time_limit_min",
        "match_points_win",
    ]


async def test_rules_without_overrides_follow_group(client, session):
    group, _, _ = await admin_group(client, session)
    r = await client.post(f"/api/v1/groups/{group.id}/tournaments", json={"set_code": "DSK"})
    assert r.json()["rules"] == {
        "games_to_win": 2,
        "starting_life": 20,
        "match_time_limit_min": None,
        "match_points_win": 3,
        "match_points_draw": 1,
        "match_points_loss": 0,
        "custom": [],
    }


@pytest.mark.parametrize("rules", [{"games_to_win": 4}, {"placement_bonus": [1]}, {"x": 1}])
async def test_invalid_rules_are_refused(client, session, rules):
    group, _, _ = await admin_group(client, session)
    assert is_problem(await start_with(client, group, rules), 422)


async def test_best_of_one_tracker_and_results(client, session):  # TC-145
    _, t = await running_bo1(client, session)
    m = current_matches(t)[0]

    tracker = await client.post(
        f"/api/v1/tournaments/{t['id']}/matches/{m['id']}/tracker", json={"mode": "shared"}
    )
    assert tracker.status_code in (200, 201), tracker.text
    state = (await client.get(f"/api/v1/tournaments/{t['id']}/matches/{m['id']}/tracker")).json()
    assert (state["starting_life"], state["games_to_win"], state["time_limit_min"]) == (30, 1, 20)

    assert is_problem(await report(client, t, m, 2, 1), 422)
    ok = await report(client, t, m, 1, 0)
    assert ok.status_code == 200, ok.text
    table = {s["display_name"]: s["match_points"] for s in ok.json()["standings"]}
    assert max(table.values()) == 2  # Sieg zählt hier 2 statt 3


def test_valid_result_for_other_formats():
    assert valid_result(1, 0, games_to_win=1)
    assert not valid_result(1, 1, games_to_win=1)
    assert valid_result(3, 2, games_to_win=3)
    assert not valid_result(3, 3, games_to_win=3)
    assert not valid_result(2, 1, 1, games_to_win=2)


def test_overrides_and_effective_rules():
    group = {"games_to_win": 2, "starting_life": 20, "match_points_win": 3, "extra_turns": 5}
    assert tournament_overrides(group, {"games_to_win": 2, "starting_life": 25}) == {
        "starting_life": 25
    }
    assert effective_rules(group, {"starting_life": 25, "extra_turns": 0}) == {
        **group,
        "starting_life": 25,
    }
