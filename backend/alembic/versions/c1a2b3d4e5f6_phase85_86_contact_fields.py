"""Phase 85/86: contact_phone on users, owner_display_name on assets

Revision ID: c1a2b3d4e5f6
Revises: b9bf44bb164d
Create Date: 2026-09-27 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c1a2b3d4e5f6'
down_revision: Union[str, None] = 'b9bf44bb164d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('contact_phone', sa.String(), nullable=True))
    op.add_column('assets', sa.Column('owner_display_name', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('assets', 'owner_display_name')
    op.drop_column('users', 'contact_phone')
