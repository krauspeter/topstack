"""Elo in Rangliste und Statistik (Phase 5, AP-5, TC-151 bis TC-153)."""

import pytest
from sqlalchemy import select

from tests.api.test_rounds import current_matches, report, running
from topstack.db.models import Player
from topstack.domain.legacy import template_tournaments


async def elo_by_name(client, group) -> dict[str, float]:
    board = (await client.get(f"/api/v1/groups/{group.id}/leaderboard")).json()
    return {r["display_name"]: r["elo"] for r in board["rows"]}


async def stats(client, group, pid):
    r = await client.get(f"/api/v1/groups/{group.id}/players/{pid}/stats")
    assert r.status_code == 200, r.text
    return r.json()


async def test_elo_without_guests_and_after_correction(client, session):  # TC-152, TC-153
    group, peter, t = await running(client, session)  # Peter, Ben, Chris, Dora, Gast Gina
    guest = await session.scalar(
        select(Player).where(Player.group_id == group.id, Player.kind == "guest")
    )
    matches = current_matches(t)
    own = next(
        m for m in matches if guest and str(guest.id) not in (m["player_a_id"], m["player_b_id"])
    )
    with_guest = next(
        (m for m in matches if str(guest.id) in (m["player_a_id"], m["player_b_id"])), None
    )

    r = await report(client, t, own, 2, 0)
    assert r.status_code == 200, r.text
    t = r.json()
    if with_guest:
        assert (await report(client, t, with_guest, 2, 0)).status_code == 200

    winner = own["player_a_id"]
    s = await stats(client, group, winner)
    assert s["elo"] == pytest.approx(1020) and s["elo_matches"] == 1
    assert [p["rating"] for p in s["elo_history"]] == [1020.0]
    if with_guest:
        # Das Match gegen den Gast zählt für niemanden
        other = next(
            p for p in (with_guest["player_a_id"], with_guest["player_b_id"]) if p != str(guest.id)
        )
        assert (await stats(client, group, other))["elo_matches"] == 0

    # Korrektur: jetzt Unentschieden → beide wieder 1000
    fresh = next(m for m in current_matches(r.json()) if m["id"] == own["id"])
    fix = await report(client, t, fresh, 1, 1, version=fresh["version"])
    assert fix.status_code == 200, fix.text
    assert (await stats(client, group, winner))["elo"] == pytest.approx(1000)
    assert peter is not None


async def test_imported_tournaments_do_not_count(client, session):  # TC-152
    group, _, _ = await running(client, session)
    r = await client.post(
        f"/api/v1/groups/{group.id}/imports/csv",
        json={"tournaments_csv": template_tournaments(), "apply": True},
    )
    assert r.status_code == 200 and r.json()["applied"], r.text
    anna = await session.scalar(
        select(Player).where(Player.group_id == group.id, Player.display_name == "Anna")
    )
    s = await stats(client, group, anna.id)
    assert (s["elo"], s["elo_matches"], s["elo_global"]) == (1000.0, 0, None)


async def test_leaderboard_has_elo_column(client, session):  # TC-151
    group, _, t = await running(client, session)
    for m in current_matches(t):
        r = await report(client, t, m, 2, 1)
        assert r.status_code == 200, r.text
        t = r.json()
    board = (await client.get(f"/api/v1/groups/{group.id}/leaderboard")).json()
    assert all("elo" in row and "elo_matches" in row for row in board["rows"])
