"""Zustände eines Turniers und wer was darf (ADR-0013), ohne Datenbank.

Die Dienste fragen hier, ob eine Aktion im aktuellen Status und für die Rolle des
Nutzers erlaubt ist. Die Datenbank-Schicht führt sie dann aus.
"""

from dataclasses import dataclass
from enum import StrEnum


class Status(StrEnum):
    SETUP = "setup"
    SEATED = "seated"
    DRAFTING = "drafting"
    RUNNING = "running"
    PAUSED = "paused"
    FINISHED = "finished"
    CANCELLED = "cancelled"


class Action(StrEnum):
    INVITE = "invite"  # Mitglieder einladen, Gästelink, Teilnehmer entfernen
    RESPOND = "respond"  # eigene Einladung zusagen oder absagen
    SEAT = "seat"  # Plätze auslosen oder neu auslosen
    START_DRAFT = "start_draft"
    REPORT_COLORS = "report_colors"
    CANCEL = "cancel"
    DELETE = "delete"  # nur abgebrochene Turniere


class Forbidden(Exception):
    """Rolle reicht nicht (403)."""


class WrongStatus(Exception):
    """Aktion passt nicht zum Status (409)."""


@dataclass(frozen=True)
class Actor:
    """Wer handelt: Turnierstarter, Gruppen-Admin, Teilnehmer, Mitglied der Gruppe."""

    is_starter: bool = False
    is_admin: bool = False
    is_participant: bool = False
    is_member: bool = False


OPEN = {Status.SETUP, Status.SEATED, Status.DRAFTING, Status.RUNNING, Status.PAUSED}
BEFORE_ROUND_1 = {Status.SETUP, Status.SEATED, Status.DRAFTING}

ALLOWED_STATUS: dict[Action, set[Status]] = {
    Action.INVITE: {Status.SETUP},
    Action.RESPOND: {Status.SETUP},
    Action.SEAT: {Status.SETUP, Status.SEATED},
    Action.START_DRAFT: {Status.SEATED},
    Action.REPORT_COLORS: {Status.SEATED, Status.DRAFTING, Status.RUNNING},
    Action.CANCEL: OPEN,
    Action.DELETE: {Status.CANCELLED},
}

NEXT_STATUS: dict[Action, Status] = {
    Action.SEAT: Status.SEATED,
    Action.START_DRAFT: Status.DRAFTING,
    Action.CANCEL: Status.CANCELLED,
}

STATUS_TEXT = {
    Status.SETUP: "Das Turnier ist noch in der Anmeldung.",
    Status.SEATED: "Die Plätze sind schon ausgelost.",
    Status.DRAFTING: "Der Draft läuft schon.",
    Status.RUNNING: "Das Turnier läuft schon.",
    Status.PAUSED: "Das Turnier ist pausiert.",
    Status.FINISHED: "Das Turnier ist beendet.",
    Status.CANCELLED: "Das Turnier wurde abgebrochen.",
}


def role_allows(action: Action, status: Status, actor: Actor) -> bool:
    match action:
        case Action.INVITE | Action.SEAT | Action.START_DRAFT:
            return actor.is_starter
        case Action.RESPOND | Action.REPORT_COLORS:
            return actor.is_participant
        case Action.DELETE:
            return actor.is_starter or actor.is_admin
        case Action.CANCEL:
            # vor Runde 1 Starter oder Admin, danach nur der Admin direkt
            if status in BEFORE_ROUND_1:
                return actor.is_starter or actor.is_admin
            return actor.is_admin
    return False


def check(action: Action, status: Status, actor: Actor) -> None:
    """Wirft ``Forbidden`` oder ``WrongStatus``, wenn die Aktion nicht erlaubt ist."""
    if not role_allows(action, status, actor):
        raise Forbidden(action)
    if status not in ALLOWED_STATUS[action]:
        raise WrongStatus(STATUS_TEXT[status])


def next_status(action: Action, status: Status) -> Status:
    return NEXT_STATUS.get(action, status)


def allowed_actions(status: Status, actor: Actor) -> list[Action]:
    """Für die App: welche Knöpfe sie anzeigen soll."""
    return [a for a in Action if role_allows(a, status, actor) and status in ALLOWED_STATUS[a]]


def can_seat(accepted_players: int) -> bool:
    return accepted_players >= 2


def ready_for_round_one(colors: list[str | None]) -> bool:
    """Runde 1 startet erst, wenn alle Teilnehmer ihre Farben gemeldet haben ("" = farblos).

    Festgelegt am 20.11.2026; der Server prüft das beim Start von Runde 1 (AP-5).
    """
    return len(colors) >= 2 and all(c is not None for c in colors)
