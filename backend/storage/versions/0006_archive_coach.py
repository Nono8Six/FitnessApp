"""Archivage des conversations du coach.

Ajout natif d'une colonne facultative : aucune recopie de table, échanges conservés.
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("coach_conversations", sa.Column("archived_at", sa.String(40), nullable=True))


def downgrade():
    op.drop_column("coach_conversations", "archived_at")
