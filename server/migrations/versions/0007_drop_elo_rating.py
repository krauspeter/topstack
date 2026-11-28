"""Elo wird berechnet, nicht gespeichert: Tabelle elo_rating entfällt (Phase 5, AP-5, ADR-0019).

Revision: 0007
Vorgänger: 0006
Erstellt: 2026-11-28
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("DROP TABLE elo_rating")


def downgrade() -> None:
    op.execute(
        """
        CREATE TABLE elo_rating (
            player_id   uuid NOT NULL REFERENCES player(id) ON DELETE CASCADE,
            scope       text NOT NULL CHECK (scope IN ('group', 'global')),
            rating      numeric(7,2) NOT NULL DEFAULT 1000,
            matches     int NOT NULL DEFAULT 0,
            updated_at  timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (player_id, scope)
        )
        """
    )
