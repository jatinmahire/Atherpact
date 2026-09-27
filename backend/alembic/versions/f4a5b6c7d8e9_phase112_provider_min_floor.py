"""Phase 112: required provider_min (negotiation floor) on assets

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-09-27 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f4a5b6c7d8e9'
down_revision: Union[str, None] = 'e3f4a5b6c7d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('assets', sa.Column('provider_min', sa.Float(), nullable=True))

    # Backfill every existing listing at 75% of its own asking price — the
    # same ratio the (now-locked) negotiation form used to default to,
    # disclosed here as an approximation for pre-existing data, not a real
    # provider-set value.
    op.execute("UPDATE assets SET provider_min = price_per_day * 0.75 WHERE provider_min IS NULL")

    op.alter_column('assets', 'provider_min', nullable=False)


def downgrade() -> None:
    op.drop_column('assets', 'provider_min')
