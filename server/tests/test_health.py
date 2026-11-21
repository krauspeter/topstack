import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from topstack.main import app  # noqa: E402


def test_health():
    response = TestClient(app).get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert set(response.json()["build"]) == {"pr", "sha", "time"}


def test_health_shows_build(monkeypatch):
    monkeypatch.setenv("TOPSTACK_BUILD_PR", "118")
    monkeypatch.setenv("TOPSTACK_BUILD_SHA", "abcdef1234")
    build = TestClient(app).get("/api/v1/health").json()["build"]
    assert build["pr"] == "118" and build["sha"] == "abcdef1234"
