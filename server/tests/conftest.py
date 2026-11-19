"""Gemeinsame Fixtures: echtes PostgreSQL 16 (ADR-0014) und ein API-Client.

Die Tests laufen nur, wenn ``TOPSTACK_TEST_DATABASE_URL`` gesetzt ist, zum Beispiel::

    docker compose -f infra/docker-compose.yml up -d db
    export TOPSTACK_TEST_DATABASE_URL=postgresql+asyncpg://topstack:PASSWORT@localhost:5432/topstack_test

Der Name der Datenbank muss auf ``_test`` enden, weil die Fixture das Schema ``public`` einmal
pro Testlauf löscht und neu migriert. Jeder Test läuft in einer Transaktion, die am Ende
zurückgerollt wird.
"""

import asyncio
import os
import re
from collections.abc import AsyncIterator
from pathlib import Path

import pytest

SERVER_DIR = Path(__file__).resolve().parents[1]


def _db_imports() -> None:
    for module in ("sqlalchemy", "asyncpg", "alembic"):
        pytest.importorskip(module)


def alembic_config(url: str):
    from alembic.config import Config

    cfg = Config(str(SERVER_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(SERVER_DIR / "migrations"))
    cfg.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    cfg.attributes["skip_logging"] = True
    return cfg


async def _reset_schema(url: str) -> None:
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import NullPool

    engine = create_async_engine(url, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
    await engine.dispose()


@pytest.fixture(scope="session")
def database_url() -> str:
    _db_imports()
    from sqlalchemy.engine import make_url

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
    from alembic import command

    asyncio.run(_reset_schema(database_url))
    command.upgrade(alembic_config(database_url), "head")
    return database_url


@pytest.fixture
async def session(migrated_url: str) -> AsyncIterator:
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.pool import NullPool

    engine = create_async_engine(migrated_url, poolclass=NullPool)
    async with engine.connect() as conn:
        outer = await conn.begin()
        db = AsyncSession(
            bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False
        )
        try:
            yield db
        finally:
            await db.close()
            await outer.rollback()
    await engine.dispose()


# ---------------------------------------------------------------------------
# API-Client gegen die Test-Datenbank, Mails werden gesammelt statt verschickt
# ---------------------------------------------------------------------------


class FakeMailer:
    def __init__(self) -> None:
        self.sent: list = []

    async def send(self, mail) -> None:
        self.sent.append(mail)

    def last_link_token(self) -> str:
        match = re.search(r"token=([A-Za-z0-9_-]+)", self.sent[-1].text)
        assert match, self.sent[-1].text
        return match.group(1)


@pytest.fixture
def mailer() -> FakeMailer:
    return FakeMailer()


@pytest.fixture
async def client(session, mailer) -> AsyncIterator:
    """httpx-Client gegen die App; nutzt dieselbe Test-Transaktion wie ``session``."""
    from httpx import ASGITransport, AsyncClient

    from topstack.db.session import get_session
    from topstack.main import app
    from topstack.services.mail import get_mailer

    async def _session():
        yield session

    app.dependency_overrides[get_session] = _session
    app.dependency_overrides[get_mailer] = lambda: mailer
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c
    finally:
        app.dependency_overrides.clear()
