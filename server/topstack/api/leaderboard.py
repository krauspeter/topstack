"""Rangliste und Spielerstatistik (F-18, F-22, AP-9)."""

import uuid
from collections import Counter
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel

from topstack.api.deps import CurrentUser, Db
from topstack.api.problems import problem
from topstack.db.models import Player
from topstack.domain.elo import START, EloState
from topstack.domain.leaderboard import Record, leaderboard, player_stats, rate
from topstack.services import elo as elo_svc
from topstack.services import leaderboard as svc

router = APIRouter(tags=["Rangliste"])

# Filter nach Turnierdatum, in der URL als ?from=JJJJ-MM-TT&to=JJJJ-MM-TT
Since = Annotated[date | None, Query(alias="from")]
Until = Annotated[date | None, Query(alias="to")]


class SeasonOut(BaseModel):
    id: uuid.UUID
    name: str
    starts_on: date
    ends_on: date | None
    current: bool


class LeaderboardRowOut(BaseModel):
    rank: int
    player_id: uuid.UUID
    display_name: str
    kind: str
    tournaments: int
    wins: int  # Turniersiege
    ranking_points: int
    match_points: int
    avg_match_points: float
    elo: float  # Gruppen-Elo, über alle Saisons (AP-5)
    elo_matches: int


class LeaderboardOut(BaseModel):
    tournaments: int  # abgeschlossene Turniere im Filter
    rows: list[LeaderboardRowOut]


class RecordOut(BaseModel):
    wins: int
    draws: int
    losses: int


class OpponentOut(RecordOut):
    player_id: uuid.UUID
    display_name: str


class ColorRecordOut(RecordOut):
    key: str  # Kombination wie „BRG“ oder einzelne Farbe; „C“ = farblos
    win_rate: float  # Prozent der Matches gewonnen


class CountOut(BaseModel):
    key: str
    count: int


class EloPointOut(BaseModel):
    played_on: date
    rating: float


class PlayerStatsOut(BaseModel):
    player_id: uuid.UUID
    display_name: str
    elo: float  # Gruppen-Elo über alle Saisons, unabhängig vom Filter (AP-5)
    elo_matches: int
    elo_global: float | None  # über alle Gruppen, nur mit Konto
    elo_history: list[EloPointOut]  # nach jedem Match
    tournaments: int
    tournament_wins: int
    ranking_points: int
    places: dict[int, int]  # Platz → Anzahl
    avg_place: float
    matches: RecordOut
    match_win_rate: float  # Prozent
    games_won: int
    games_lost: int
    games_drawn: int
    game_win_rate: float  # Prozent
    colors: list[CountOut]  # einzelne Farben, häufigste zuerst
    combos: list[CountOut]  # Kombinationen, häufigste zuerst
    opponents: list[OpponentOut]
    with_colors: list[ColorRecordOut]  # eigene Kombinationen, beste Siegquote zuerst
    vs_colors: list[ColorRecordOut]  # Gegner-Farben, meiste Niederlagen zuerst


def _filter(season: uuid.UUID | None, since: date | None, until: date | None) -> svc.Filter:
    if since and until and since > until:
        raise problem(422, "„Von“ liegt nach „bis“.")
    return svc.Filter(season, since, until)


async def _member(db: Db, gid: uuid.UUID, user: CurrentUser) -> None:
    try:
        await svc.check_member(db, gid, user)
    except svc.NotMember:
        raise problem(404, "Gruppe nicht gefunden.") from None


@router.get("/groups/{gid}/seasons")
async def list_seasons(gid: uuid.UUID, user: CurrentUser, db: Db) -> list[SeasonOut]:
    await _member(db, gid, user)
    today = date.today()
    return [
        SeasonOut(
            id=s.id,
            name=s.name,
            starts_on=s.starts_on,
            ends_on=s.ends_on,
            current=s.starts_on <= today and (s.ends_on is None or today <= s.ends_on),
        )
        for s in await svc.seasons(db, gid)
    ]


