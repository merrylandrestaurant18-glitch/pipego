"""Enable PostGIS for nearby plumber searches."""

from typing import Sequence, Union

from alembic import op


revision: str = "0006_enable_postgis"
down_revision: Union[str, None] = "0005_plumber_contact_services"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS postgis")


def downgrade() -> None:
    pass
