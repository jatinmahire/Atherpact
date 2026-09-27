"""Phase 92: social_signal_logs table

Revision ID: d2e3f4a5b6c7
Revises: c1a2b3d4e5f6
Create Date: 2026-09-27 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, None] = 'c1a2b3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'social_signal_logs',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('city', sa.String(), nullable=False),
        sa.Column('fetched_at', sa.DateTime(), nullable=False),
        sa.Column('combined_count', sa.Integer(), nullable=False),
        sa.Column('mastodon_count', sa.Integer(), nullable=False),
        sa.Column('gdelt_count', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('social_signal_logs')
