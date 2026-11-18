"""Legt die eigene Spielgruppe an (Phase 3, AP-1).

Beispiel auf dem Heimserver::

    docker compose exec api python -m topstack.scripts.seed_group \
        --group "Draft-Runde" --admin-email du@example.org --admin-name Peter

Das Skript ist wiederholbar: Gibt es die Gruppe schon, ändert es nichts.
"""

import argparse
import asyncio
import sys
from dataclasses import dataclass
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from topstack.db.models import PlayGroup
from topstack.db.repo import accounts, groups


@dataclass
class SeedResult:
    group: PlayGroup
    created: bool


async def seed_group(
    session: AsyncSession,
    *,
    group_name: str,
    admin_email: str,
    admin_name: str,
    season_year: int,
) -> SeedResult:
    existing = await groups.get_group_by_name(session, group_name)
    if existing is not None:
        return SeedResult(existing, created=False)

    admin = await accounts.get_user_by_email(session, admin_email)
    if admin is None:
        admin = await accounts.create_user(session, email=admin_email, display_name=admin_name)

    group = await groups.create_group(session, name=group_name, created_by=admin.id)
    await groups.add_member(session, group_id=group.id, user=admin, role="admin")
    await groups.create_season(
        session,
        group_id=group.id,
        name=f"Saison {season_year}",
        starts_on=date(season_year, 1, 1),
        ends_on=date(season_year, 12, 31),
    )
    return SeedResult(group, created=True)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--group", required=True, help="Name der Gruppe")
    parser.add_argument("--admin-email", required=True, help="E-Mail des Gruppen-Admins")
    parser.add_argument("--admin-name", required=True, help="Anzeigename des Gruppen-Admins")
    parser.add_argument("--season-year", type=int, default=2027, help="Jahr der ersten Saison")
    return parser.parse_args(argv)


async def main(argv: list[str]) -> int:
    from topstack.db.session import get_engine, get_sessionmaker

    args = parse_args(argv)
    async with get_sessionmaker()() as session:
        result = await seed_group(
            session,
            group_name=args.group,
            admin_email=args.admin_email,
            admin_name=args.admin_name,
            season_year=args.season_year,
        )
        await session.commit()
    await get_engine().dispose()

    if result.created:
        print(f"Gruppe „{result.group.name}“ angelegt ({result.group.id}).")
    else:
        print(f"Gruppe „{result.group.name}“ gibt es schon ({result.group.id}), nichts geändert.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1:])))
