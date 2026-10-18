from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


Role = Literal["customer", "plumber", "company", "admin"]
PlumbingService = Literal[
    "Blocked drain",
    "Leaking pipe",
    "Toilet repair",
    "Water heater",
    "Tap or shower",
    "Other plumbing",
]


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=12, max_length=128)


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    role: Role
    is_active: bool
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


class ProviderApplicationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(min_length=2, max_length=120)


class ProviderDiscoveryResponse(BaseModel):
    id: UUID
    display_name: str
    bio: str | None
    profile_image_data: str | None
    service_county: str | None
    service_location: str | None
    services_offered: list[PlumbingService]
    years_experience: int | None
    distance_km: float | None
    approximate_latitude: float
    approximate_longitude: float


class NearbyPlumberResponse(BaseModel):
    id: UUID
    name: str
    rating: float
    latitude: float
    longitude: float
    meters: float
    profile_image_data: str | None = None
    bio: str | None = None
    service_location: str | None = None
    service_county: str | None = None
    years_experience: int | None = None


class ProviderLocationResponse(BaseModel):
    latitude: float | None
    longitude: float | None
    updated_at: datetime | None


class ProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, min_length=2, max_length=120)
    bio: str | None = Field(default=None, max_length=500)
    profile_image_data: str | None = Field(default=None, max_length=5_600_000)
    service_county: str | None = Field(default=None, min_length=2, max_length=80)
    service_location: str | None = Field(default=None, min_length=2, max_length=120)
    phone_number: str | None = Field(default=None, max_length=32)
    services_offered: list[PlumbingService] | None = Field(default=None, max_length=6)
    years_experience: int | None = Field(default=None, ge=0, le=70)
    verification_document_data: str | None = Field(default=None, max_length=5_600_000)
    verification_document_mime: Literal["image/jpeg", "image/png", "image/webp", "application/pdf"] | None = None
    verification_document_filename: str | None = Field(default=None, max_length=255)

    @field_validator("phone_number")
    @classmethod
    def normalize_kenyan_phone_number(cls, value: str | None) -> str | None:
        if value is None:
            return None

        compact = "".join(character for character in value if character not in " \t\r\n()-")
        if compact.startswith("+"):
            digits = compact[1:]
        else:
            digits = compact
        if not digits.isdigit():
            raise ValueError("Enter a valid Kenyan mobile number, for example 0712 345 678.")

        if digits.startswith("254"):
            national_number = digits[3:]
        elif len(digits) == 10 and digits.startswith(("07", "01")):
            national_number = digits[1:]
        elif len(digits) == 9 and digits.startswith(("7", "1")):
            national_number = digits
        else:
            raise ValueError("Enter a Kenyan mobile number such as 0712 345 678 or 0112 345 678.")

        if len(national_number) != 9 or national_number[0] not in {"1", "7"}:
            raise ValueError("Enter a valid Kenyan mobile number starting with 01 or 07.")
        return f"+254{national_number}"


class ProfileResponse(BaseModel):
    id: UUID
    role: Literal["customer", "plumber"]
    email: EmailStr
    display_name: str | None
    bio: str | None
    profile_image_data: str | None
    service_county: str | None = None
    service_location: str | None = None
    phone_number: str | None = None
    services_offered: list[PlumbingService] = Field(default_factory=list)
    years_experience: int | None = None
    verification_status: Literal["pending", "verified", "rejected", "suspended"] | None = None
    verification_document_uploaded: bool = False
    profile_complete: bool


class ProfilePostCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    caption: str = Field(default="", max_length=280)
    image_data: str = Field(min_length=1, max_length=5_600_000)


class ProfilePostResponse(BaseModel):
    id: UUID
    caption: str
    image_data: str
    created_at: datetime


class ProviderVerificationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["verified", "rejected", "suspended"]


class AdminProviderReviewResponse(BaseModel):
    id: UUID
    email: EmailStr
    display_name: str
    bio: str | None
    service_county: str | None
    service_location: str | None
    phone_number: str | None
    services_offered: list[PlumbingService] = Field(default_factory=list)
    years_experience: int | None
    verification_status: Literal["pending", "verified", "rejected", "suspended"]
    verification_document_uploaded: bool
    profile_complete: bool


class AvailabilityRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_online: bool
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class ProviderLocationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class AvailabilityResponse(BaseModel):
    is_online: bool


class BookingCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=10, max_length=2000)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    provider_id: UUID | None = None


class BookingResponse(BaseModel):
    id: UUID
    customer_id: UUID
    provider_id: UUID | None
    category: str
    description: str
    latitude: float
    longitude: float
    status: str
    offer_id: UUID | None = None
    offer_expires_at: datetime | None = None
    created_at: datetime


class BookingTransitionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    to_status: Literal["en_route", "arrived", "inspection", "in_progress", "completion_pending", "completed"]


class QuoteCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount_minor: int = Field(ge=0)
    description: str = Field(min_length=5, max_length=2000)


class QuoteResponse(BaseModel):
    id: UUID
    booking_id: UUID
    version: int
    amount_minor: int
    currency: Literal["KES"] = "KES"
    description: str
    status: str
    created_at: datetime


class PaymentWebhookRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str = Field(min_length=4, max_length=120)
    provider_reference: str = Field(min_length=4, max_length=120)
    status: Literal["paid", "failed"]
    amount_minor: int = Field(gt=0)


class PaymentResponse(BaseModel):
    id: UUID
    booking_id: UUID
    provider_reference: str
    provider: str
    amount_minor: int
    currency: Literal["KES"]
    status: str
    created_at: datetime


class EarningResponse(BaseModel):
    id: UUID
    payment_id: UUID
    amount_minor: int
    currency: Literal["KES"]
    status: str
    created_at: datetime