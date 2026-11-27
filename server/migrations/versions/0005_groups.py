"""Mehrere Gruppen: archivieren, löschen, Regeln ab nächster Saison, Gruppenbild (Phase 5, AP-1).

Revision: 0005
Vorgänger: 0004
Erstellt: 2026-11-28
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Gleich wie in docs/schema.sql (die CI vergleicht beide), ADR-0018
    op.execute(
        """
        ALTER TABLE play_group
            ADD COLUMN archived_at   timestamptz,
            ADD COLUMN deleted_at    timestamptz,
            ADD COLUMN pending_rules jsonb,
            ADD COLUMN image         bytea,
            ADD COLUMN image_type    text,
            ADD CONSTRAINT play_group_image_check
                CHECK ((image IS NULL) = (image_type IS NULL))
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE play_group
            DROP CONSTRAINT play_group_image_check,
            DROP COLUMN image_type,
            DROP COLUMN image,
            DROP COLUMN pending_rules,
            DROP COLUMN deleted_at,
            DROP COLUMN archived_at
        """
    )
