"""Bilans et journal durable : ajout de tables, sans recopie des données existantes."""
from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("recorded_sessions",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("profile_id", sa.String(32), sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mode", sa.String(16), nullable=False),
        sa.Column("started_at", sa.String(40), nullable=False),
        sa.Column("closed_at", sa.String(40)),
        sa.Column("profile_snapshot", sa.JSON(), nullable=False),
        sa.Column("workout_snapshot", sa.JSON(), nullable=False),
        sa.Column("calculation_version", sa.String(40), nullable=False),
        sa.Column("checkpoint", sa.JSON(), nullable=False),
        sa.Column("persisted_at", sa.String(40), nullable=False),
        sa.Column("persisted_seq", sa.Integer(), nullable=False),
        sa.Column("lost_entries", sa.Integer(), nullable=False),
        sa.Column("feeling", sa.Integer()),
        sa.Column("feeling_updated_at", sa.String(40)),
        sa.CheckConstraint("feeling BETWEEN 1 AND 10", name="ck_recorded_sessions_feeling"),
        sa.CheckConstraint("mode IN ('reel', 'simulation')", name="ck_recorded_sessions_mode"))
    op.create_index("ix_recorded_sessions_profile_date", "recorded_sessions", ["profile_id", "started_at", "id"])
    op.create_table("recorded_entries",
        sa.Column("session_id", sa.String(32), sa.ForeignKey("recorded_sessions.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("seq", sa.Integer(), primary_key=True),
        sa.Column("at", sa.String(40), nullable=False),
        sa.Column("t", sa.Float(), nullable=False),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("source", sa.String(24), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False))


def downgrade():
    op.drop_table("recorded_entries")
    op.drop_table("recorded_sessions")
