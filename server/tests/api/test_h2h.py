"""Head-to-Head über die API (Phase 5, AP-6, TC-154)."""

from sqlalchemy import select

from tests.api.helpers import is_problem
from tests.api.test_rounds import current_matches, report, running
from topstack.db.models import Player


async def test_table_and_duel(client, session):
    group, _, t = await running(client, session)
    guest = await session.scalar(
        select(Player).where(Player.group_id == group.id, Player.kind == "guest")
    )
    own = next(
        x for x in current_matches(t) if str(guest.id) not in (x["player_a_id"], x["player_b_id"])
    )
    assert (await report(client, t, own, 1, 1)).status_code == 200
    a, b = own["player_a_id"], own["player_b_id"]

    table = (await client.get(f"/api/v1/groups/{group.id}/head-to-head")).json()
    rec = next(p for p in table["pairs"] if (p["player_id"], p["opponent_id"]) == (a, b))
    assert (rec["wins"], rec["draws"], rec["losses"], rec["imported"]) == (0, 1, 0, 0)
    assert str(guest.id) not in {p["player_id"] for p in table["players"]}

    duel = (await client.get(f"/api/v1/groups/{group.id}/head-to-head/{a}/{b}")).json()
    assert (duel["draws"], duel["games_won"], duel["games_lost"]) == (1, 1, 1)
    assert duel["elo"] == duel["opponent_elo"] == 1000
    assert [(x["games_won"], x["games_lost"]) for x in duel["meetings"]] == [(1, 1)]


async def test_duel_without_meetings_and_errors(client, session):
    group, _, t = await running(client, session)
    players = (await client.get(f"/api/v1/groups/{group.id}/players")).json()
    a, b = players[0]["id"], players[1]["id"]
    duel = (await client.get(f"/api/v1/groups/{group.id}/head-to-head/{a}/{b}")).json()
    assert (duel["wins"], duel["draws"], duel["losses"], duel["meetings"]) == (0, 0, 0, [])
    assert is_problem(await client.get(f"/api/v1/groups/{group.id}/head-to-head/{a}/{a}"), 422)
    guest = await session.scalar(
        select(Player).where(Player.group_id == group.id, Player.kind == "guest")
    )
    r = await client.get(f"/api/v1/groups/{group.id}/head-to-head/{a}/{guest.id}")
    assert is_problem(r, 404)
    assert t
