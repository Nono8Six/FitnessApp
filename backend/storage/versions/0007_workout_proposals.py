"""Brique 6 : métadonnées facultatives et propositions, sans recopie des tables."""
from alembic import op
import sqlalchemy as sa

revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade():
    for name, kind in [('goal', sa.String(16)), ('level', sa.String(16)), ('origin', sa.JSON())]:
        op.add_column('workout_versions', sa.Column(name, kind, nullable=True))
    op.add_column('coach_turns', sa.Column('workout_context', sa.JSON(), nullable=True))
    op.create_table('workout_proposals',
        sa.Column('id', sa.String(32), primary_key=True),
        sa.Column('profile_id', sa.String(32), sa.ForeignKey('profiles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('turn_id', sa.String(32), sa.ForeignKey('coach_turns.id', ondelete='CASCADE'), nullable=False),
        sa.Column('call_id', sa.String(200), nullable=False),
        sa.Column('workout', sa.JSON(), nullable=False),
        sa.Column('explanation', sa.String(600), nullable=False),
        sa.Column('base', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(16), nullable=False),
        sa.Column('accepted_id', sa.String(32), nullable=True),
        sa.Column('accepted_version', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.String(40), nullable=False),
        sa.UniqueConstraint('turn_id', 'call_id'),
        sa.CheckConstraint("status IN ('pending', 'accepted', 'ignored')", name='status'))
    op.create_index('ix_workout_proposals_profile_id', 'workout_proposals', ['profile_id'])
    op.create_index('ix_workout_proposals_turn_id', 'workout_proposals', ['turn_id'])


def downgrade():
    op.drop_table('workout_proposals')
    op.drop_column('coach_turns', 'workout_context')
    for name in ['origin', 'level', 'goal']:
        op.drop_column('workout_versions', name)
