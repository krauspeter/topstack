"""Feedback aus der App wird zum GitHub-Issue (Phase 4, AP-5, Entscheidung E4).

Ablauf: Die App schickt das Formular an ``POST /api/v1/feedback``. Der Eintrag landet zuerst in
der Tabelle ``feedback`` und geht danach im Hintergrund als Issue an GitHub. Antwortet GitHub
nicht, bleibt er offen und wird beim nächsten Feedback, beim nächsten Start der API und
spätestens nach ``RETRY_SECONDS`` erneut versucht (TC-109).

Datenschutz (Befragung vom 22.11.2026): Das Repo ist öffentlich. Im Issue steht deshalb kein
Name und keine E-Mail-Adresse, sondern nur eine anonyme Kennung pro Konto. E-Mail-Adressen im
Text werden entfernt, und ein Screenshot bleibt auf dem Heimserver (Skript
``python -m topstack.scripts.feedback``). Absender bekommen keinen Status zurück.
"""

from __future__ import annotations

import asyncio
import base64
import contextlib
import hashlib
import logging
import re
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from topstack.config import settings
from topstack.db.models import Feedback
from topstack.db.session import get_sessionmaker

log = logging.getLogger("topstack.feedback")

# Art → (Anzeige, Labels im Issue)
CATEGORIES: dict[str, tuple[str, list[str]]] = {
    "bug": ("Fehler", ["feedback", "bug"]),
    "wish": ("Wunsch", ["feedback", "wunsch"]),
    "other": ("Sonstiges", ["feedback"]),
}
MAX_SCREENSHOT_BYTES = 2_000_000
SCREENSHOT_TYPES = {"image/png": b"\x89PNG", "image/jpeg": b"\xff\xd8\xff", "image/webp": b"RIFF"}
RETRY_SECONDS = 30 * 60
BATCH = 20

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")


class TooMany(Exception):
    """Mehr als ``feedback_per_day`` Einträge in 24 Stunden."""


class BadScreenshot(ValueError):
    pass


# ---------------------------------------------------------------------------
# Inhalt des Issues
# ---------------------------------------------------------------------------


def anon_id(user_id: uuid.UUID | None) -> str:
    """Gleiche Kennung für alle Einträge eines Kontos, ohne Rückschluss auf Name oder Adresse."""
    if user_id is None:
        return "gelöscht"
    return hashlib.sha256(b"topstack-feedback:" + user_id.bytes).hexdigest()[:8]


def scrub(text: str) -> str:
    """E-Mail-Adressen entfernen und Code-Blöcke nicht vorzeitig schließen lassen."""
    return _EMAIL.sub("[E-Mail entfernt]", text).replace("~~~", "~ ~ ~").strip()


def device(user_agent: str) -> str:
    """Grobe Angabe wie „Android · Chrome“; der volle User-Agent steht in den Details."""
    ua = user_agent
    if "iPhone" in ua:
        system = "iPhone"
    elif "iPad" in ua:
        system = "iPad"
    elif "Android" in ua:
        system = "Android"
    elif "Windows" in ua:
        system = "Windows"
    elif "Mac OS X" in ua or "Macintosh" in ua:
        system = "Mac"
    elif "Linux" in ua:
        system = "Linux"
    else:
        system = "unbekannt"
    for marker, name in (
        ("SamsungBrowser", "Samsung Internet"),
        ("Edg/", "Edge"),
        ("Firefox/", "Firefox"),
        ("FxiOS", "Firefox"),
        ("CriOS", "Chrome"),
        ("Chrome/", "Chrome"),
        ("Safari/", "Safari"),
    ):
        if marker in ua:
            return f"{system} · {name}"
    return system


@dataclass(frozen=True)
class Issue:
    title: str
    body: str
    labels: list[str]


def render(fb: Feedback) -> Issue:
    label, labels = CATEGORIES[fb.category]
    message = scrub(fb.message)
    first_line = message.splitlines()[0] if message else ""
    title = f"Feedback ({label}): {first_line[:60]}{'…' if len(first_line) > 60 else ''}"
    version = f"v{fb.app_version}" if fb.app_version else "unbekannt"
    if fb.build:
        version += f" · Update #{fb.build}"
    lines = [
        f"**Art:** {label}  ",
        f"**Von:** Tester `{anon_id(fb.app_user_id)}` (anonym)  ",
        f"**Version:** {version}  ",
        f"**Gerät:** {device(fb.user_agent)}",
    ]
    if fb.screenshot:
        lines.append(
            f"\n**Screenshot:** liegt auf dem Heimserver, nicht hier: "
            f"`python -m topstack.scripts.feedback screenshot {fb.id}`"
        )
    lines += ["", "### Beschreibung", "", "~~~text", message, "~~~"]
    if fb.context and scrub(fb.context):
        lines += ["", "### Was wurde gerade gemacht?", "", "~~~text", scrub(fb.context), "~~~"]
    lines += [
        "",
        "<details><summary>Technische Angaben</summary>",
        "",
        f"- Feedback-ID: `{fb.id}`",
        f"- Eingegangen: {fb.created_at:%Y-%m-%d %H:%M} UTC",
        f"- User-Agent: `{fb.user_agent.replace('`', '')}`",
        "",
        "</details>",
        "",
        "_Automatisch aus dem Feedback-Button der App angelegt (AP-5)._",
    ]
    return Issue(title=title, body="\n".join(lines), labels=labels)


