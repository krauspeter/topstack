"""Altdaten lesen und prüfen, ohne Datenbank (Phase 5, AP-4, UC-19, UC-20, ADR-0019).

Zwei CSV-Dateien nach der Vorlage in der Roadmap: eine Zeile pro Spieler und Turnier
(``turnier_id,datum,set,spieler,platz``), dazu optional eine Zeile pro Match
(``turnier_id,runde,spieler_a,spieler_b,spiele_a,spiele_b``). Komma, Semikolon und Tabulator
gehen (Excel speichert auf Deutsch mit Semikolon). Pflicht sind Datum, Spieler und Platz.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from datetime import date

UNKNOWN_SET = "UNK"
MAX_ROWS = 5000

TOURNAMENT_COLUMNS = ("turnier_id", "datum", "spieler", "platz")
MATCH_COLUMNS = ("turnier_id", "runde", "spieler_a", "spieler_b", "spiele_a", "spiele_b")


@dataclass
class LegacyEntry:
    name: str
    place: int


@dataclass
class LegacyMatch:
    round: int
    a: str
    b: str
    games_a: int
    games_b: int


@dataclass
class LegacyTournament:
    key: str
    held_on: date
    set_code: str
    entries: list[LegacyEntry] = field(default_factory=list)
    matches: list[LegacyMatch] = field(default_factory=list)


@dataclass(frozen=True)
class Problem:
    file: str  # "turniere", "matches" oder "formular"
    line: int  # Zeile in der Datei (Kopfzeile = 1), 0 = ganzes Turnier
    message: str


@dataclass
class Parsed:
    tournaments: list[LegacyTournament]
    problems: list[Problem]

    @property
    def ok(self) -> bool:
        return not self.problems and bool(self.tournaments)


def _rows(
    text: str, file: str, required: tuple[str, ...]
) -> tuple[list[tuple[int, dict[str, str]]], list[Problem]]:
    """CSV mit Kopfzeile lesen; Spaltennamen klein und ohne Leerzeichen, leere Zeilen fallen weg."""
    text = text.lstrip("﻿")
    if not text.strip():
        return [], [Problem(file, 0, "Die Datei ist leer.")]
    sample = text[:2048]
    try:
        dialect: type[csv.Dialect] | csv.Dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.reader(io.StringIO(text), dialect)
    header = [h.strip().lower() for h in next(reader, [])]
    missing = [c for c in required if c not in header]
    if missing:
        return [], [Problem(file, 1, f"Spalte fehlt: {', '.join(missing)}")]
    rows: list[tuple[int, dict[str, str]]] = []
    for number, values in enumerate(reader, start=2):
        if not any(v.strip() for v in values):
            continue
        if len(rows) >= MAX_ROWS:
            return rows, [Problem(file, number, f"Mehr als {MAX_ROWS} Zeilen; bitte aufteilen.")]
        rows.append(
            (
                number,
                {h: (values[i].strip() if i < len(values) else "") for i, h in enumerate(header)},
            )
        )
    return rows, []


def _int(value: str, low: int, high: int) -> int | None:
    try:
        n = int(value)
    except ValueError:
        return None
    return n if low <= n <= high else None


def _date(value: str) -> date | None:
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def normalize_set(value: str) -> str:
    """Set-Kürzel groß; leer, „?“ oder „unbekannt“ wird ``UNK`` (Befragung vom 22.11.2026)."""
    v = " ".join(value.split())
    if not v or v.lower() in ("?", "-", "unbekannt", "unknown", "unk"):
        return UNKNOWN_SET
    return v.upper() if len(v) <= 6 else v


def check_tournament(t: LegacyTournament, file: str, today: date) -> list[Problem]:
    """Prüfungen, die für CSV und Formular gleich sind."""
    problems: list[Problem] = []
    label = f"Turnier {t.key}"
    if t.held_on > today:
        problems.append(Problem(file, 0, f"{label}: Das Datum liegt in der Zukunft."))
    if len(t.entries) < 2:
        problems.append(Problem(file, 0, f"{label}: mindestens 2 Spieler nötig."))
    names = [e.name.lower() for e in t.entries]
    doubled = sorted({e.name for e in t.entries if names.count(e.name.lower()) > 1})
    if doubled:
        problems.append(Problem(file, 0, f"{label}: {', '.join(doubled)} steht doppelt drin."))
    for e in t.entries:
        if not 1 <= e.place <= len(t.entries):
            problems.append(
                Problem(
                    file,
                    0,
                    f"{label}: Platz {e.place} für {e.name} passt nicht "
                    f"zu {len(t.entries)} Spielern.",
                )
            )
    if len(t.set_code) > 20:
        problems.append(Problem(file, 0, f"{label}: Set-Name länger als 20 Zeichen."))
    players = set(names)
    for m in t.matches:
        if m.a.lower() == m.b.lower():
            problems.append(
                Problem(file, 0, f"{label}: {m.a} spielt in Runde {m.round} gegen sich selbst.")
            )
        for name in (m.a, m.b):
            if name.lower() not in players:
                problems.append(
                    Problem(
                        file,
                        0,
                        f"{label}: {name} spielt ein Match, steht aber nicht in der Turnierliste.",
                    )
                )
    return problems


def parse(tournaments_csv: str, matches_csv: str | None, *, today: date) -> Parsed:
    problems: list[Problem] = []
    rows, errors = _rows(tournaments_csv, "turniere", TOURNAMENT_COLUMNS)
    problems += errors
    by_key: dict[str, LegacyTournament] = {}
    for line, row in rows:
        key = row["turnier_id"]
        held_on = _date(row["datum"])
        place = _int(row["platz"], 1, 99)
        name = " ".join(row["spieler"].split())
        if not key:
            problems.append(Problem("turniere", line, "turnier_id fehlt."))
            continue
        if held_on is None:
            problems.append(
                Problem("turniere", line, f"Datum „{row['datum']}“ ist kein JJJJ-MM-TT.")
            )
            continue
        if not name:
            problems.append(Problem("turniere", line, "Spieler fehlt."))
            continue
        if place is None:
            problems.append(
                Problem("turniere", line, f"Platz „{row['platz']}“ ist keine Zahl von 1 bis 99.")
            )
            continue
        set_code = normalize_set(row.get("set", ""))
        t = by_key.get(key)
        if t is None:
            t = by_key[key] = LegacyTournament(key, held_on, set_code)
        elif (t.held_on, t.set_code) != (held_on, set_code):
            problems.append(
                Problem(
                    "turniere",
                    line,
                    f"Turnier {key} hat in einer anderen Zeile ein anderes Datum oder Set.",
                )
            )
            continue
        t.entries.append(LegacyEntry(name, place))

    if matches_csv and matches_csv.strip():
        rows, errors = _rows(matches_csv, "matches", MATCH_COLUMNS)
        problems += errors
        for line, row in rows:
            t = by_key.get(row["turnier_id"])
            if t is None:
                problems.append(
                    Problem(
                        "matches",
                        line,
                        f"Turnier {row['turnier_id']} gibt es in der Turnierdatei nicht.",
                    )
                )
                continue
            rnd = _int(row["runde"], 1, 50)
            ga = _int(row["spiele_a"], 0, 9)
            gb = _int(row["spiele_b"], 0, 9)
            if rnd is None or ga is None or gb is None:
                problems.append(
                    Problem("matches", line, "Runde oder Spiele sind keine gültigen Zahlen.")
                )
                continue
            t.matches.append(
                LegacyMatch(
                    rnd,
                    " ".join(row["spieler_a"].split()),
                    " ".join(row["spieler_b"].split()),
                    ga,
                    gb,
                )
            )

    for t in by_key.values():
        problems += check_tournament(t, "turniere", today)
    return Parsed(list(by_key.values()), problems)


def template_tournaments() -> str:
    return (
        "turnier_id,datum,set,spieler,platz\n"
        "2016-03-12-1,2016-03-12,SOI,Anna,1\n"
        "2016-03-12-1,2016-03-12,SOI,Ben,2\n"
        "2016-03-12-1,2016-03-12,SOI,Chris,3\n"
    )


def template_matches() -> str:
    return (
        "turnier_id,runde,spieler_a,spieler_b,spiele_a,spiele_b\n"
        "2016-03-12-1,1,Anna,Ben,2,1\n2016-03-12-1,2,Anna,Chris,2,0\n2016-03-12-1,3,Ben,Chris,1,1\n"
    )
