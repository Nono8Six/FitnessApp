"""Planning confirmé et proposition par semaine et profil."""
from alembic import op
import sqlalchemy as sa

revision = "0013"
down_revision = "0012"
branch_labels = depends_on = None


def upgrade():
    op.create_table(
        "training_weeks",
        sa.Column("profile_id", sa.String(32), sa.ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("week", sa.String(10), primary_key=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("plan", sa.JSON()),
        sa.Column("proposal", sa.JSON()),
    )


def downgrade():
    op.drop_table("training_weeks")
