"""Add editable profiles, private identity documents, and profile posts."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0004_profiles"
down_revision: Union[str, None] = "0003_payments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("customer_profiles", sa.Column("bio", sa.String(length=500), nullable=True))
    op.add_column("customer_profiles", sa.Column("profile_image_data", sa.Text(), nullable=True))
    op.add_column("plumber_profiles", sa.Column("bio", sa.String(length=500), nullable=True))
    op.add_column("plumber_profiles", sa.Column("profile_image_data", sa.Text(), nullable=True))
    op.add_column("plumber_profiles", sa.Column("service_county", sa.String(length=80), nullable=True))
    op.add_column("plumber_profiles", sa.Column("service_location", sa.String(length=120), nullable=True))
    op.add_column("plumber_profiles", sa.Column("years_experience", sa.Integer(), nullable=True))
    op.add_column("plumber_profiles", sa.Column("verification_document_encrypted", sa.LargeBinary(), nullable=True))
    op.add_column("plumber_profiles", sa.Column("verification_document_mime", sa.String(length=80), nullable=True))
    op.add_column("plumber_profiles", sa.Column("verification_document_filename", sa.String(length=255), nullable=True))
    op.create_table(
        "profile_posts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("caption", sa.String(length=280), nullable=False),
        sa.Column("image_data", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_profile_posts_user_created", "profile_posts", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_profile_posts_user_created", table_name="profile_posts")
    op.drop_table("profile_posts")
    for column in (
        "verification_document_filename",
        "verification_document_mime",
        "verification_document_encrypted",
        "years_experience",
        "service_location",
        "service_county",
        "profile_image_data",
        "bio",
    ):
        op.drop_column("plumber_profiles", column)
    op.drop_column("customer_profiles", "profile_image_data")
    op.drop_column("customer_profiles", "bio")
