"""Regeln für Gruppen ohne Datenbank (ADR-0018): Rechte, letzter Admin, Regeln, Saisonwechsel."""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest

from topstack.domain.groups import (
    InvalidRules,
    Member,
    Permission,
    allows,
    leaves_without_admin,
    merge_pending,
    next_season,
    successor_admin,
    validate_rules,
)

T0 = datetime(2026, 11, 1, tzinfo=UTC)


def member(role: str, days: int) -> Member:
    return Member(uuid.uuid4(), role, T0 + timedelta(days=days))


@pytest.mark.parametrize(
    ("role", "allowed"),
    [
        ("admin", set(Permission)),
        ("member", {Permission.VIEW, Permission.VIEW_PROFILES, Permission.PLAY}),
        ("viewer", {Permission.VIEW}),
        ("unbekannt", set()),
    ],
)
def test_rights_table(role, allowed):  # TC-134
    assert {p for p in Permission if allows(role, p)} == allowed


def test_last_admin_leaving_promotes_oldest_member():  # TC-135
    admin = member("admin", 0)
    old = member("member", 1)
    young = member("member", 5)
    viewer = member("viewer", -10)
    assert successor_admin([admin, young, old, viewer], admin.user_id) == old.user_id


def test_no_successor_while_another_admin_stays():
    a, b = member("admin", 0), member("admin", 3)
    assert successor_admin([a, b, member("member", 1)], a.user_id) is None


def test_viewer_becomes_admin_only_without_members():
    admin, viewer = member("admin", 0), member("viewer", 2)
    assert successor_admin([admin, viewer], admin.user_id) == viewer.user_id
    assert successor_admin([admin], admin.user_id) is None


def test_role_change_must_keep_an_admin():
    a, m = member("admin", 0), member("member", 1)
    assert leaves_without_admin([a, m], a.user_id, "member")
    assert not leaves_without_admin([a, m], m.user_id, "admin")
    assert not leaves_without_admin([a, m], a.user_id, "admin")


def test_validate_rules_accepts_and_cleans():
    changes = {"starting_life": 30, "games_to_win": 1, "match_time_limit_min": None}
    clean = validate_rules({**changes, "placement_bonus": [3]})
    assert clean == {
        "starting_life": 30,
        "games_to_win": 1,
        "match_time_limit_min": None,
        "placement_bonus": [3],
    }


@pytest.mark.parametrize(
    "changes",
    [
        {"starting_life": 0},
        {"games_to_win": 4},
        {"match_points_win": True},
        {"match_time_limit_min": 2},
        {"placement_bonus": [1, -1]},
        {"season_mode": "weekly"},
        {"season_mode": "months"},
        {"name": "x"},
    ],
)
def test_validate_rules_rejects(changes):
    with pytest.raises(InvalidRules):
        validate_rules(changes)


def test_merge_pending_keeps_earlier_changes():
    assert merge_pending({"starting_life": 30}, {"games_to_win": 1}) == {
        "starting_life": 30,
        "games_to_win": 1,
    }
    assert merge_pending(None, {"starting_life": 25}) == {"starting_life": 25}


def test_next_calendar_season_follows_a_moved_start():
    # Saison 2027 der Draft-Runde begann schon am 01.12.2026 (Festlegung vom 27.11.2026)
    span = next_season("calendar_year", None, date(2027, 12, 31), date(2028, 1, 5))
    assert (span.name, span.starts_on, span.ends_on) == (
        "Saison 2028",
        date(2028, 1, 1),
        date(2028, 12, 31),
    )
    first = next_season("calendar_year", None, None, date(2027, 3, 1))
    assert (first.starts_on, first.ends_on) == (date(2027, 1, 1), date(2027, 12, 31))


def test_next_season_in_months_skips_empty_blocks():
    span = next_season("months", 6, date(2026, 12, 31), date(2027, 8, 10))
    assert (span.starts_on, span.ends_on) == (date(2027, 7, 1), date(2027, 12, 31))
    assert span.name == "Saison 07/2027"
    fresh = next_season("months", 3, None, date(2027, 2, 14))
    assert (fresh.starts_on, fresh.ends_on) == (date(2027, 2, 1), date(2027, 4, 30))


def test_eternal_season_has_no_end():
    span = next_season("eternal", None, date(2026, 12, 31), date(2027, 5, 1))
    assert (span.starts_on, span.ends_on) == (date(2027, 1, 1), None)
