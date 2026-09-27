"""Phase 102/104: required listing_contact_phone on assets, backfilled

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-09-27 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e3f4a5b6c7d8'
down_revision: Union[str, None] = 'd2e3f4a5b6c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable first so the backfill below can run, then locked to NOT NULL.
    op.add_column('assets', sa.Column('listing_contact_phone', sa.String(), nullable=True))

    # Phase 104: backfill every existing listing from its owning provider's
    # real account-level contact_phone. A provider with no contact_phone of
    # their own (shouldn't exist post-Phase-85, but defensively handled)
    # gets a literal placeholder so the column can still be locked NOT NULL —
    # never left silently null.
    op.execute("""
        UPDATE assets
        SET listing_contact_phone = COALESCE(
            (SELECT users.contact_phone FROM users WHERE users.id = assets.owner_id),
            'Not provided'
        )
        WHERE listing_contact_phone IS NULL
    """)

    op.alter_column('assets', 'listing_contact_phone', nullable=False)


def downgrade() -> None:
    op.drop_column('assets', 'listing_contact_phone')
