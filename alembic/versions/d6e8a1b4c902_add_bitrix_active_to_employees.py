"""track whether an employee is active in Bitrix24

Revision ID: d6e8a1b4c902
Revises: c1a4b2d8e7f9
"""

from alembic import op
import sqlalchemy as sa


revision = "d6e8a1b4c902"
down_revision = "c1a4b2d8e7f9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "employees",
        sa.Column("bitrix_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("employees", "bitrix_active")
