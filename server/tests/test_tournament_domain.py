"""Zustände und Rechte eines Turniers (ADR-0013)."""

import pytest

from topstack.domain.tournament import (
    Action,
    Actor,
    Forbidden,
    Status,
    WrongStatus,
    allowed_actions,
    check,
    missing_colors,
    next_status,
)

STARTER = Actor(is_starter=True, is_participant=True, is_member=True)
ADMIN = Actor(is_admin=True, is_member=True)
PLAYER = Actor(is_participant=True, is_member=True)
MEMBER = Actor(is_member=True)


def test_only_starter_invites_and_seats():
    check(Action.INVITE, Status.SETUP, STARTER)
    check(Action.SEAT, Status.SETUP, STARTER)
    with pytest.raises(Forbidden):
        check(Action.SEAT, Status.SETUP, PLAYER)  # TC-19
    with pytest.raises(Forbidden):
        check(Action.INVITE, Status.SETUP, ADMIN)


def test_invite_after_seating_is_wrong_status():
    with pytest.raises(WrongStatus):
        check(Action.INVITE, Status.SEATED, STARTER)  # TC-17


def test_reseat_allowed_until_draft():
    check(Action.SEAT, Status.SEATED, STARTER)
    with pytest.raises(WrongStatus):
        check(Action.SEAT, Status.DRAFTING, STARTER)


def test_colors_by_participants_after_draft_start():
    for status in (Status.DRAFTING, Status.RUNNING):
        check(Action.REPORT_COLORS, status, PLAYER)
    for status in (Status.SETUP, Status.SEATED):
        with pytest.raises(WrongStatus):
            check(Action.REPORT_COLORS, status, PLAYER)
    with pytest.raises(Forbidden):
        check(Action.REPORT_COLORS, Status.SEATED, MEMBER)


@pytest.mark.parametrize("status", [Status.SETUP, Status.SEATED, Status.DRAFTING])
def test_cancel_before_round_one(status):
    check(Action.CANCEL, status, STARTER)
    check(Action.CANCEL, status, ADMIN)
    with pytest.raises(Forbidden):
        check(Action.CANCEL, status, PLAYER)


@pytest.mark.parametrize("status", [Status.RUNNING, Status.PAUSED])
def test_cancel_after_round_one_only_admin(status):
    check(Action.CANCEL, status, ADMIN)
    with pytest.raises(Forbidden):
        check(Action.CANCEL, status, STARTER)


@pytest.mark.parametrize("status", [Status.FINISHED, Status.CANCELLED])
def test_closed_tournament_cannot_be_cancelled(status):
    with pytest.raises(WrongStatus):
        check(Action.CANCEL, status, ADMIN)


def test_transitions():
    assert next_status(Action.SEAT, Status.SETUP) is Status.SEATED
    assert next_status(Action.SEAT, Status.SEATED) is Status.SEATED
    assert next_status(Action.START_DRAFT, Status.SEATED) is Status.DRAFTING
    assert next_status(Action.CANCEL, Status.RUNNING) is Status.CANCELLED
    assert next_status(Action.REPORT_COLORS, Status.DRAFTING) is Status.DRAFTING


def test_allowed_actions_for_app():
    assert allowed_actions(Status.SETUP, STARTER) == [
        Action.INVITE,
        Action.RESPOND,
        Action.SEAT,
        Action.CANCEL,
    ]
    assert allowed_actions(Status.SEATED, PLAYER) == []
    assert allowed_actions(Status.DRAFTING, PLAYER) == [Action.REPORT_COLORS]
    assert allowed_actions(Status.RUNNING, ADMIN) == [Action.CANCEL]


def test_delete_only_cancelled_by_starter_or_admin():
    check(Action.DELETE, Status.CANCELLED, STARTER)
    check(Action.DELETE, Status.CANCELLED, ADMIN)
    with pytest.raises(Forbidden):
        check(Action.DELETE, Status.CANCELLED, PLAYER)
    with pytest.raises(WrongStatus):
        check(Action.DELETE, Status.SETUP, ADMIN)
    with pytest.raises(WrongStatus):
        check(Action.DELETE, Status.FINISHED, ADMIN)
    assert allowed_actions(Status.CANCELLED, STARTER) == [Action.DELETE]


def test_missing_colors_for_round_one_warning():
    assert missing_colors({"Anna": "WU", "Ben": "", "Chris": "R"}) == []  # "" = farblos
    assert missing_colors({"Max": None, "Anna": "WU", "Ben": None}) == ["Ben", "Max"]
