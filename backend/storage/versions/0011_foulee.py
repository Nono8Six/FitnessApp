"""Conserver dans le bilan la dernière version confirmée par Foulée."""
from alembic import op
import sqlalchemy as sa

revision = "0011"
down_revision = "0010"
branch_labels = depends_on = None


def upgrade():
    op.add_column("recorded_sessions", sa.Column("foulee_sent_revision", sa.String(40)))


def downgrade():
    op.drop_column("recorded_sessions", "foulee_sent_revision")
