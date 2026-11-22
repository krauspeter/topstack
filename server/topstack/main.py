import asyncio
import logging
import os

from fastapi import APIRouter, FastAPI, Response
from sqlalchemy import text

from topstack import __version__
from topstack.api import (
    auth,
    invitations,
    leaderboard,
    live,
    me,
    passkeys,
    problems,
    push,
    tournaments,
)
from topstack.api.deps import Db
from topstack.config import settings

log = logging.getLogger("topstack.health")

# Länger als das hier darf die Datenbank nicht brauchen, sonst gilt sie als nicht erreichbar.
# Kürzer als der Timeout von Uptime Kuma, damit dort eine klare 503 ankommt statt eines Abbruchs.
DB_CHECK_TIMEOUT = 3.0

app = FastAPI(
    title="TopStack API",
    version=__version__,
    docs_url="/api/v1/docs",
    openapi_url="/api/v1/openapi.json",
)
problems.install(app)

api = APIRouter(prefix="/api/v1")


@api.get("/health", tags=["Betrieb"])
async def health(response: Response, db: Db) -> dict[str, object]:
    """Lebenszeichen für Caddy, Docker und Monitoring (ADR-0016).

    Prüft auch die Datenbank: Ist sie nicht erreichbar, antwortet der Endpunkt mit ``503``
    und ``"status": "error"``, damit Uptime Kuma Alarm schlägt. ``build`` sagt, welches Update
    läuft, ``database.migration`` die Alembic-Version der Datenbank.
    """
    database: dict[str, object] = {"status": "ok", "migration": None}
    try:
        async with asyncio.timeout(DB_CHECK_TIMEOUT):
            database["migration"] = await db.scalar(text("SELECT version_num FROM alembic_version"))
    except Exception as exc:  # jeder Fehler heißt hier: Datenbank nicht nutzbar
        log.warning("Health-Check: Datenbank nicht erreichbar: %s", type(exc).__name__)
        database = {"status": "error", "migration": None}
        response.status_code = 503
    return {
        "status": database["status"],
        "version": __version__,
        "environment": settings.environment,
        "database": database,
        "build": {
            "pr": os.environ.get("TOPSTACK_BUILD_PR", ""),
            "sha": os.environ.get("TOPSTACK_BUILD_SHA", ""),
            "time": os.environ.get("TOPSTACK_BUILD_TIME", ""),
        },
    }


api.include_router(auth.router)
api.include_router(passkeys.router)
api.include_router(me.router)
api.include_router(invitations.router)
api.include_router(tournaments.router)
api.include_router(push.router)
api.include_router(leaderboard.router)
app.include_router(api)
app.include_router(live.router)  # /ws, außerhalb von /api/v1 (siehe Caddyfile)
