"""Migrationen: laufen auf leerer Datenbank und passen zu den Modellen."""

from alembic import command
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tests.db.conftest import alembic_config
from topstack.db.base import Base


async def test_all_model_tables_exist(session: AsyncSession):
    rows = await session.execute(
        text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
    )
    tables = {r[0] for r in rows} - {"alembic_version"}
    assert tables == set(Base.metadata.tables)
    assert len(tables) == 25


async def test_head_revision(session: AsyncSession):
    version = await session.scalar(text("SELECT version_num FROM alembic_version"))
    assert version == "0001"


def test_models_match_migrations(migrated_url: str):
    """Entspricht ``alembic check``: Autogenerate findet keine Abweichung."""
    command.check(alembic_config(migrated_url))
