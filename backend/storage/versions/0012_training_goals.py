"""Un objectif actif par profil."""
from alembic import op
import sqlalchemy as sa

revision = "0012"
down_revision = "0011"
branch_labels = depends_on = None


def upgrade():
    op.create_table(
        "training_goals",
        sa.Column("profile_id", sa.String(32), sa.ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("description", sa.String(240), nullable=False),
        sa.Column("milestone", sa.String(160), nullable=False),
        sa.Column("target_date", sa.String(10)),
        sa.Column("revision", sa.Integer(), nullable=False),
    )


def downgrade():
    op.drop_table("training_goals")
