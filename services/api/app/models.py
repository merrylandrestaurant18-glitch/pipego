from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, JSON, LargeBinary, String, Text, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('customer', 'plumber', 'company', 'admin')", name="ck_users_role"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(24), nullable=False, default="customer")
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class CustomerProfile(Base):
    __tablename__ = "customer_profiles"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    display_name: Mapped[str | None] = mapped_column(String(120))
    phone_number: Mapped[str | None] = mapped_column(String(32), unique=True)
    bio: Mapped[str | None] = mapped_column(String(500))
    profile_image_data: Mapped[str | None] = mapped_column(Text)


class PlumberProfile(Base):
    __tablename__ = "plumber_profiles"
    __table_args__ = (
        CheckConstraint(
            "verification_status IN ('pending', 'verified', 'rejected', 'suspended')",
            name="ck_plumber_profiles_verification_status",
        ),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    verification_status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending")
    bio: Mapped[str | None] = mapped_column(String(500))
    profile_image_data: Mapped[str | None] = mapped_column(Text)
    service_county: Mapped[str | None] = mapped_column(String(80))
    service_location: Mapped[str | None] = mapped_column(String(120))
    years_experience: Mapped[int | None] = mapped_column(Integer)
    phone_number: Mapped[str | None] = mapped_column(String(16), unique=True)
    services_offered: Mapped[list[str] | None] = mapped_column(JSON)
    verification_document_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary)
    verification_document_mime: Mapped[str | None] = mapped_column(String(80))
    verification_document_filename: Mapped[str | None] = mapped_column(String(255))


class ProfilePost(Base):
    __tablename__ = "profile_posts"
    __table_args__ = (Index("ix_profile_posts_user_created", "user_id", "created_at"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    caption: Mapped[str] = mapped_column(String(280), nullable=False, default="")
    image_data: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    verification_status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class CompanyMember(Base):
    __tablename__ = "company_members"
    __table_args__ = (UniqueConstraint("company_id", "user_id", name="uq_company_members_company_user"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ProviderAvailability(Base):
    __tablename__ = "provider_availability"
    __table_args__ = (
        CheckConstraint("latitude IS NULL OR latitude BETWEEN -90 AND 90", name="ck_availability_latitude"),
        CheckConstraint("longitude IS NULL OR longitude BETWEEN -180 AND 180", name="ck_availability_longitude"),
        CheckConstraint("service_radius_km > 0", name="ck_availability_radius"),
        CheckConstraint("max_active_jobs > 0", name="ck_availability_capacity"),
        Index("ix_availability_online_location", "is_online", "latitude", "longitude"),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("plumber_profiles.user_id", ondelete="CASCADE"), primary_key=True)
    is_online: Mapped[bool] = mapped_column(nullable=False, default=False)
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    service_radius_km: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    max_active_jobs: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (
        CheckConstraint(
            "status IN ('requested', 'searching', 'offered', 'accepted', 'en_route', 'arrived', "
            "'inspection', 'quote_pending', 'quote_approved', 'in_progress', 'completion_pending', "
            "'completed', 'settlement_pending', 'settled', 'rejected', 'expired', 'cancelled', "
            "'no_provider_found', 'payment_failed', 'disputed', 'refund_pending', 'refunded')",
            name="ck_bookings_status",
        ),
        CheckConstraint("latitude BETWEEN -90 AND 90", name="ck_bookings_latitude"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="ck_bookings_longitude"),
        Index("ix_bookings_customer_created", "customer_id", "created_at"),
        Index("ix_bookings_provider_status", "provider_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    customer_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    provider_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str] = mapped_column(String(2000), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="requested")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class BookingOffer(Base):
    __tablename__ = "booking_offers"
    __table_args__ = (
        CheckConstraint("status IN ('offered', 'accepted', 'rejected', 'expired')", name="ck_booking_offers_status"),
        UniqueConstraint("booking_id", "provider_id", name="uq_booking_offers_booking_provider"),
        Index("ix_booking_offers_provider_status", "provider_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    booking_id: Mapped[UUID] = mapped_column(ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False)
    provider_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="offered")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class BookingStatusHistory(Base):
    __tablename__ = "booking_status_history"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    booking_id: Mapped[UUID] = mapped_column(ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False)
    actor_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    actor_type: Mapped[str] = mapped_column(String(16), nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(32))
    to_status: Mapped[str] = mapped_column(String(32), nullable=False)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Quote(Base):
    __tablename__ = "quotes"
    __table_args__ = (
        CheckConstraint("amount_minor >= 0", name="ck_quotes_amount_nonnegative"),
        CheckConstraint("status IN ('pending', 'approved', 'rejected', 'superseded')", name="ck_quotes_status"),
        UniqueConstraint("booking_id", "version", name="uq_quotes_booking_version"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    booking_id: Mapped[UUID] = mapped_column(ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False)
    provider_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(String(2000), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="ck_payments_amount_positive"),
        CheckConstraint(
            "status IN ('pending', 'authorized', 'paid', 'partially_refunded', 'refunded', 'failed', 'disputed')",
            name="ck_payments_status",
        ),
        UniqueConstraint("customer_id", "idempotency_key", name="uq_payments_customer_idempotency"),
        Index("ix_payments_booking_status", "booking_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    booking_id: Mapped[UUID] = mapped_column(ForeignKey("bookings.id", ondelete="RESTRICT"), nullable=False)
    customer_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    provider_reference: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="KES")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending")
    provider_event_id: Mapped[str | None] = mapped_column(String(120), unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class PlatformCommission(Base):
    __tablename__ = "platform_commissions"
    __table_args__ = (CheckConstraint("amount_minor >= 0", name="ck_commissions_amount_nonnegative"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    payment_id: Mapped[UUID] = mapped_column(ForeignKey("payments.id", ondelete="RESTRICT"), unique=True, nullable=False)
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="KES")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ProviderEarning(Base):
    __tablename__ = "provider_earnings"
    __table_args__ = (
        CheckConstraint("amount_minor >= 0", name="ck_provider_earnings_amount_nonnegative"),
        CheckConstraint("status IN ('held', 'payout_pending', 'paid_out', 'disputed')", name="ck_provider_earnings_status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    payment_id: Mapped[UUID] = mapped_column(ForeignKey("payments.id", ondelete="RESTRICT"), unique=True, nullable=False)
    provider_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="KES")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="held")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )