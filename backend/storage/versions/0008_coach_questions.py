"""Questions à choix du coach, conservées avec leur réponse.

Ajout natif d'une colonne avec valeur par défaut : aucune recopie, échanges existants conservés.
"""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("coach_turns", sa.Column("questions", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))


def downgrade():
    op.drop_column("coach_turns", "questions")
