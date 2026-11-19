"""Tabelle für Passkey-Challenges (AP-3).

Revision: 0002
Vorgänger: 0001
Erstellt: 2026-11-19

Eine Challenge muss serverseitig liegen, sonst ließe sich eine mitgeschnittene
Passkey-Anmeldung mit einer selbst gesetzten Challenge wiederholen.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE webauthn_challenge (
            id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            purpose      text NOT NULL CHECK (purpose IN ('register', 'login')),
            challenge    bytea NOT NULL,
            app_user_id  uuid REFERENCES app_user(id) ON DELETE CASCADE,
            expires_at   timestamptz NOT NULL
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE webauthn_challenge")
