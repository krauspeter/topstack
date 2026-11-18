"""Engine und Sitzungen.

Die Engine wird erst beim ersten Zugriff angelegt, damit Tests und Skripte die
Datenbank-URL vorher setzen können. Eine Sitzung gilt für eine Anfrage; Dienste
entscheiden selbst, wann sie ``commit()`` aufrufen. Ohne Commit wird beim Schließen
alles zurückgerollt.
"""

from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from topstack.config import settings


@lru_cache
def get_engine(url: str | None = None) -> AsyncEngine:
    return create_async_engine(url or settings.database_url, pool_pre_ping=True)


@lru_cache
def get_sessionmaker(url: str | None = None) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(url), expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI-Abhängigkeit: eine Sitzung pro Anfrage."""
    async with get_sessionmaker()() as session:
        yield session
