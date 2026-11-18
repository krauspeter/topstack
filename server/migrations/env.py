"""Alembic-Umgebung mit asynchroner Engine (asyncpg).

URL-Reihenfolge: ``sqlalchemy.url`` aus der Alembic-Konfiguration (setzen Tests), sonst
``TOPSTACK_DATABASE_URL``.
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from topstack.config import settings
from topstack.db import models  # noqa: F401  (registriert alle Tabellen)
from topstack.db.base import Base

config = context.config
if config.config_file_name and not config.attributes.get("skip_logging"):
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def database_url() -> str:
    return config.get_main_option("sqlalchemy.url") or settings.database_url


def configure(**kwargs) -> None:
    context.configure(target_metadata=target_metadata, compare_type=True, **kwargs)


def run_migrations_offline() -> None:
    configure(url=database_url(), literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    configure(connection=connection)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    engine = create_async_engine(database_url(), poolclass=pool.NullPool)
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_async_migrations())
