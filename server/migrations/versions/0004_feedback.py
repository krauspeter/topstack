"""Feedback aus der App, das als GitHub-Issue weitergegeben wird (Phase 4, AP-5).

Revision: 0004
Vorgänger: 0003
Erstellt: 2026-11-24
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Gleich wie in docs/schema.sql (die CI vergleicht beide)
    op.execute(
        """
        CREATE TABLE feedback (
            id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            app_user_id      uuid REFERENCES app_user(id) ON DELETE SET NULL,
            category         text NOT NULL CHECK (category IN ('bug', 'wish', 'other')),
            message          text NOT NULL,
            context          text,
            app_version      text NOT NULL DEFAULT '',
            build            text NOT NULL DEFAULT '',
            user_agent       text NOT NULL DEFAULT '',
            screenshot       bytea,
            screenshot_type  text,
            created_at       timestamptz NOT NULL DEFAULT now(),
            sent_at          timestamptz,
            issue_number     integer,
            attempts         integer NOT NULL DEFAULT 0,
            last_error       text
        )
        """
    )
    op.execute(
        "CREATE INDEX feedback_app_user_id_created_at_idx ON feedback (app_user_id, created_at)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE feedback")
