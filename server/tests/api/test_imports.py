"""Altdaten importieren (Phase 5, AP-4, ADR-0019), Testfälle TC-146 bis TC-150."""

from datetime import date

from sqlalchemy import func, select

from tests.api.helpers import is_problem
from tests.api.test_tournaments import admin_group, as_user
from tests.db.factories import make_member
from topstack.db.models import AppUser, ImportRun, Player, Tournament
from topstack.db.repo import groups as repo
from topstack.domain.legacy import template_matches, template_tournaments

CSV = template_tournaments() + (
    "2019-05-01-1,2019-05-01,,Anna,2\n2019-05-01-1,2019-05-01,,Peter,1\n"
)


async def preview(client, group, **body):
    r = await client.post(f"/api/v1/groups/{group.id}/imports/csv", json=body)
    assert r.status_code == 200, r.text
    return r.json()


async def test_preview_saves_nothing(client, session):  # TC-146
    group, _, _ = await admin_group(client, session)
    body = await preview(client, group, tournaments_csv=CSV, matches_csv=template_matches())
    assert body["applied"] is False and body["problems"] == []
    assert [(t["key"], t["players"], t["matches"]) for t in body["tournaments"]] == [
        ("2016-03-12-1", 3, 3),
        ("2019-05-01-1", 2, 0),
    ]
    # Peter gibt es schon (Admin), die anderen werden Ehemalige
    assert body["known_players"] == ["Peter"]
    assert body["new_players"] == ["Anna", "Ben", "Chris"]
    imported = await session.scalar(
        select(func.count()).select_from(Tournament).where(Tournament.imported.is_(True))
    )
    assert imported == 0


async def test_apply_then_leaderboard_and_undo(client, session):  # TC-147, TC-148
    group, peter, _ = await admin_group(client, session)
    await repo.create_season(
        session,
        group_id=group.id,
        name="Saison 2016",
        starts_on=date(2016, 1, 1),
        ends_on=date(2016, 12, 31),
    )
    before = (await client.get(f"/api/v1/groups/{group.id}/leaderboard")).json()

    body = await preview(
        client,
        group,
        tournaments_csv=CSV,
        matches_csv=template_matches(),
        apply=True,
        source="alt.csv",
    )
    assert body["applied"] and body["run_id"]
    t2016 = await session.scalar(
        select(Tournament).where(Tournament.group_id == group.id, Tournament.set_code == "SOI")
    )
    assert t2016.imported and t2016.status == "finished" and t2016.season_id is not None
    view = (await client.get(f"/api/v1/tournaments/{t2016.id}")).json()
    assert view["imported"] is True
    assert [s["display_name"] for s in view["standings"]] == ["Anna", "Ben", "Chris"]
    formers = list(
        await session.scalars(
            select(Player).where(Player.group_id == group.id, Player.kind == "former")
        )
    )
    assert sorted(p.display_name for p in formers) == ["Anna", "Ben", "Chris"]

    board = (await client.get(f"/api/v1/groups/{group.id}/leaderboard")).json()
    assert board != before
    listed = (await client.get(f"/api/v1/groups/{group.id}/tournaments")).json()
    assert {t["imported"] for t in listed} == {True}

    runs = (await client.get(f"/api/v1/groups/{group.id}/imports")).json()
    assert [(r["source"], r["tournaments"], r["new_players"]) for r in runs] == [("alt.csv", 2, 3)]
    assert runs[0]["created_by"] == "Peter"

    undo = await client.delete(f"/api/v1/groups/{group.id}/imports/{body['run_id']}")
    assert undo.status_code == 204
    session.expunge_all()
    left = await session.scalar(
        select(func.count()).select_from(Tournament).where(Tournament.group_id == group.id)
    )
    assert left == 0
    still = await session.scalar(
        select(func.count())
        .select_from(Player)
        .where(Player.group_id == group.id, Player.kind == "former")
    )
    assert still == 0
    assert (await client.get(f"/api/v1/groups/{group.id}/leaderboard")).json() == before
    again = await client.delete(f"/api/v1/groups/{group.id}/imports/{body['run_id']}")
    assert is_problem(again, 409)
    assert (await session.get(ImportRun, body["run_id"])).undone_at is not None


async def test_apply_refused_with_problems(client, session):
    group, _, _ = await admin_group(client, session)
    bad = "turnier_id,datum,spieler,platz\nA,gestern,Anna,1\n"
    r = await client.post(
        f"/api/v1/groups/{group.id}/imports/csv", json={"tournaments_csv": bad, "apply": True}
    )
    assert is_problem(r, 422)


async def test_manual_tournament(client, session):  # TC-149
    group, _, _ = await admin_group(client, session)
    url = f"/api/v1/groups/{group.id}/imports/manual"
    body = {
        "held_on": "2018-07-14",
        "set_code": "dom",
        "entries": [{"name": "Peter", "place": 1}, {"name": "Ben", "place": 2}],
        "apply": True,
    }
    r = await client.post(url, json=body)
    assert r.status_code == 200 and r.json()["applied"], r.text
    t = await session.scalar(select(Tournament).where(Tournament.group_id == group.id))
    assert (t.set_code, t.held_on, t.imported) == ("DOM", date(2018, 7, 14), True)

    wrong = {**body, "entries": [{"name": "Peter", "place": 1}, {"name": "Ben", "place": 5}]}
    r = await client.post(url, json={**wrong, "apply": False})
    assert r.status_code == 200 and any("Platz 5" in p["message"] for p in r.json()["problems"])


async def test_duplicate_warning(client, session):
    group, _, _ = await admin_group(client, session)
    await preview(client, group, tournaments_csv=template_tournaments(), apply=True)
    body = await preview(client, group, tournaments_csv=template_tournaments())
    assert body["tournaments"][0]["duplicate"] is True
    assert "doppelt" in body["warnings"][0]


async def test_only_admins_import(client, session):
    group, _, _ = await admin_group(client, session)
    member = await make_member(session, group)
    await as_user(client, session, await session.get(AppUser, member.app_user_id))
    r = await client.post(f"/api/v1/groups/{group.id}/imports/csv", json={"tournaments_csv": CSV})
    assert is_problem(r, 403)
    assert is_problem(await client.get(f"/api/v1/groups/{group.id}/imports"), 403)
