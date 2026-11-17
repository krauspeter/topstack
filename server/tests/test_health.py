import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from topstack.main import app  # noqa: E402


def test_health():
    response = TestClient(app).get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
