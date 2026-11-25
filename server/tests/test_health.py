import asyncio

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("sqlalchemy")
from fastapi.testclient import TestClient  # noqa: E402

from topstack import main  # noqa: E402
from topstack.db.session import get_session  # noqa: E402
from topstack.main import app  # noqa: E402


class FakeSession:
    """Ersetzt die Datenbanksitzung: liefert eine Alembic-Version oder scheitert."""

    def __init__(
        self, result: str | None = "0007", error: Exception | None = None, delay: float = 0
    ):
        self.result, self.error, self.delay = result, error, delay

    async def scalar(self, _statement):
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.error:
            raise self.error
        return self.result


@pytest.fixture
def client_with(monkeypatch):
    def make(session: FakeSession) -> TestClient:
        async def override():
            yield session

        app.dependency_overrides[get_session] = override
        return TestClient(app)

    yield make
    app.dependency_overrides.pop(get_session, None)


def test_health(client_with):
    response = client_with(FakeSession()).get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == {"status": "ok", "migration": "0007"}
    assert set(body["build"]) == {"pr", "sha", "time"}


def test_health_shows_build(client_with, monkeypatch):
    monkeypatch.setenv("TOPSTACK_BUILD_PR", "118")
    monkeypatch.setenv("TOPSTACK_BUILD_SHA", "abcdef1234")
    build = client_with(FakeSession()).get("/api/v1/health").json()["build"]
    assert build["pr"] == "118" and build["sha"] == "abcdef1234"


def test_health_without_database_is_503(client_with):
    response = client_with(FakeSession(error=ConnectionRefusedError())).get("/api/v1/health")
    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "error"
    assert body["database"] == {"status": "error", "migration": None}
    assert "build" in body  # Version bleibt sichtbar, auch wenn die Datenbank fehlt


def test_health_with_hanging_database_is_503(client_with, monkeypatch):
    monkeypatch.setattr(main, "DB_CHECK_TIMEOUT", 0.05)
    response = client_with(FakeSession(delay=1)).get("/api/v1/health")
    assert response.status_code == 503
    assert response.json()["database"]["status"] == "error"


def test_return_redirects_to_the_app():
    with TestClient(app) as client:
        r = client.get("/api/v1/return", follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/"


@pytest.mark.parametrize(
    ("next_", "target"),
    [
        ("/anmelden?token=abc", "/anmelden?token=abc"),
        ("//evil.example", "/"),
        ("https://evil.example", "/"),
        ("/\\evil.example", "/"),
    ],
)
def test_return_only_to_own_pages(next_, target):
    with TestClient(app) as client:
        r = client.get("/api/v1/return", params={"next": next_}, follow_redirects=False)
    assert r.headers["location"] == target
