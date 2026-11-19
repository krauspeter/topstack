from fastapi import APIRouter, FastAPI

from topstack import __version__
from topstack.api import auth, invitations, me, passkeys, problems
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
async def health() -> dict[str, str]:
    """Lebenszeichen für Caddy, Docker und Monitoring."""
    return {"status": "ok", "version": __version__, "environment": settings.environment}


api.include_router(auth.router)
api.include_router(passkeys.router)
api.include_router(me.router)
api.include_router(invitations.router)
app.include_router(api)
