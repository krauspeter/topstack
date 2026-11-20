"""Vorgemerkte Spieler ohne Konto und an sie gebundene Einladungen (ADR-0015, AP-4).

Revision: 0003
Vorgänger: 0002
Erstellt: 2026-11-20
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Neuer Enum-Wert darf in derselben Transaktion nicht benutzt werden; das passiert hier nicht.
    op.execute("ALTER TYPE player_kind ADD VALUE 'reserved'")
    op.execute(
        "ALTER TABLE invitation ADD COLUMN player_id uuid REFERENCES player(id) ON DELETE CASCADE"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE invitation DROP COLUMN player_id")
    op.execute("DELETE FROM player WHERE kind = 'reserved'")
    # PostgreSQL kann keinen Enum-Wert entfernen: Typ neu anlegen
    op.execute("ALTER TABLE player DROP CONSTRAINT player_check")
    op.execute("ALTER TYPE player_kind RENAME TO player_kind_old")
    op.execute("CREATE TYPE player_kind AS ENUM ('member', 'guest', 'former')")
    op.execute(
        "ALTER TABLE player ALTER COLUMN kind TYPE player_kind USING kind::text::player_kind"
    )
    op.execute("DROP TYPE player_kind_old")
    op.execute(
        "ALTER TABLE player ADD CONSTRAINT player_check "
        "CHECK ((kind = 'member') = (app_user_id IS NOT NULL))"
    )
