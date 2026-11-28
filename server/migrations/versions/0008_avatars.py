"""Profilbilder: Wesen oder eigenes Bild am Konto, Wesen für Spieler ohne Konto (Phase 5, AP-15).

Revision: 0008
Vorgänger: 0007
Erstellt: 2026-11-28
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Gleich wie in docs/schema.sql (die CI vergleicht beide); avatar_url wurde nie genutzt
    op.execute(
        """
        ALTER TABLE app_user
            DROP COLUMN avatar_url,
            ADD COLUMN avatar             text,
            ADD COLUMN avatar_image       bytea,
            ADD COLUMN avatar_image_type  text,
            ADD COLUMN avatar_updated_at  timestamptz,
            ADD CONSTRAINT app_user_avatar_image_check
                CHECK ((avatar_image IS NULL) = (avatar_image_type IS NULL))
        """
    )
    op.execute("ALTER TABLE player ADD COLUMN avatar text")


def downgrade() -> None:
    op.execute("ALTER TABLE player DROP COLUMN avatar")
    op.execute(
        """
        ALTER TABLE app_user
            DROP CONSTRAINT app_user_avatar_image_check,
            DROP COLUMN avatar_updated_at,
            DROP COLUMN avatar_image_type,
            DROP COLUMN avatar_image,
            DROP COLUMN avatar,
            ADD COLUMN avatar_url text
        """
    )
