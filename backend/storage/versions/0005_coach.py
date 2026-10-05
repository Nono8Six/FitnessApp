"""Conversations et mémoire : ajout de tables, aucune recopie des données sportives."""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("coach_conversations",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("profile_id", sa.String(32), sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
        sa.UniqueConstraint("profile_id", "id"))
    op.create_index("ix_coach_conversations_profile_id", "coach_conversations", ["profile_id"])
    op.create_table("coach_turns",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("profile_id", sa.String(32), nullable=False),
        sa.Column("conversation_id", sa.String(32), nullable=False),
        sa.Column("request_id", sa.String(36), nullable=False),
        sa.Column("user_text", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("error", sa.String(64)),
        sa.Column("model", sa.String(200)),
        sa.Column("sources", sa.JSON(), nullable=False),
        sa.Column("proposals", sa.JSON(), nullable=False),
        sa.Column("usage", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
        sa.ForeignKeyConstraint(["profile_id", "conversation_id"],
            ["coach_conversations.profile_id", "coach_conversations.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("profile_id", "request_id"),
        sa.CheckConstraint("status IN ('running', 'completed', 'interrupted', 'failed')", name="status"))
    op.create_index("uq_coach_running_profile", "coach_turns", ["profile_id"], unique=True,
                    sqlite_where=sa.text("status = 'running'"))
    op.create_index("ix_coach_turns_conversation", "coach_turns", ["conversation_id", "created_at", "id"])
    op.create_table("coach_memories",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("profile_id", sa.String(32), sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", sa.String(500), nullable=False),
        sa.Column("source_turn_id", sa.String(32), sa.ForeignKey("coach_turns.id", ondelete="SET NULL")),
        sa.Column("proposal_index", sa.Integer()),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
        sa.UniqueConstraint("profile_id", "source_turn_id", "proposal_index"))
    op.create_index("ix_coach_memories_profile_id", "coach_memories", ["profile_id"])


def downgrade():
    op.drop_table("coach_memories")
    op.drop_table("coach_turns")
    op.drop_table("coach_conversations")
