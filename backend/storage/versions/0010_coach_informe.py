"""Mémoire sourcée et contraintes : ajouts sans recopie des tables existantes."""
from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "0009"
branch_labels = depends_on = None


def upgrade():
    op.add_column("profiles", sa.Column("weight_updated_at", sa.String(40)))
    op.add_column("coach_turns", sa.Column("request_context", sa.JSON()))
    op.add_column("coach_turns", sa.Column("memory_reviewed_at", sa.String(40)))
    op.add_column("workout_proposals", sa.Column("constraints", sa.JSON()))
    op.add_column("coach_memories", sa.Column("status", sa.String(16), nullable=False, server_default="active"))
    op.add_column("coach_memories", sa.Column("details", sa.JSON(), nullable=False, server_default="{}"))
    op.create_index("ix_coach_memories_profile_status", "coach_memories", ["profile_id", "status"])
    op.create_table("profile_weights",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("profile_id", sa.String(32), sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("weight_kg", sa.Float()),
        sa.Column("recorded_at", sa.String(40), nullable=False))
    op.create_index("ix_profile_weights_profile_id", "profile_weights", ["profile_id"])


def downgrade():
    op.drop_table("profile_weights")
    op.drop_index("ix_coach_memories_profile_status", table_name="coach_memories")
    for table, column in (("coach_memories", "details"), ("coach_memories", "status"),
                          ("workout_proposals", "constraints"), ("coach_turns", "request_context"),
                          ("coach_turns", "memory_reviewed_at"), ("profiles", "weight_updated_at")):
        op.drop_column(table, column)
