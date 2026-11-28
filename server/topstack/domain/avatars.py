"""Profilbilder (Phase 5, AP-15): Vorauswahl eigener Fantasy-Wesen oder ein eigenes Bild.

Gespeichert wird am Konto ``app_user.avatar``: der Schlüssel eines Wesens oder ``"image"`` für ein
hochgeladenes Bild. Spieler ohne Konto bekommen vom Admin nur ein Wesen (``player.avatar``).
Ohne Bild zeigt die App Initialen in den Lieblingsfarben.
"""

from __future__ import annotations

PRESETS = (
    "engel",
    "ritter",
    "einhorn",
    "sphinx",
    "krake",
    "eule",
    "zombie",
    "vampir",
    "ratte",
    "drache",
    "goblin",
    "phoenix",
    "elf",
    "baumhirte",
    "hydra",
    "golem",
)
IMAGE = "image"
IMAGE_TYPES = ("image/jpeg", "image/png", "image/webp")
MAX_IMAGE_BYTES = 300_000  # die App schickt 256 × 256 px, das sind typisch 20–60 kB


def is_preset(key: str | None) -> bool:
    return key in PRESETS


def ref(avatar: str | None, image_url: str | None) -> str | None:
    """Was die App bekommt: ``preset:<key>``, die Adresse des eigenen Bildes oder ``None``."""
    if avatar == IMAGE and image_url:
        return image_url
    if is_preset(avatar):
        return f"preset:{avatar}"
    return None
