"""Altdaten als Importläufe (Phase 5, AP-4, ADR-0019).

Revision: 0006
Vorgänger: 0005
Erstellt: 2026-11-28
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Gleich wie in docs/schema.sql (die CI vergleicht beide)
    op.execute(
        """
        CREATE TABLE import_run (
            id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            group_id         uuid NOT NULL REFERENCES play_group(id) ON DELETE CASCADE,
            created_by       uuid REFERENCES app_user(id) ON DELETE SET NULL,
            created_at       timestamptz NOT NULL DEFAULT now(),
            source           text NOT NULL DEFAULT '',
            tournaments      int NOT NULL DEFAULT 0,
            created_players  uuid[] NOT NULL DEFAULT '{}',
            undone_at        timestamptz
        )
        """
    )
    op.execute(
        "ALTER TABLE tournament ADD COLUMN import_run_id uuid "
        "REFERENCES import_run(id) ON DELETE SET NULL"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE tournament DROP COLUMN import_run_id")
    op.execute("DROP TABLE import_run")