@router.get("/groups/{gid}/leaderboard")
async def get_leaderboard(
    gid: uuid.UUID,
    user: CurrentUser,
    db: Db,
    season: uuid.UUID | None = None,
    since: Since = None,
    until: Until = None,
) -> LeaderboardOut:
    """Rangliste: ohne ``season`` gesamt; ``from``/``to`` grenzen nach Turnierdatum ein."""
    await _member(db, gid, user)
    res = await svc.load(db, gid, _filter(season, since, until))
    elo = await elo_svc.group_elo(db, gid)
    return LeaderboardOut(
        tournaments=len(res.tournaments),
        rows=[
            LeaderboardRowOut(
                rank=r.rank,
                player_id=r.player,
                display_name=res.players[r.player].display_name,
                kind=res.players[r.player].kind,
                tournaments=r.tournaments,
                wins=r.wins,
                ranking_points=r.ranking_points,
                match_points=r.match_points,
                avg_match_points=r.avg_match_points,
                elo=round(elo[r.player].rating if r.player in elo else START, 1),
                elo_matches=elo[r.player].matches if r.player in elo else 0,
            )
            for r in leaderboard(res.tournaments, res.rules)
        ],
    )


@router.get("/groups/{gid}/players/{pid}/stats")
async def get_player_stats(
    gid: uuid.UUID,
    pid: uuid.UUID,
    user: CurrentUser,
    db: Db,
    season: uuid.UUID | None = None,
    since: Since = None,
    until: Until = None,
) -> PlayerStatsOut:
    """Basis-Statistik eines Spielers mit demselben Filter wie die Rangliste."""
    await _member(db, gid, user)
    res = await svc.load(db, gid, _filter(season, since, until))
    player = res.players.get(pid) or await db.get(Player, pid)
    if player is None or player.group_id != gid:
        raise problem(404, "Spieler nicht gefunden.")
    s = player_stats(res.tournaments, pid)
    own = (await elo_svc.group_elo(db, gid)).get(pid, EloState())
    glob = (
        (await elo_svc.global_elo(db)).get(player.app_user_id, EloState())
        if player.app_user_id
        else None
    )
    names = {k: p.display_name for k, p in res.players.items()}

    def counts(c: Counter[str]) -> list[CountOut]:
        return [CountOut(key=k, count=n) for k, n in c.most_common()]

    def color_records(d: dict[str, Record]) -> list[ColorRecordOut]:
        return [
            ColorRecordOut(
                key=k, wins=r.wins, draws=r.draws, losses=r.losses, win_rate=rate(r.wins, r.played)
            )
            for k, r in d.items()
        ]

    return PlayerStatsOut(
        player_id=pid,
        display_name=player.display_name,
        elo=round(own.rating, 1),
        elo_matches=own.matches,
        elo_global=round(glob.rating, 1) if glob else None,
        elo_history=[EloPointOut(played_on=p.played_on, rating=p.rating) for p in own.history],
        tournaments=s.tournaments,
        tournament_wins=s.tournament_wins,
        ranking_points=s.ranking_points,
        places=dict(sorted(s.places.items())),
        avg_place=s.avg_place,
        matches=RecordOut(wins=s.matches.wins, draws=s.matches.draws, losses=s.matches.losses),
        match_win_rate=s.match_win_rate,
        games_won=s.games_won,
        games_lost=s.games_lost,
        games_drawn=s.games_drawn,
        game_win_rate=s.game_win_rate,
        colors=counts(s.colors),
        combos=counts(s.combos),
        opponents=sorted(
            (
                OpponentOut(
                    player_id=o,
                    display_name=names.get(o, "?"),
                    wins=r.wins,
                    draws=r.draws,
                    losses=r.losses,
                )
                for o, r in s.opponents.items()
            ),
            key=lambda x: (-(x.wins + x.draws + x.losses), x.display_name),
        ),
        with_colors=sorted(
            color_records(s.with_combo),
            key=lambda x: (-x.win_rate, -(x.wins + x.draws + x.losses), x.key),
        ),
        vs_colors=sorted(
            color_records(s.vs_color),
            key=lambda x: (-x.losses, x.win_rate, x.key),
        ),
    )
