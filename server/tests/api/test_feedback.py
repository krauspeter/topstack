"""Feedback aus der App als GitHub-Issue (AP-5, TC-108 und TC-109)."""

import base64
import contextlib
import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from tests.api.helpers import is_problem
from tests.api.test_tournaments import as_user
from tests.db.factories import make_user
from topstack.config import settings
from topstack.db.models import Feedback
from topstack.services import feedback

pytestmark = pytest.mark.usefixtures("client")

PNG = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 100).decode()


@pytest.fixture
def github(monkeypatch, session):
    """Ersetzt GitHub: sammelt Issues; ``down=True`` simuliert einen Ausfall."""

    fake = SimpleNamespace(issues=[], down=False)

    async def create(issue: feedback.Issue) -> int:
        if fake.down:
            raise ConnectionError("GitHub nicht erreichbar")
        fake.issues.append(issue)
        return 100 + len(fake.issues)

    @contextlib.asynccontextmanager
    async def scope():
        yield session

    monkeypatch.setattr(feedback, "creator", create)
    monkeypatch.setattr(feedback, "session_scope", scope)
    return fake


async def send(client, **extra):
    body = {
        "category": "bug",
        "message": "Lebenspunkte springen zurück",
        "context": "Match mit zwei Handys",
        "app_version": "0.9.0",
        "build": "146",
        **extra,
    }
    r = await client.post(
        "/api/v1/feedback",
        json=body,
        headers={"User-Agent": "Mozilla/5.0 (Linux; Android 14) Chrome/131.0 Mobile Safari/537.36"},
    )
    await feedback.drain()
    return r


async def test_feedback_becomes_issue_without_personal_data(client, session, github):
    """TC-108: Issue mit Labels, ohne Name und ohne E-Mail-Adresse."""
    user = await make_user(session, "Anna Beispiel")
    await as_user(client, session, user)
    r = await send(client, message="Absturz, schreibt mir an anna@example.org", screenshot=PNG)
    assert r.status_code == 201, r.text

    assert len(github.issues) == 1
    issue = github.issues[0]
    assert issue.labels == ["feedback", "bug"]
    assert issue.title.startswith("Feedback (Fehler): Absturz")
    assert "Anna" not in issue.body and user.email not in issue.body
    assert "anna@example.org" not in issue.body and "[E-Mail entfernt]" in issue.body
    assert feedback.anon_id(user.id) in issue.body
    assert "v0.9.0 · Update #146" in issue.body
    assert "Android · Chrome" in issue.body
    assert "Match mit zwei Handys" in issue.body
    assert "liegt auf dem Heimserver" in issue.body  # Bild selbst nie im Issue

    fb = await session.get(Feedback, uuid.UUID(r.json()["id"]))
    assert fb.issue_number == 101 and fb.sent_at is not None
    assert fb.screenshot.startswith(b"\x89PNG") and fb.screenshot_type == "image/png"


async def test_categories_and_labels(client, session, github):
    await as_user(client, session, await make_user(session))
    assert (await send(client, category="wish")).status_code == 201
    assert (await send(client, category="other")).status_code == 201
    assert [i.labels for i in github.issues] == [["feedback", "wunsch"], ["feedback"]]


async def test_beta_feedback_is_marked(client, session, github, monkeypatch):
    """Auf Staging: Label „beta“, „[Beta]“ im Titel, Umgebung im Text (28.11.2026)."""
    monkeypatch.setattr(settings, "environment", "staging")
    await as_user(client, session, await make_user(session))
    assert (await send(client, category="bug", message="Tabelle springt")).status_code == 201
    [issue] = github.issues
    assert issue.labels == ["feedback", "bug", "beta"]
    assert issue.title.startswith("[Beta] Feedback (Fehler): Tabelle springt")
    assert "**Umgebung:** Beta" in issue.body


async def test_github_down_keeps_entry_and_sends_later(client, session, github):
    """TC-109: Ohne GitHub bleibt der Eintrag in der Datenbank und geht später raus."""
    await as_user(client, session, await make_user(session))
    github.down = True
    r = await send(client)
    assert r.status_code == 201  # der Nutzer merkt nichts
    fb = await session.get(Feedback, uuid.UUID(r.json()["id"]))
    assert fb.sent_at is None and fb.attempts == 1 and "nicht erreichbar" in fb.last_error

    github.down = False
    assert await feedback.deliver_pending() == 1
    await session.refresh(fb)
    assert fb.sent_at is not None and fb.issue_number == 101 and fb.last_error is None
    assert await feedback.deliver_pending() == 0  # kein zweites Issue


async def test_without_token_feedback_stays_in_database(client, session, monkeypatch):
    """Staging und lokal: kein Token, nichts geht an GitHub."""
    monkeypatch.setattr(settings, "github_token", None)
    await as_user(client, session, await make_user(session))
    r = await send(client)
    assert r.status_code == 201
    assert not feedback.enabled()
    fb = await session.get(Feedback, uuid.UUID(r.json()["id"]))
    assert fb.sent_at is None and fb.attempts == 0


async def test_requires_sign_in(client, github):
    client.cookies.clear()
    assert is_problem(await send(client), 401)
    assert github.issues == []


async def test_limit_per_day(client, session, github, monkeypatch):
    monkeypatch.setattr(settings, "feedback_per_day", 2)
    await as_user(client, session, await make_user(session))
    assert (await send(client)).status_code == 201
    assert (await send(client)).status_code == 201
    assert is_problem(await send(client), 429)
    # ein anderes Konto ist davon nicht betroffen
    await as_user(client, session, await make_user(session))
    assert (await send(client)).status_code == 201


@pytest.mark.parametrize(
    "shot",
    [
        "data:image/gif;base64,R0lGODlh",  # Format nicht erlaubt
        "data:image/png;base64," + base64.b64encode(b"kein Bild").decode(),  # falscher Kopf
        "https://example.org/bild.png",
    ],
)
async def test_bad_screenshot_rejected(client, session, github, shot):
    await as_user(client, session, await make_user(session))
    assert is_problem(await send(client, screenshot=shot), 422)
    assert await session.scalar(select(Feedback.id).limit(1)) is None


async def test_text_cannot_break_out_of_code_block(client, session, github):
    await as_user(client, session, await make_user(session))
    await send(client, message="Text\n~~~\n@krauspeter **fett**")
    body = github.issues[0].body
    assert body.count("~~~") == 4  # Beschreibung und Kontext, je Anfang und Ende


def test_device_names():
    iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Safari/604.1"
    assert feedback.device(iphone) == "iPhone · Safari"
    assert feedback.device("Mozilla/5.0 (Windows NT 10.0) Chrome/131 Edg/131") == "Windows · Edge"
    assert feedback.device("") == "unbekannt"
