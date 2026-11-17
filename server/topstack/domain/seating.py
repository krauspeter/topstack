"""Auslosung der Draftplätze und Passrichtung (F-03, F-04, UC-06)."""

import random
from enum import StrEnum


class PassDirection(StrEnum):
    LEFT = "left"
    RIGHT = "right"


def draw_seats[P](players: list[P], rng: random.Random | None = None) -> list[P]:
    """Gibt die Spieler in Sitzreihenfolge zurück (Platz 1 = Index 0), rein zufällig."""
    seats = list(players)
    (rng or random.Random()).shuffle(seats)
    return seats


def pass_direction(booster_no: int) -> PassDirection:
    """Booster 1 und 3 werden nach links gegeben, Booster 2 nach rechts."""
    if booster_no < 1:
        raise ValueError("Booster-Nummer beginnt bei 1")
    return PassDirection.LEFT if booster_no % 2 == 1 else PassDirection.RIGHT


def neighbour[P](seats: list[P], player: P, booster_no: int) -> P:
    """An wen gibt `player` im Booster `booster_no` weiter?"""
    i = seats.index(player)
    step = 1 if pass_direction(booster_no) is PassDirection.LEFT else -1
    return seats[(i + step) % len(seats)]
