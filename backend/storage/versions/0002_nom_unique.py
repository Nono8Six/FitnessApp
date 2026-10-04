"""Profils : nom unique, sans tenir compte de la casse ASCII (le service compare aussi accents et casse Unicode).

Révision : 0002
Précédente : 0001
Créée le : 2026-10-04
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("uq_profiles_name", "profiles", [sa.text("name COLLATE NOCASE")], unique=True)


def downgrade() -> None:
    op.drop_index("uq_profiles_name", table_name="profiles")
