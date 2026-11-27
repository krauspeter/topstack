"""Gruppen anlegen, verwalten und die gemeinsame Rechteprüfung (Phase 5, AP-1, ADR-0018).

Jeder Endpunkt unter ``/groups/{gid}`` und jedes Turnier holt sich den Zugang über ``access``:
Fremde und gelöschte Gruppen sind ``NotFound``, fehlende Rechte ``Forbidden``, Schreiben in
archivierten Gruppen ``Archived``. Die Rechte selbst stehen in ``topstack.domain.groups``.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from topstack.db.models import (
    AppUser,
    GroupRules,
    Membership,
    Player,
    PlayGroup,
    Season,
    Tournament,
)
from topstack.db.repo import groups as repo
from topstack.domain import groups as rules
from topstack.domain.groups import Permission

log = logging.getLogger("topstack.groups")

IMAGE_TYPES = ("image/jpeg", "image/png", "image/webp")
MAX_IMAGE_BYTES = 1_000_000


class NotFound(Exception):
    pass


class Forbidden(Exception):
    pass


class Conflict(Exception):
    pass


class Archived(Conflict):
    def __init__(self) -> None:
        super().__init__("Die Gruppe ist archiviert und nur noch lesbar.")


def now() -> datetime:
    return datetime.now(UTC)


@dataclass
class Access:
    group: PlayGroup
    membership: Membership
    player: Player | None

    @property
    def role(self) -> str:
        return self.membership.role

    @property
    def archived(self) -> bool:
        return self.group.archived_at is not None

    def can(self, permission: Permission) -> bool:
        return rules.allows(self.role, permission)

    def require(self, permission: Permission, *, write: bool = True) -> Access:
        """``Forbidden`` ohne Recht, ``Archived`` beim Schreiben in archivierten Gruppen."""
        if not self.can(permission):
            raise Forbidden
        if write and self.archived:
            raise Archived
        return self


async def access(db: AsyncSession, gid: uuid.UUID, user: AppUser) -> Access:
    """Zugang eines Nutzers zu einer Gruppe; ``NotFound`` für Fremde und gelöschte Gruppen."""
    group = await db.get(PlayGroup, gid)
    if group is None or group.deleted_at is not None:
        raise NotFound
    membership = await repo.get_membership(db, group_id=gid, user_id=user.id)
    if membership is None:
        raise NotFound
    player = await db.scalar(
        select(Player).where(Player.group_id == gid, Player.app_user_id == user.id)
    )
    return Access(group, membership, player)


# ---------------------------------------------------------------------------
# Anlegen und bearbeiten
# ---------------------------------------------------------------------------


async def own_group_count(db: AsyncSession, user: AppUser) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(PlayGroup)
            .where(PlayGroup.created_by == user.id, PlayGroup.deleted_at.is_(None))
        )
        or 0
    )


async def create(
    db: AsyncSession, user: AppUser, name: str, *, today: date | None = None
) -> Access:
    """UC-01: Gruppe mit Standardregeln und Saison fürs laufende Jahr; Ersteller ist Admin."""
    if await own_group_count(db, user) >= rules.MAX_OWN_GROUPS:
        raise Conflict(f"Du kannst höchstens {rules.MAX_OWN_GROUPS} Gruppen anlegen.")
    group = await repo.create_group(db, name=name, created_by=user.id)
    player = await repo.add_member(db, group_id=group.id, user=user, role="admin")
    year = (today or date.today()).year
    await repo.create_season(
        db,
        group_id=group.id,
        name=f"Saison {year}",
        starts_on=date(year, 1, 1),
        ends_on=date(year, 12, 31),
    )
    membership = await repo.get_membership(db, group_id=group.id, user_id=user.id)
    assert membership is not None
    return Access(group, membership, player)


async def rename(a: Access, name: str) -> None:
    a.require(Permission.MANAGE)
    a.group.name = name.strip()


async def set_image(a: Access, data: bytes | None, content_type: str | None) -> None:
    a.require(Permission.MANAGE)
    if data is None:
        a.group.image = None
        a.group.image_type = None
        return
    if content_type not in IMAGE_TYPES:
        raise Conflict("Das Bild muss JPEG, PNG oder WebP sein.")
    if len(data) > MAX_IMAGE_BYTES:
        raise Conflict("Das Bild ist größer als 1 MB.")
    a.group.image = data
    a.group.image_type = content_type


async def image(db: AsyncSession, a: Access) -> tuple[bytes, str] | None:
    await db.refresh(a.group, ["image"])
    if a.group.image is None or a.group.image_type is None:
        return None
    return a.group.image, a.group.image_type


# ---------------------------------------------------------------------------
# Regeln: gelten ab der nächsten Saison (ADR-0018)
# ---------------------------------------------------------------------------

RULE_FIELDS = (
    *rules.INT_RULES,
    "match_time_limit_min",
    "placement_bonus",
    "season_mode",
    "season_months",
)


def rules_dict(r: GroupRules) -> dict[str, Any]:
    return {key: getattr(r, key) for key in RULE_FIELDS}


async def has_tournaments(db: AsyncSession, gid: uuid.UUID) -> bool:
    return (
        await db.scalar(select(Tournament.id).where(Tournament.group_id == gid).limit(1))
    ) is not None


async def change_rules(db: AsyncSession, a: Access, changes: dict[str, Any]) -> bool:
    """Regeln ändern. Gibt ``True`` zurück, wenn sie sofort gelten.

    Solange die Gruppe noch kein Turnier hat, gelten Änderungen sofort; danach erst mit der
    nächsten Saison, damit eine laufende Saison nicht nachträglich anders zählt.
    """
    a.require(Permission.MANAGE)
    clean = rules.validate_rules(changes)
    if not clean:
        return False
    if not await has_tournaments(db, a.group.id):
        current = await repo.get_rules(db, a.group.id)
        for key, value in clean.items():
            setattr(current, key, value)
        return True
    a.group.pending_rules = rules.merge_pending(a.group.pending_rules, clean)
    return False


async def discard_pending_rules(a: Access) -> None:
    a.require(Permission.MANAGE)
    a.group.pending_rules = None


async def ensure_season(db: AsyncSession, group: PlayGroup, day: date) -> Season | None:
    """Laufende Saison; fehlt sie, beginnt hier die nächste und übernimmt vorgemerkte Regeln.

    Liegt schon eine spätere Saison bereit (z. B. Saison 2027 ab 01.12.2026), entsteht keine
    neue, und das Turnier bleibt ohne Saison wie bisher.
    """
    seasons = list(
        await db.scalars(
            select(Season)
            .where(Season.group_id == group.id, Season.archived_at.is_(None))
            .order_by(Season.starts_on)
        )
    )
    for s in seasons:
        if s.starts_on <= day and (s.ends_on is None or s.ends_on >= day):
            return s
    if any(s.starts_on > day for s in seasons):
        return None
    if any(s.ends_on is None for s in seasons):
        return None  # ewige Saison, die erst später beginnt: nichts überschneiden
    await apply_pending_rules(db, group)
    await db.flush()
    r = await repo.get_rules(db, group.id)
    last_end = max((s.ends_on for s in seasons if s.ends_on is not None), default=None)
    span = rules.next_season(r.season_mode, r.season_months, last_end, day)
    return await repo.create_season(
        db, group_id=group.id, name=span.name, starts_on=span.starts_on, ends_on=span.ends_on
    )


async def apply_pending_rules(db: AsyncSession, group: PlayGroup) -> dict[str, Any]:
    """Beim Start einer neuen Saison: vorgemerkte Regeln übernehmen."""
    pending = group.pending_rules or {}
    if pending:
        current = await repo.get_rules(db, group.id)
        for key, value in rules.validate_rules(pending).items():
            setattr(current, key, value)
    group.pending_rules = None
    return pending


# ---------------------------------------------------------------------------
# Mitglieder und Rollen
# ---------------------------------------------------------------------------


@dataclass
class MemberRow:
    user_id: uuid.UUID
    display_name: str
    role: str
    joined_at: datetime
    player_id: uuid.UUID | None


async def members(db: AsyncSession, gid: uuid.UUID) -> list[MemberRow]:
    rows = await db.execute(
        select(Membership, AppUser.display_name, Player.id)
        .join(AppUser, AppUser.id == Membership.app_user_id)
        .outerjoin(
            Player, (Player.group_id == Membership.group_id) & (Player.app_user_id == AppUser.id)
        )
        .where(Membership.group_id == gid)
        .order_by(func.lower(AppUser.display_name))
    )
    return [MemberRow(m.app_user_id, name, m.role, m.joined_at, pid) for m, name, pid in rows.all()]


async def _memberships(db: AsyncSession, gid: uuid.UUID) -> list[Membership]:
    stmt = select(Membership).where(Membership.group_id == gid).with_for_update()
    return list(await db.scalars(stmt))


def _as_members(rows: list[Membership]) -> list[rules.Member]:
    return [rules.Member(m.app_user_id, m.role, m.joined_at) for m in rows]


async def set_role(db: AsyncSession, a: Access, user_id: uuid.UUID, role: str) -> None:
    a.require(Permission.MANAGE)
    if role not in rules.ROLES:
        raise Conflict("Unbekannte Rolle.")
    rows = await _memberships(db, a.group.id)
    target = next((m for m in rows if m.app_user_id == user_id), None)
    if target is None:
        raise NotFound
    if rules.leaves_without_admin(_as_members(rows), user_id, role):
        raise Conflict("Die Gruppe braucht mindestens einen Admin.")
    target.role = role


async def leave(db: AsyncSession, a: Access) -> uuid.UUID | None:
    """Gruppe verlassen. Der Spieler bleibt mit seinen Ergebnissen in der Gruppe.

    Geht der letzte Admin, wird das älteste Mitglied Admin (Rückgabe: dessen Konto). Geht das
    letzte Mitglied überhaupt, landet die Gruppe im Papierkorb.
    """
    rows = await _memberships(db, a.group.id)
    successor = rules.successor_admin(_as_members(rows), a.membership.app_user_id)
    if successor is not None:
        next(m for m in rows if m.app_user_id == successor).role = "admin"
    await db.delete(a.membership)
    if len(rows) == 1:
        a.group.deleted_at = now()
    return successor


# ---------------------------------------------------------------------------
# Archivieren und löschen
# ---------------------------------------------------------------------------


async def _no_open_tournament(db: AsyncSession, gid: uuid.UUID) -> None:
    open_ = await db.scalar(
        select(Tournament.id)
        .where(
            Tournament.group_id == gid,
            Tournament.status.notin_(("finished", "cancelled")),
            Tournament.imported.is_(False),
        )
        .limit(1)
    )
    if open_ is not None:
        raise Conflict("Erst das laufende Turnier abschließen oder abbrechen.")


async def archive(db: AsyncSession, a: Access) -> None:
    a.require(Permission.MANAGE, write=False)
    if a.archived:
        return
    await _no_open_tournament(db, a.group.id)
    a.group.archived_at = now()


async def unarchive(a: Access) -> None:
    a.require(Permission.MANAGE, write=False)
    a.group.archived_at = None


async def delete_group(db: AsyncSession, a: Access) -> None:
    a.require(Permission.MANAGE, write=False)
    await _no_open_tournament(db, a.group.id)
    a.group.deleted_at = now()


async def deleted_groups(db: AsyncSession, user: AppUser) -> list[PlayGroup]:
    """Gelöschte Gruppen, die der Nutzer als Admin noch wiederherstellen kann."""
    cutoff = now() - rules.PURGE_AFTER
    stmt = (
        select(PlayGroup)
        .join(Membership, Membership.group_id == PlayGroup.id)
        .where(
            Membership.app_user_id == user.id,
            Membership.role == "admin",
            PlayGroup.deleted_at.is_not(None),
            PlayGroup.deleted_at > cutoff,
        )
        .order_by(PlayGroup.deleted_at.desc())
    )
    return list(await db.scalars(stmt))


async def restore(db: AsyncSession, gid: uuid.UUID, user: AppUser) -> PlayGroup:
    group = next((g for g in await deleted_groups(db, user) if g.id == gid), None)
    if group is None:
        raise NotFound
    group.deleted_at = None
    return group


PURGE_SECONDS = 6 * 3600


async def purge_loop() -> None:
    """In der API: alle 6 Stunden abgelaufene Gruppen aus dem Papierkorb löschen.

    Das nächtliche Backup liegt dazwischen, eine Gruppe ist also auch nach dem endgültigen
    Löschen noch 7 Tage im Backup.
    """
    from topstack.db.session import get_sessionmaker

    while True:
        try:
            async with get_sessionmaker()() as db:
                names = await purge(db)
                await db.commit()
            if names:
                log.info("Gruppen endgültig gelöscht: %s", ", ".join(names))
        except Exception:  # Datenbank kurz weg o. Ä.: beim nächsten Durchlauf
            log.exception("Papierkorb der Gruppen nicht geleert")
        await asyncio.sleep(PURGE_SECONDS)


async def purge(db: AsyncSession, *, at: datetime | None = None) -> list[str]:
    """Gruppen endgültig löschen, die seit mehr als 30 Tagen im Papierkorb liegen.

    Erst die Turniere, dann die Gruppe: ``tournament_entry`` verweist mit ``RESTRICT`` auf
    ``player`` und darf beim Löschen der Spieler nicht mehr da sein.
    """
    cutoff = (at or now()) - rules.PURGE_AFTER
    doomed = list(
        await db.scalars(
            select(PlayGroup).where(
                PlayGroup.deleted_at.is_not(None), PlayGroup.deleted_at <= cutoff
            )
        )
    )
    for group in doomed:
        await db.execute(delete(Tournament).where(Tournament.group_id == group.id))
        await db.execute(delete(PlayGroup).where(PlayGroup.id == group.id))
    return [g.name for g in doomed]
