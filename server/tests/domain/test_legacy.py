"""Altdaten lesen und prüfen (Phase 5, AP-4, TC-146, TC-150)."""

from datetime import date

from topstack.domain.legacy import normalize_set, parse, template_matches, template_tournaments

TODAY = date(2026, 11, 28)


def test_templates_from_roadmap_parse_cleanly():
    parsed = parse(template_tournaments(), template_matches(), today=TODAY)
    assert parsed.ok, parsed.problems
    [t] = parsed.tournaments
    assert (t.key, t.held_on, t.set_code) == ("2016-03-12-1", date(2016, 3, 12), "SOI")
    assert [(e.name, e.place) for e in t.entries] == [("Anna", 1), ("Ben", 2), ("Chris", 3)]
    assert len(t.matches) == 3


def test_semicolon_and_bom_from_german_excel():
    text = "﻿turnier_id;datum;set;spieler;platz\nA;2019-05-01;;Anna;1\nA;2019-05-01;;Ben;2\n"
    parsed = parse(text, None, today=TODAY)
    assert parsed.ok, parsed.problems
    assert parsed.tournaments[0].set_code == "UNK"  # TC-150


def test_problems_with_line_numbers():  # TC-146
    text = (
        "turnier_id,datum,set,spieler,platz\n"
        "A,2019-05-01,DOM,Anna,1\n"
        "A,01.05.2019,DOM,Ben,2\n"  # Zeile 3: Datum
        "B,2019-06-01,M20,Chris,x\n"  # Zeile 4: Platz
        "B,2019-06-01,M20,Dana,1\n"
        "C,2030-01-01,M20,Eva,1\n"
        "C,2030-01-01,M20,Finn,2\n"
    )
    matches = (
        "turnier_id,runde,spieler_a,spieler_b,spiele_a,spiele_b\n"
        "Z,1,Anna,Ben,2,0\n"
        "A,1,Anna,Gus,2,0\n"
    )
    parsed = parse(text, matches, today=TODAY)
    messages = [(p.file, p.line, p.message) for p in parsed.problems]
    assert ("turniere", 3, "Datum „01.05.2019“ ist kein JJJJ-MM-TT.") in messages
    assert any(f == "turniere" and line == 4 and "Platz" in m for f, line, m in messages)
    assert any(f == "matches" and line == 2 and "Z" in m for f, line, m in messages)
    assert any("Gus spielt ein Match" in m for _, _, m in messages)
    assert any("Zukunft" in m for _, _, m in messages)
    assert any("Turnier A: mindestens 2 Spieler" in m for _, _, m in messages)
    assert not parsed.ok


def test_missing_column_and_empty_file():
    assert parse("turnier_id,datum,spieler\nA,2019-01-01,Anna\n", None, today=TODAY).problems[
        0
    ].message == ("Spalte fehlt: platz")
    assert parse("  ", None, today=TODAY).problems[0].message == "Die Datei ist leer."


def test_duplicate_player_and_place_out_of_range():
    text = (
        "turnier_id,datum,spieler,platz\n"
        "A,2019-05-01,Anna,1\n"
        "A,2019-05-01,anna,2\n"
        "A,2019-05-01,Ben,5\n"
    )
    messages = [p.message for p in parse(text, None, today=TODAY).problems]
    assert any("steht doppelt" in m for m in messages)
    assert any("Platz 5 für Ben" in m for m in messages)


def test_normalize_set():
    assert normalize_set(" dsk ") == "DSK"
    assert normalize_set("?") == "UNK"
    assert normalize_set("Unbekannt") == "UNK"
    assert normalize_set("Cube Weihnachten") == "Cube Weihnachten"
