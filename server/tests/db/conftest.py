"""Ohne Datenbank-Bibliotheken (z. B. lokal ohne venv) diese Tests überspringen."""

import pytest

pytest.importorskip("sqlalchemy")
pytest.importorskip("asyncpg")
pytest.importorskip("httpx")
