"""Add provider availability, dispatch, bookings, and quotes."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0002_marketplace"
down_revision: Union[str, None] = "0001_identity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "provider_availability",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("is_online", sa.Boolean(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("service_radius_km", sa.Integer(), nullable=False),
        sa.Column("max_active_jobs", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("latitude IS NULL OR latitude BETWEEN -90 AND 90", name="ck_availability_latitude"),
        sa.CheckConstraint("longitude IS NULL OR longitude BETWEEN -180 AND 180", name="ck_availability_longitude"),
        sa.CheckConstraint("service_radius_km > 0", name="ck_availability_radius"),
        sa.CheckConstraint("max_active_jobs > 0", name="ck_availability_capacity"),
        sa.ForeignKeyConstraint(["user_id"], ["plumber_profiles.user_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_index(
        "ix_availability_online_location",
        "provider_availability",
        ["is_online", "latitude", "longitude"],
    )

    op.create_table(
        "bookings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("provider_id", sa.Uuid(), nullable=True),
        sa.Column("category", sa.String(length=80), nullable=False),
        sa.Column("description", sa.String(length=2000), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "status IN ('requested', 'searching', 'offered', 'accepted', 'en_route', 'arrived', "
            "'inspection', 'quote_pending', 'quote_approved', 'in_progress', 'completion_pending', "
            "'completed', 'settlement_pending', 'settled', 'rejected', 'expired', 'cancelled', "
            "'no_provider_found', 'payment_failed', 'disputed', 'refund_pending', 'refunded')",
            name="ck_bookings_status",
        ),
        sa.CheckConstraint("latitude BETWEEN -90 AND 90", name="ck_bookings_latitude"),
        sa.CheckConstraint("longitude BETWEEN -180 AND 180", name="ck_bookings_longitude"),
        sa.ForeignKeyConstraint(["customer_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["provider_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_bookings_customer_created", "bookings", ["customer_id", "created_at"])
    op.create_index("ix_bookings_provider_status", "bookings", ["provider_id", "status"])

    op.create_table(
        "booking_offers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("booking_id", sa.Uuid(), nullable=False),
        sa.Column("provider_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("status IN ('offered', 'accepted', 'rejected', 'expired')", name="ck_booking_offers_status"),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["provider_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("booking_id", "provider_id", name="uq_booking_offers_booking_provider"),
    )
    op.create_index("ix_booking_offers_provider_status", "booking_offers", ["provider_id", "status"])

    op.create_table(
        "booking_status_history",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("booking_id", sa.Uuid(), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=True),
        sa.Column("actor_type", sa.String(length=16), nullable=False),
        sa.Column("from_status", sa.String(length=32), nullable=True),
        sa.Column("to_status", sa.String(length=32), nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "quotes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("booking_id", sa.Uuid(), nullable=False),
        sa.Column("provider_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("amount_minor", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=2000), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount_minor >= 0", name="ck_quotes_amount_nonnegative"),
        sa.CheckConstraint("status IN ('pending', 'approved', 'rejected', 'superseded')", name="ck_quotes_status"),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["provider_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("booking_id", "version", name="uq_quotes_booking_version"),
    )


def downgrade() -> None:
    op.drop_table("quotes")
    op.drop_table("booking_status_history")
    op.drop_index("ix_booking_offers_provider_status", table_name="booking_offers")
    op.drop_table("booking_offers")
    op.drop_index("ix_bookings_provider_status", table_name="bookings")
    op.drop_index("ix_bookings_customer_created", table_name="bookings")
    op.drop_table("bookings")
    op.drop_index("ix_availability_online_location", table_name="provider_availability")
    op.drop_table("provider_availability")