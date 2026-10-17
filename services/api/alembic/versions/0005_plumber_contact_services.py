"""Add plumber contact number and offered services."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0005_plumber_contact_services"
down_revision: Union[str, None] = "0004_profiles"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("plumber_profiles", sa.Column("phone_number", sa.String(length=16), nullable=True))
    op.create_unique_constraint("uq_plumber_profiles_phone_number", "plumber_profiles", ["phone_number"])
    op.add_column("plumber_profiles", sa.Column("services_offered", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("plumber_profiles", "services_offered")
    op.drop_constraint("uq_plumber_profiles_phone_number", "plumber_profiles", type_="unique")
    op.drop_column("plumber_profiles", "phone_number")
