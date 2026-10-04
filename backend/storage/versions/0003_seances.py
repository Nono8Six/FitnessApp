"""Séances versionnées et choix de la prochaine séance par profil."""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("workouts",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("profile_id", sa.String(32), sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.UniqueConstraint("profile_id", "id"))
    op.create_index("ix_workouts_profile_id", "workouts", ["profile_id"])
    op.create_table("workout_versions",
        sa.Column("workout_id", sa.String(32), sa.ForeignKey("workouts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("version", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("author", sa.String(16), nullable=False),
        sa.Column("author_name", sa.String(64), nullable=False),
        sa.Column("items", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.CheckConstraint("version >= 1", name="version"),
        sa.CheckConstraint("author IN ('human', 'chatgpt')", name="author"))
    op.create_table("workout_selections",
        sa.Column("profile_id", sa.String(32), sa.ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("workout_id", sa.String(32), nullable=False),
        sa.ForeignKeyConstraint(["profile_id", "workout_id"], ["workouts.profile_id", "workouts.id"], ondelete="CASCADE"))


def downgrade() -> None:
    op.drop_table("workout_selections")
    op.drop_table("workout_versions")
    op.drop_index("ix_workouts_profile_id", table_name="workouts")
    op.drop_table("workouts")
