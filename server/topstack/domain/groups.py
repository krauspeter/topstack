"""Regeln für Gruppen ohne Framework (ADR-0018): Rollen und Rechte, letzter Admin, Gruppenregeln."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from enum import StrEnum
from typing import Any

MAX_OWN_GROUPS = 5
"""Höchstens so viele Gruppen darf ein Nutzer anlegen (Festlegung vom 22.11.2026)."""

PURGE_AFTER = timedelta(days=30)
"""So lange lässt sich eine gelöschte Gruppe wiederherstellen."""

ROLES = ("admin", "member", "viewer")


class Permission(StrEnum):
    VIEW = "view"  # Live-Ansicht, Rangliste, Statistik, Turnierliste
    VIEW_PROFILES = "view_profiles"  # Spielerliste, Profile anderer
    PLAY = "play"  # Turniere starten, mitspielen, eingeladen werden
    INVITE = "invite"  # Gruppenlinks erzeugen und eigene zurückziehen (seit AP-2 alle Mitglieder)
    MANAGE = "manage"  # Name, Bild, Regeln, Rollen, Spieler ohne Konto, archivieren, löschen


RIGHTS: dict[str, frozenset[Permission]] = {
    "admin": frozenset(Permission),
    "member": frozenset(
        {Permission.VIEW, Permission.VIEW_PROFILES, Permission.PLAY, Permission.INVITE}
    ),
    "viewer": frozenset({Permission.VIEW}),
}


def allows(role: str, permission: Permission) -> bool:
    return permission in RIGHTS.get(role, frozenset())


# ---------------------------------------------------------------------------
# Mitglieder und Admins
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Member:
    user_id: uuid.UUID
    role: str
    joined_at: datetime


def successor_admin(members: list[Member], leaving: uuid.UUID) -> uuid.UUID | None:
    """Wer Admin wird, wenn ``leaving`` geht: das älteste Mitglied, falls dann kein Admin bleibt.

    ``None``, wenn noch ein anderer Admin da ist oder niemand übrig bleibt. Zuschauer kommen nur
    zum Zug, wenn es kein Mitglied mehr gibt.
    """
    rest = [m for m in members if m.user_id != leaving]
    if not rest or any(m.role == "admin" for m in rest):
        return None
    for roles in (("member",), ("viewer",)):
        candidates = [m for m in rest if m.role in roles]
        if candidates:
            return min(candidates, key=lambda m: (m.joined_at, str(m.user_id))).user_id
    return None


def leaves_without_admin(members: list[Member], user_id: uuid.UUID, new_role: str) -> bool:
    """Würde die Rollenänderung die Gruppe ohne Admin lassen?"""
    return not any((new_role if m.user_id == user_id else m.role) == "admin" for m in members)


# ---------------------------------------------------------------------------
# Gruppenregeln
# ---------------------------------------------------------------------------

INT_RULES: dict[str, tuple[int, int]] = {
    "match_points_win": (0, 10),
    "match_points_draw": (0, 10),
    "match_points_loss": (0, 10),
    "starting_life": (1, 100),
    "games_to_win": (1, 3),  # Best-of-1, -3, -5
    "extra_turns": (0, 10),
    "boosters_per_player": (1, 6),
}
SEASON_MODES = ("calendar_year", "months", "eternal")


class InvalidRules(ValueError):
    pass


def _is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def validate_rules(changes: dict[str, Any]) -> dict[str, Any]:
    """Prüft geänderte Regeln und gibt sie bereinigt zurück; wirft ``InvalidRules``."""
    clean: dict[str, Any] = {}
    for key, value in changes.items():
        if key in INT_RULES:
            low, high = INT_RULES[key]
            if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
                raise InvalidRules(f"{key} muss zwischen {low} und {high} liegen.")
            clean[key] = value
        elif key == "match_time_limit_min":
            if value is not None and (
                isinstance(value, bool) or not isinstance(value, int) or not 5 <= value <= 180
            ):
                raise InvalidRules("Das Zeitlimit liegt zwischen 5 und 180 Minuten oder ist aus.")
            clean[key] = value
        elif key == "placement_bonus":
            if (
                not isinstance(value, list)
                or len(value) > 8
                or any(not _is_int(v) or not 0 <= v <= 10 for v in value)
            ):
                raise InvalidRules("Platzierungsbonus: bis zu 8 Zahlen von 0 bis 10.")
            clean[key] = list(value)
        elif key == "season_mode":
            if value not in SEASON_MODES:
                raise InvalidRules("Unbekannte Saisonlänge.")
            clean[key] = value
        elif key == "season_months":
            if value is not None and (
                isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 120
            ):
                raise InvalidRules("Eine Saison dauert 1 bis 120 Monate.")
            clean[key] = value
        else:
            raise InvalidRules(f"Unbekannte Regel: {key}")
    mode = clean.get("season_mode")
    if mode == "months" and clean.get("season_months") is None:
        raise InvalidRules("Bei Saisons nach Monaten fehlt die Zahl der Monate.")
    return clean


def merge_pending(pending: dict[str, Any] | None, changes: dict[str, Any]) -> dict[str, Any]:
    """Neue Änderungen kommen zu den schon vorgemerkten dazu."""
    return {**(pending or {}), **changes}


# ---------------------------------------------------------------------------
# Saisonwechsel
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SeasonSpan:
    name: str
    starts_on: date
    ends_on: date | None


def _add_months(day: date, months: int) -> date:
    """Erster Tag des Monats ``months`` Monate nach dem Monat von ``day``."""
    index = day.year * 12 + day.month - 1 + months
    return date(index // 12, index % 12 + 1, 1)


def next_season(mode: str, months: int | None, last_end: date | None, day: date) -> SeasonSpan:
    """Die Saison, die ``day`` enthält und an die letzte Saison (Ende ``last_end``) anschließt.

    Kalenderjahr: 1.1. bis 31.12., beginnt aber frühestens am Tag nach der letzten Saison.
    Monate: Blöcke von ``months`` Monaten ab dem Ende der letzten Saison. Ewig: ohne Ende.
    """
    after_last = last_end + timedelta(days=1) if last_end is not None else None
    if mode == "eternal":
        return SeasonSpan("Ewige Saison", after_last or day, None)
    if mode == "months":
        length = months or 12
        start = after_last or day.replace(day=1)
        end = _add_months(start, length) - timedelta(days=1)
        while end < day:
            start = end + timedelta(days=1)
            end = _add_months(start, length) - timedelta(days=1)
        return SeasonSpan(f"Saison {start:%m/%Y}", start, end)
    start = date(day.year, 1, 1)
    if after_last is not None and after_last > start:
        start = after_last
    return SeasonSpan(f"Saison {day.year}", start, date(day.year, 12, 31))
