"""Rangliste und Spielerstatistik über die API (TC-70 bis TC-74)."""

from datetime import date

import pytest

from tests.api.helpers import is_problem
from tests.api.test_rounds import play_all, running
from tests.api.test_tournaments import as_user, start
from tests.db.factories import make_user
from topstack.db.models import Tournament
from topstack.db.repo import groups

pytestmark = pytest.mark.usefixtures("client")


def by_order(order: list[str]):
    """Wer weiter vorne in ``order`` steht, gewinnt 2:0."""

    def score(m):
        return (2, 0) if order.index(m["player_a"]) < order.index(m["player_b"]) else (0, 2)

    return score


async def finish(client, t, order):
    t = await play_all(client, t, by_order(order))
    t = (await client.post(f"/api/v1/tournaments/{t['id']}/tiebreak-roll")).json()
    r = await client.post(f"/api/v1/tournaments/{t['id']}/finish")
    assert r.status_code == 200, r.text
    return r.json()


async def two_tournaments(client, session):
    """T1: Peter, Ben, Chris, Dora, Gast Gina. T2: Chris, Ben, Peter."""
    group, peter, t = await running(client, session)
    t1 = await finish(client, t, ["Peter", "Ben", "Chris", "Dora", "Gina"])
    ids = {e["display_name"]: e["player_id"] for e in t1["entries"]}

    t = (await start(client, group)).json()
    await client.post(
        f"/api/v1/tournaments/{t['id']}/entries", json={"player_ids": [ids["Ben"], ids["Chris"]]}
    )
    await client.post(f"/api/v1/tournaments/{t['id']}/seating")
    await client.post(f"/api/v1/tournaments/{t['id']}/draft")
    r = await client.post(f"/api/v1/tournaments/{t['id']}/rounds/next", json={"confirm": True})
    assert r.status_code == 200, r.text
    t2 = await finish(client, r.json(), ["Chris", "Ben", "Peter"])
    return group, peter, t1, t2, ids


def rows(body):
    return [
        (
            r["display_name"],
            r["rank"],
            r["tournaments"],
            r["wins"],
            r["ranking_points"],
            r["match_points"],
        )
        for r in body["rows"]
    ]


async def test_leaderboard_by_hand(client, session):  # TC-70, TC-72, TC-73
    group, peter, t1, t2, ids = await two_tournaments(client, session)
    # Ein abgebrochenes drittes Turnier zählt nicht
    t3 = (await start(client, group)).json()
    await client.post(f"/api/v1/tournaments/{t3['id']}/cancel")

    body = (await client.get(f"/api/v1/groups/{group.id}/leaderboard")).json()
    assert body["tournaments"] == 2
    # T1 (5 Spieler, 4 Matches je Spieler): Peter 7 P / 12 MP, Ben 5 / 9, Chris 3 / 6, Dora 2 / 3
    # T2 (3 Spieler, 2 Matches je Spieler): Chris 5 / 6, Ben 3 / 3, Peter 1 / 0
    # Summe: Peter 8 / 12 / 1 Sieg, Chris 8 / 12 / 1 Sieg → gleicher Rang, Ben 8 / 12 / 0 Siege
    table = rows(body)
    assert sorted(table[:2]) == [("Chris", 1, 2, 1, 8, 12), ("Peter", 1, 2, 1, 8, 12)]
    assert table[2:] == [("Ben", 3, 2, 0, 8, 12), ("Dora", 4, 1, 0, 2, 3)]
    assert all(r["display_name"] != "Gina" for r in body["rows"])  # Gast fehlt
    assert body["rows"][0]["avg_match_points"] == 6.0


async def test_filter_by_season_and_dates(client, session):  # TC-71
    group, peter, t1, t2, ids = await two_tournaments(client, session)
    season = await groups.create_season(
        session, group_id=group.id, name="2027", starts_on=date(2027, 1, 1), ends_on=None
    )
    first = await session.get(Tournament, t1["id"])
    second = await session.get(Tournament, t2["id"])
    first.season_id, first.held_on = season.id, date(2027, 1, 15)
    second.season_id, second.held_on = None, date(2027, 3, 1)
    await session.commit()

    url = f"/api/v1/groups/{group.id}/leaderboard"
    only_season = (await client.get(url, params={"season": str(season.id)})).json()
    assert only_season["tournaments"] == 1
    assert rows(only_season)[0] == ("Peter", 1, 1, 1, 7, 12)

    march = (await client.get(url, params={"from": "2027-02-01", "to": "2027-03-31"})).json()
    assert march["tournaments"] == 1
    assert rows(march)[0] == ("Chris", 1, 1, 1, 5, 6)

    assert is_problem(await client.get(url, params={"from": "2027-03-01", "to": "2027-01-01"}), 422)

    seasons = (await client.get(f"/api/v1/groups/{group.id}/seasons")).json()
    assert [s["name"] for s in seasons][0] == "2027"


async def test_player_stats(client, session):  # TC-74
    group, peter, t1, t2, ids = await two_tournaments(client, session)
    me = t1["my_player_id"]
    s = (await client.get(f"/api/v1/groups/{group.id}/players/{me}/stats")).json()
    assert (s["display_name"], s["tournaments"], s["tournament_wins"], s["ranking_points"]) == (
        "Peter",
        2,
        1,
        8,
    )
    assert s["places"] == {"1": 1, "3": 1}
    assert s["avg_place"] == 2.0
    # T1 4 Siege 2:0, T2 2 Niederlagen 0:2
    assert s["matches"] == {"wins": 4, "draws": 0, "losses": 2}
    assert s["match_win_rate"] == 66.7
    assert (s["games_won"], s["games_lost"], s["game_win_rate"]) == (8, 4, 66.7)
    assert s["colors"] == [{"key": "G", "count": 1}]  # in T2 keine Farben gemeldet
    ben = next(o for o in s["opponents"] if o["display_name"] == "Ben")
    assert (ben["wins"], ben["losses"]) == (1, 1)
    assert any(o["display_name"] == "Gina" for o in s["opponents"])  # Match gegen den Gast zählt
    # Farbbilanz: in T1 spielen alle Grün, in T2 ist nichts gemeldet
    g = {"key": "G", "wins": 4, "draws": 0, "losses": 0, "win_rate": 100.0}
    assert s["with_colors"] == [g]
    assert s["vs_colors"] == [g]  # 4 und nicht 3: die Farbe des Gastes Gina zählt mit


async def test_only_members(client, session):
    group, peter, t1, t2, ids = await two_tournaments(client, session)
    stranger = await make_user(session, "Fremd")
    await as_user(client, session, stranger)
    assert is_problem(await client.get(f"/api/v1/groups/{group.id}/leaderboard"), 404)
    assert is_problem(
        await client.get(f"/api/v1/groups/{group.id}/players/{ids['Ben']}/stats"), 404
    )
