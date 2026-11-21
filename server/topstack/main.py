import os

from fastapi import APIRouter, FastAPI

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
from topstack.config import settings

app = FastAPI(
    title="TopStack API",
    version=__version__,
    docs_url="/api/v1/docs",
    openapi_url="/api/v1/openapi.json",
)
problems.install(app)

api = APIRouter(prefix="/api/v1")


@api.get("/health", tags=["Betrieb"])
async def health() -> dict[str, object]:
    """Lebenszeichen für Caddy, Docker und Monitoring; ``build`` sagt, welches Update läuft."""
    return {
        "status": "ok",
        "version": __version__,
        "environment": settings.environment,
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
