"""Fixtures für Tests gegen echtes PostgreSQL 16 (ADR-0014).

Die Tests laufen nur, wenn ``TOPSTACK_TEST_DATABASE_URL`` gesetzt ist, zum Beispiel::

    docker compose -f infra/docker-compose.yml up -d db
    export TOPSTACK_TEST_DATABASE_URL=postgresql+asyncpg://topstack:PASSWORT@localhost:5432/topstack_test

Der Name der Datenbank muss auf ``_test`` enden, weil die Fixture das Schema ``public`` einmal
pro Testlauf löscht und neu migriert. Jeder Test läuft in einer Transaktion, die am Ende
zurückgerollt wird.
"""

import asyncio
import os
from collections.abc import AsyncIterator
from pathlib import Path

import pytest

pytest.importorskip("sqlalchemy")
pytest.importorskip("asyncpg")
pytest.importorskip("alembic")

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

SERVER_DIR = Path(__file__).resolve().parents[2]


def alembic_config(url: str) -> Config:
    cfg = Config(str(SERVER_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(SERVER_DIR / "migrations"))
    cfg.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    cfg.attributes["skip_logging"] = True
    return cfg


async def _reset_schema(url: str) -> None:
    engine = create_async_engine(url, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
    await engine.dispose()


@pytest.fixture(scope="session")
def database_url() -> str:
    url = os.environ.get("TOPSTACK_TEST_DATABASE_URL")
    if not url:
        pytest.skip("TOPSTACK_TEST_DATABASE_URL nicht gesetzt")
    name = make_url(url).database or ""
    if not name.endswith("_test"):
        pytest.fail(f"Testdatenbank muss auf _test enden, ist aber {name!r}")
    return url


@pytest.fixture(scope="session")
def migrated_url(database_url: str) -> str:
    """Leere Datenbank, einmal pro Testlauf auf den neuesten Stand migriert."""
    asyncio.run(_reset_schema(database_url))
    command.upgrade(alembic_config(database_url), "head")
    return database_url


@pytest.fixture
async def session(migrated_url: str) -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(migrated_url, poolclass=NullPool)
    async with engine.connect() as conn:
        outer = await conn.begin()
        db = AsyncSession(bind=conn, join_transaction_mode="create_savepoint")
        try:
            yield db
        finally:
            await db.close()
            await outer.rollback()
    await engine.dispose()
