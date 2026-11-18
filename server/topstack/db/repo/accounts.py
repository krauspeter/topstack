"""Konten."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from topstack.db.models import AppUser


def normalize_email(email: str) -> str:
    return email.strip().lower()


async def get_user_by_email(session: AsyncSession, email: str) -> AppUser | None:
    stmt = select(AppUser).where(func.lower(AppUser.email) == normalize_email(email))
    return await session.scalar(stmt)


async def create_user(session: AsyncSession, *, email: str | None, display_name: str) -> AppUser:
    user = AppUser(
        email=normalize_email(email) if email else None,
        display_name=display_name.strip(),
    )
    session.add(user)
    await session.flush()
    return user
