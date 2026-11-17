from fastapi import FastAPI

from topstack import __version__
from topstack.config import settings

app = FastAPI(
    title="TopStack API",
    version=__version__,
    docs_url="/api/v1/docs",
    openapi_url="/api/v1/openapi.json",
)


@app.get("/api/v1/health", tags=["Betrieb"])
async def health() -> dict[str, str]:
    """Lebenszeichen für Caddy, Docker und Monitoring."""
    return {"status": "ok", "version": __version__, "environment": settings.environment}
