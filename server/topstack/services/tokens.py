"""Zufällige Tokens für Links und Sitzungen. In der Datenbank liegt nur der SHA-256-Hash."""

import hashlib
import secrets


def new_token() -> str:
    """256 Bit Zufall, URL-sicher (43 Zeichen)."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()