def decode_screenshot(data_url: str) -> tuple[bytes, str]:
    """``data:image/png;base64,…`` → Bytes und Typ; prüft Größe und Dateikopf."""
    match = re.fullmatch(r"data:(image/[a-z]+);base64,([A-Za-z0-9+/=\s]+)", data_url, re.S)
    if not match or match.group(1) not in SCREENSHOT_TYPES:
        raise BadScreenshot("Screenshot muss ein PNG-, JPEG- oder WebP-Bild sein.")
    kind = match.group(1)
    try:
        raw = base64.b64decode(match.group(2), validate=False)
    except ValueError as exc:
        raise BadScreenshot("Screenshot ist beschädigt.") from exc
    if len(raw) > MAX_SCREENSHOT_BYTES:
        raise BadScreenshot("Screenshot ist zu groß (höchstens 2 MB).")
    if not raw.startswith(SCREENSHOT_TYPES[kind]):
        raise BadScreenshot("Screenshot passt nicht zum angegebenen Bildformat.")
    return raw, kind


# ---------------------------------------------------------------------------
# Speichern
# ---------------------------------------------------------------------------


async def submit(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    category: str,
    message: str,
    context: str | None,
    app_version: str,
    build: str,
    user_agent: str,
    screenshot: tuple[bytes, str] | None,
) -> Feedback:
    since = datetime.now(UTC) - timedelta(days=1)
    recent = await db.scalar(
        select(func.count())
        .select_from(Feedback)
        .where(Feedback.app_user_id == user_id, Feedback.created_at > since)
    )
    if (recent or 0) >= settings.feedback_per_day:
        raise TooMany
    fb = Feedback(
        id=uuid.uuid4(),
        app_user_id=user_id,
        category=category,
        message=message.strip(),
        context=(context or "").strip() or None,
        app_version=app_version,
        build=build,
        user_agent=user_agent[:400],
        screenshot=screenshot[0] if screenshot else None,
        screenshot_type=screenshot[1] if screenshot else None,
    )
    db.add(fb)
    await db.flush()
    await db.refresh(fb)  # created_at aus der Datenbank
    return fb


# ---------------------------------------------------------------------------
# Weitergabe an GitHub
# ---------------------------------------------------------------------------


async def _github_create(issue: Issue) -> int:
    async with httpx.AsyncClient(timeout=15) as http:
        r = await http.post(
            f"https://api.github.com/repos/{settings.github_repo}/issues",
            headers={
                "Authorization": f"Bearer {settings.github_token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "topstack-feedback",
            },
            json={"title": issue.title, "body": issue.body, "labels": issue.labels},
        )
        r.raise_for_status()
        return int(r.json()["number"])


# Tests ersetzen ``creator`` und ``session_scope`` (wie bei Push)
creator: Callable[[Issue], Awaitable[int]] = _github_create


@contextlib.asynccontextmanager
async def _default_scope() -> AsyncIterator[AsyncSession]:
    async with get_sessionmaker()() as session:
        yield session


session_scope: Callable[[], AbstractAsyncContextManager[AsyncSession]] = _default_scope
_lock = asyncio.Lock()
_pending: set[asyncio.Task[int]] = set()


def enabled() -> bool:
    """Ohne Token bleibt alles in der Datenbank (z. B. auf Staging oder lokal)."""
    return bool(settings.github_token) or creator is not _github_create


async def deliver_pending() -> int:
    """Offene Einträge als Issue anlegen; gibt die Zahl der übertragenen zurück."""
    if not enabled():
        return 0
    sent = 0
    async with _lock, session_scope() as db:
        rows = list(
            await db.scalars(
                select(Feedback)
                .where(Feedback.sent_at.is_(None))
                .order_by(Feedback.created_at)
                .limit(BATCH)
            )
        )
        for fb in rows:
            try:
                fb.issue_number = await creator(render(fb))
                fb.sent_at = datetime.now(UTC)
                fb.last_error = None
                sent += 1
            except Exception as exc:  # GitHub nicht erreichbar, Token falsch, …
                fb.attempts += 1
                fb.last_error = f"{type(exc).__name__}: {exc}"[:500]
                log.warning("Feedback %s nicht an GitHub übertragen: %s", fb.id, fb.last_error)
            await db.commit()
            if fb.sent_at is None:
                break  # GitHub hakt: den Rest beim nächsten Versuch
    if sent:
        log.info("%d Feedback-Einträge an GitHub übertragen.", sent)
    return sent


def schedule() -> None:
    """Übertragung im Hintergrund anstoßen, ohne auf GitHub zu warten."""
    if not enabled():
        return
    task = asyncio.create_task(deliver_pending())
    _pending.add(task)
    task.add_done_callback(_pending.discard)


async def drain() -> None:
    """Auf laufende Übertragungen warten (Tests, sauberes Herunterfahren)."""
    while _pending:
        await asyncio.gather(*list(_pending), return_exceptions=True)


async def retry_loop() -> None:
    """Beim Start und danach regelmäßig offene Einträge nachschicken (läuft in der API)."""
    while True:
        try:
            await deliver_pending()
        except Exception:  # Datenbank kurz weg o. Ä.: beim nächsten Durchlauf
            log.exception("Nachschicken von Feedback fehlgeschlagen")
        await asyncio.sleep(RETRY_SECONDS)
