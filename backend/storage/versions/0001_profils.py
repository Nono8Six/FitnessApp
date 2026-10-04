"""Profils : nom, objectif hebdomadaire, unité de vitesse.

Révision : 0001
Précédente : aucune
Créée le : 2026-10-04
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "profiles",
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("weekly_goal", sa.Integer(), nullable=False),
        sa.Column("speed_unit", sa.String(8), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
        sa.CheckConstraint("weekly_goal BETWEEN 1 AND 14", name=op.f("ck_profiles_weekly_goal")),
        sa.CheckConstraint("speed_unit IN ('kmh', 'pace')", name=op.f("ck_profiles_speed_unit")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_profiles")),
    )


def downgrade() -> None:
    op.drop_table("profiles")
