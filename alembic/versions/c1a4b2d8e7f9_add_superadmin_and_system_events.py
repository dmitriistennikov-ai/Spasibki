"""add superadmin flag and system events audit log

Revision ID: c1a4b2d8e7f9
Revises: 9c3d7f6d3d0e
Create Date: 2026-02-26 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c1a4b2d8e7f9"
down_revision: Union[str, Sequence[str], None] = "9c3d7f6d3d0e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "employees",
        sa.Column("is_superadmin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.create_table(
        "system_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("actor_bitrix_id", sa.Integer(), nullable=True),
        sa.Column("actor_name_snapshot", sa.String(length=255), nullable=False),
        sa.Column("target_type", sa.String(length=32), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=True),
        sa.Column("target_name_snapshot", sa.String(length=255), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_system_events_id"), "system_events", ["id"], unique=False)
    op.create_index(op.f("ix_system_events_event_type"), "system_events", ["event_type"], unique=False)
    op.create_index(op.f("ix_system_events_actor_bitrix_id"), "system_events", ["actor_bitrix_id"], unique=False)
    op.create_index(op.f("ix_system_events_target_type"), "system_events", ["target_type"], unique=False)
    op.create_index(op.f("ix_system_events_target_id"), "system_events", ["target_id"], unique=False)
    op.create_index(op.f("ix_system_events_created_at"), "system_events", ["created_at"], unique=False)

    op.alter_column("employees", "is_superadmin", server_default=None)


def downgrade() -> None:
    op.drop_index(op.f("ix_system_events_created_at"), table_name="system_events")
    op.drop_index(op.f("ix_system_events_target_id"), table_name="system_events")
    op.drop_index(op.f("ix_system_events_target_type"), table_name="system_events")
    op.drop_index(op.f("ix_system_events_actor_bitrix_id"), table_name="system_events")
    op.drop_index(op.f("ix_system_events_event_type"), table_name="system_events")
    op.drop_index(op.f("ix_system_events_id"), table_name="system_events")
    op.drop_table("system_events")

    op.drop_column("employees", "is_superadmin")

