"""Poids facultatif pour les estimations de séances.

Ajout natif de colonne : ne pas recopier profiles, parent de cascades SQLite.
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("profiles", sa.Column("weight_kg", sa.Float(), sa.CheckConstraint(
        "weight_kg BETWEEN 20 AND 300", name=op.f("ck_profiles_weight_kg")), nullable=True))


def downgrade():
    op.drop_column("profiles", "weight_kg")
