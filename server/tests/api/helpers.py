"""Hilfen für API-Tests."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from topstack.db.models import AppUser
from topstack.services import auth


async def login(client: AsyncClient, session: AsyncSession, user: AppUser) -> str:
    """Meldet ``user`` direkt über eine neue Sitzung an (ohne Magic-Link)."""
    token = await auth.create_session(session, user, "pytest")
    client.cookies.set(auth.SESSION_COOKIE, token)
    return token


def is_problem(response, status: int) -> bool:
    return (
        response.status_code == status
        and response.headers["content-type"].startswith("application/problem+json")
        and response.json()["status"] == status
    )
