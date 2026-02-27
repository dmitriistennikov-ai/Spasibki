"""add game participants table

Revision ID: 9c3d7f6d3d0e
Revises: f7f903c3f547
Create Date: 2026-02-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9c3d7f6d3d0e"
down_revision: Union[str, Sequence[str], None] = "f7f903c3f547"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "game_participants",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("game_id", sa.Integer(), nullable=False),
        sa.Column("employee_bitrix_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["employee_bitrix_id"], ["employees.bitrix_id"]),
        sa.ForeignKeyConstraint(["game_id"], ["games.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("game_id", "employee_bitrix_id", name="uq_game_participants_game_employee"),
    )
    op.create_index(op.f("ix_game_participants_id"), "game_participants", ["id"], unique=False)
    op.create_index(op.f("ix_game_participants_game_id"), "game_participants", ["game_id"], unique=False)
    op.create_index(
        op.f("ix_game_participants_employee_bitrix_id"),
        "game_participants",
        ["employee_bitrix_id"],
        unique=False,
    )
    op.create_index(
        "ix_game_participants_game_employee",
        "game_participants",
        ["game_id", "employee_bitrix_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_game_participants_game_employee", table_name="game_participants")
    op.drop_index(op.f("ix_game_participants_employee_bitrix_id"), table_name="game_participants")
    op.drop_index(op.f("ix_game_participants_game_id"), table_name="game_participants")
    op.drop_index(op.f("ix_game_participants_id"), table_name="game_participants")
    op.drop_table("game_participants")
