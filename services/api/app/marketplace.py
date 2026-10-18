import math
import os
from datetime import datetime, timedelta, timezone
from typing import Annotated, Callable
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.models import (
    Booking,
    BookingOffer,
    BookingStatusHistory,
    Payment,
    PlatformCommission,
    PlumberProfile,
    ProviderEarning,
    ProviderAvailability,
    Quote,
    User,
)
from app.schemas import (
    AvailabilityRequest,
    AvailabilityResponse,
    AdminProviderReviewResponse,
    BookingCreateRequest,
    BookingResponse,
    BookingTransitionRequest,
    ProviderLocationResponse,
    ProviderLocationRequest,
    ProviderApplicationRequest,
    ProviderDiscoveryResponse,
    ProviderVerificationRequest,
    NearbyPlumberResponse,
    QuoteCreateRequest,
    QuoteResponse,
)


ACTIVE_STATUSES = (
    "accepted",
    "en_route",
    "arrived",
    "inspection",
    "quote_pending",
    "quote_approved",
    "in_progress",
    "completion_pending",
)
OFFER_SECONDS = 45
SEARCH_RADIUS_KM = float(os.getenv("DISPATCH_RADIUS_KM", "20"))
LOCATION_STALE_SECONDS = 90


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_km = 6371.0
    latitude_delta = math.radians(lat2 - lat1)
    longitude_delta = math.radians(lon2 - lon1)
    haversine = (
        math.sin(latitude_delta / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(longitude_delta / 2) ** 2
    )
    return 2 * earth_radius_km * math.asin(math.sqrt(haversine))


def create_marketplace_router(
    get_session: Callable,
    current_user: Callable,
    require_roles: Callable,
) -> APIRouter:
    router = APIRouter(prefix="/api/v1")

    @router.get("/plumbers/nearby", response_model=list[NearbyPlumberResponse])
    def nearby_plumbers(
        session: Annotated[Session, Depends(get_session)],
        lat: Annotated[float, Query(ge=-90, le=90)],
        lng: Annotated[float, Query(ge=-180, le=180)],
        radius: Annotated[float, Query(ge=1, le=50_000)] = 5_000,
    ) -> list[NearbyPlumberResponse]:
        fresh_after = datetime.now(timezone.utc) - timedelta(minutes=2)
        if session.get_bind().dialect.name == "postgresql":
            statement = text(
                """
                SELECT u.id,
                       p.display_name AS name,
                       0.0::double precision AS rating,
                       a.latitude,
                       a.longitude,
                       p.profile_image_data,
                       p.bio,
                       p.service_location,
                       p.service_county,
                       p.years_experience,
                       ST_Distance(
                           ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326)::geography,
                           ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
                       ) AS meters
                FROM users AS u
                JOIN plumber_profiles AS p ON p.user_id = u.id
                JOIN provider_availability AS a ON a.user_id = u.id
                WHERE u.is_active IS TRUE
                  AND p.verification_status = 'verified'
                  AND a.is_online IS TRUE
                  AND a.updated_at > :fresh_after
                  AND a.latitude IS NOT NULL
                  AND a.longitude IS NOT NULL
                  AND ST_DWithin(
                      ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326)::geography,
                      ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                      :radius
                  )
                ORDER BY meters ASC
                LIMIT 20
                """
            )
            parameters = {"lat": lat, "lng": lng, "radius": radius, "fresh_after": fresh_after}
            try:
                rows = session.execute(statement, parameters).mappings().all()
            except OperationalError:
                session.rollback()
                rows = session.execute(statement, parameters).mappings().all()
            return [
                NearbyPlumberResponse(
                    id=row["id"],
                    name=row["name"],
                    rating=row["rating"],
                    latitude=row["latitude"],
                    longitude=row["longitude"],
                    meters=row["meters"],
                    profile_image_data=row["profile_image_data"],
                    bio=row["bio"],
                    service_location=row["service_location"],
                    service_county=row["service_county"],
                    years_experience=row["years_experience"],
                )
                for row in rows
            ]

        providers = session.execute(
            select(User, PlumberProfile, ProviderAvailability)
            .join(PlumberProfile, PlumberProfile.user_id == User.id)
            .join(ProviderAvailability, ProviderAvailability.user_id == User.id)
            .where(
                User.is_active.is_(True),
                PlumberProfile.verification_status == "verified",
                ProviderAvailability.is_online.is_(True),
                ProviderAvailability.updated_at > fresh_after,
                ProviderAvailability.latitude.is_not(None),
                ProviderAvailability.longitude.is_not(None),
            )
        ).all()
        nearby: list[NearbyPlumberResponse] = []
        for user, profile, availability in providers:
            meters = distance_km(lat, lng, availability.latitude, availability.longitude) * 1000
            if meters <= radius:
                nearby.append(
                    NearbyPlumberResponse(
                        id=user.id,
                        name=profile.display_name,
                        rating=0.0,
                        latitude=availability.latitude,
                        longitude=availability.longitude,
                        meters=meters,
                        profile_image_data=profile.profile_image_data,
                        bio=profile.bio,
                        service_location=profile.service_location,
                        service_county=profile.service_county,
                        years_experience=profile.years_experience,
                    )
                )
        nearby.sort(key=lambda plumber: plumber.meters)
        return nearby[:20]

    @router.get("/providers/discover", response_model=list[ProviderDiscoveryResponse])
    def discover_providers(
        session: Annotated[Session, Depends(get_session)],
        latitude: Annotated[float | None, Query(ge=-90, le=90)] = None,
        longitude: Annotated[float | None, Query(ge=-180, le=180)] = None,
    ) -> list[ProviderDiscoveryResponse]:
        if (latitude is None) != (longitude is None):
            raise HTTPException(status_code=422, detail="Provide both latitude and longitude.")

        providers = session.execute(
            select(User, PlumberProfile, ProviderAvailability)
            .join(PlumberProfile, PlumberProfile.user_id == User.id)
            .join(ProviderAvailability, ProviderAvailability.user_id == User.id)
            .where(
                User.is_active.is_(True),
                ProviderAvailability.is_online.is_(True),
                ProviderAvailability.updated_at >= datetime.now(timezone.utc) - timedelta(seconds=LOCATION_STALE_SECONDS),
                PlumberProfile.verification_status == "verified",
            )
        ).all()

        discovered: list[tuple[float, datetime, ProviderDiscoveryResponse]] = []
        for user, profile, availability in providers:
            if availability.latitude is None or availability.longitude is None:
                continue
            distance = None
            if latitude is not None and longitude is not None:
                distance = distance_km(
                    latitude,
                    longitude,
                    availability.latitude,
                    availability.longitude,
                )
                if distance > min(SEARCH_RADIUS_KM, availability.service_radius_km):
                    continue

            discovered.append(
                (
                    distance if distance is not None else float("inf"),
                    user.created_at,
                    ProviderDiscoveryResponse(
                        id=user.id,
                        display_name=profile.display_name,
                        bio=profile.bio,
                        profile_image_data=profile.profile_image_data,
                        service_county=profile.service_county,
                        service_location=profile.service_location,
                        services_offered=profile.services_offered or [],
                        years_experience=profile.years_experience,
                        distance_km=round(distance, 1) if distance is not None else None,
                        approximate_latitude=round(availability.latitude, 3),
                        approximate_longitude=round(availability.longitude, 3),
                    ),
                )
            )

        if latitude is not None:
            discovered.sort(key=lambda item: item[0])
        else:
            discovered.sort(key=lambda item: item[1], reverse=True)
        return [provider for _, _, provider in discovered[:12]]

    def record_status(
        session: Session,
        booking: Booking,
        to_status: str,
        actor: User | None,
        actor_type: str,
    ) -> None:
        previous_status = booking.status
        booking.status = to_status
        booking.updated_at = datetime.now(timezone.utc)
        session.add(
            BookingStatusHistory(
                booking_id=booking.id,
                actor_id=actor.id if actor else None,
                actor_type=actor_type,
                from_status=previous_status,
                to_status=to_status,
            )
        )

    def booking_response(session: Session, booking: Booking) -> BookingResponse:
        active_offer = session.scalar(
            select(BookingOffer).where(
                BookingOffer.booking_id == booking.id,
                BookingOffer.status == "offered",
            )
        )
        return BookingResponse(
            id=booking.id,
            customer_id=booking.customer_id,
            provider_id=booking.provider_id,
            category=booking.category,
            description=booking.description,
            latitude=booking.latitude,
            longitude=booking.longitude,
            status=booking.status,
            offer_id=active_offer.id if active_offer else None,
            offer_expires_at=active_offer.expires_at if active_offer else None,
            created_at=booking.created_at,
        )

    def dispatch(
        session: Session,
        booking: Booking,
        actor: User,
        requested_provider_id: UUID | None = None,
    ) -> None:
        record_status(session, booking, "searching", actor, "system")
        latitude_delta = SEARCH_RADIUS_KM / 110.574
        cosine = max(abs(math.cos(math.radians(booking.latitude))), 0.01)
        longitude_delta = min(180.0, SEARCH_RADIUS_KM / (111.320 * cosine))
        candidate_query = (
            select(ProviderAvailability, PlumberProfile)
            .join(PlumberProfile, PlumberProfile.user_id == ProviderAvailability.user_id)
            .where(
                ProviderAvailability.is_online.is_(True),
                ProviderAvailability.latitude.is_not(None),
                ProviderAvailability.longitude.is_not(None),
                ProviderAvailability.latitude.between(
                    booking.latitude - latitude_delta, booking.latitude + latitude_delta
                ),
                ProviderAvailability.longitude.between(
                    booking.longitude - longitude_delta, booking.longitude + longitude_delta
                ),
                PlumberProfile.verification_status == "verified",
            )
        )
        if requested_provider_id is not None:
            candidate_query = candidate_query.join(User, User.id == ProviderAvailability.user_id).where(
                User.is_active.is_(True),
                ProviderAvailability.user_id == requested_provider_id,
                ProviderAvailability.updated_at > datetime.now(timezone.utc) - timedelta(minutes=2),
            )
        candidates = session.execute(candidate_query).all()

        ranked: list[tuple[float, ProviderAvailability]] = []
        for availability, _ in candidates:
            provider_id = availability.user_id
            assigned_count = session.scalar(
                select(func.count(Booking.id)).where(
                    Booking.provider_id == provider_id,
                    Booking.status.in_(ACTIVE_STATUSES),
                )
            ) or 0
            if assigned_count >= availability.max_active_jobs:
                continue
            distance = distance_km(
                booking.latitude,
                booking.longitude,
                availability.latitude,
                availability.longitude,
            )
            if distance > min(SEARCH_RADIUS_KM, availability.service_radius_km):
                continue
            previously_offered = session.scalar(
                select(BookingOffer.id).where(
                    BookingOffer.booking_id == booking.id,
                    BookingOffer.provider_id == provider_id,
                )
            )
            if previously_offered is None:
                ranked.append((distance, availability))

        if not ranked:
            record_status(session, booking, "no_provider_found", None, "system")
            return

        _, provider = min(ranked, key=lambda candidate: candidate[0])
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=OFFER_SECONDS)
        offer = BookingOffer(booking_id=booking.id, provider_id=provider.user_id, expires_at=expires_at)
        session.add(offer)
        session.flush()
        record_status(session, booking, "offered", None, "system")

    @router.post("/providers/me/apply", status_code=status.HTTP_201_CREATED)
    def apply_as_provider(
        payload: ProviderApplicationRequest,
        user: Annotated[User, Depends(require_roles("customer"))],
        session: Annotated[Session, Depends(get_session)],
    ) -> dict[str, str]:
        user.role = "plumber"
        session.add(PlumberProfile(user_id=user.id, display_name=payload.display_name))
        session.commit()
        return {
            "status": "pending",
            "message": "Complete all required profile details and upload your identity document to activate your plumber account automatically.",
        }

    @router.patch("/admin/providers/{provider_id}/verification")
    def review_provider(
        provider_id: UUID,
        payload: ProviderVerificationRequest,
        _: Annotated[User, Depends(require_roles("admin"))],
        session: Annotated[Session, Depends(get_session)],
    ) -> dict[str, str]:
        profile = session.get(PlumberProfile, provider_id)
        if profile is None:
            raise HTTPException(status_code=404, detail="Provider application not found")
        if payload.status == "verified" and not all(
            (
                profile.display_name,
                profile.bio,
                profile.profile_image_data,
                profile.service_county,
                profile.service_location,
                profile.phone_number,
                profile.services_offered,
                profile.years_experience is not None,
                profile.verification_document_encrypted is not None,
            )
        ):
            raise HTTPException(
                status_code=409,
                detail="Complete the plumber profile and upload an identity document before verification",
            )
        profile.verification_status = payload.status
        session.commit()
        return {"status": profile.verification_status}

    @router.get("/admin/providers/pending", response_model=list[AdminProviderReviewResponse])
    def list_pending_providers(
        _: Annotated[User, Depends(require_roles("admin"))],
        session: Annotated[Session, Depends(get_session)],
    ) -> list[AdminProviderReviewResponse]:
        providers = session.execute(
            select(User, PlumberProfile)
            .join(PlumberProfile, PlumberProfile.user_id == User.id)
            .where(User.is_active.is_(True), PlumberProfile.verification_status == "pending")
            .order_by(User.created_at.asc())
        ).all()
        return [
            AdminProviderReviewResponse(
                id=user.id,
                email=user.email,
                display_name=profile.display_name,
                bio=profile.bio,
                service_county=profile.service_county,
                service_location=profile.service_location,
                phone_number=profile.phone_number,
                services_offered=profile.services_offered or [],
                years_experience=profile.years_experience,
                verification_status=profile.verification_status,
                verification_document_uploaded=profile.verification_document_encrypted is not None,
                profile_complete=all(
                    (
                        profile.display_name,
                        profile.bio,
                        profile.profile_image_data,
                        profile.service_county,
                        profile.service_location,
                        profile.phone_number,
                        profile.services_offered,
                        profile.years_experience is not None,
                        profile.verification_document_encrypted is not None,
                    )
                ),
            )
            for user, profile in providers
        ]

    @router.get("/providers/me/availability", response_model=AvailabilityResponse)
    def get_availability(
        user: Annotated[User, Depends(require_roles("plumber"))],
        session: Annotated[Session, Depends(get_session)],
    ) -> AvailabilityResponse:
        availability = session.get(ProviderAvailability, user.id)
        return AvailabilityResponse(is_online=bool(availability and availability.is_online))

    @router.put("/providers/me/availability")
    def set_availability(
        payload: AvailabilityRequest,
        user: Annotated[User, Depends(require_roles("plumber"))],
        session: Annotated[Session, Depends(get_session)],
    ) -> dict[str, str | bool]:
        profile = session.get(PlumberProfile, user.id)
        if profile is None or profile.verification_status != "verified":
            raise HTTPException(status_code=403, detail="Provider verification is required to go online")
        if payload.is_online and (payload.latitude is None or payload.longitude is None):
            raise HTTPException(status_code=422, detail="Online providers must share a current location")
        availability = session.get(ProviderAvailability, user.id)
        if availability is None:
            availability = ProviderAvailability(user_id=user.id)
            session.add(availability)
        availability.is_online = payload.is_online
        availability.latitude = payload.latitude if payload.is_online else None
        availability.longitude = payload.longitude if payload.is_online else None
        session.commit()
        return {"is_online": availability.is_online, "verification_status": profile.verification_status}

    @router.put("/providers/me/location", response_model=ProviderLocationResponse)
    def update_provider_location(
        payload: ProviderLocationRequest,
        user: Annotated[User, Depends(require_roles("plumber"))],
        session: Annotated[Session, Depends(get_session)],
    ) -> ProviderLocationResponse:
        availability = session.get(ProviderAvailability, user.id)
        if availability is None or not availability.is_online:
            raise HTTPException(status_code=409, detail="Go online before sharing your location")
        profile = session.get(PlumberProfile, user.id)
        if profile is None or profile.verification_status != "verified":
            raise HTTPException(status_code=403, detail="Provider verification is required to share location")
        availability.latitude = payload.latitude
        availability.longitude = payload.longitude
        session.commit()
        session.refresh(availability)
        return ProviderLocationResponse(
            latitude=availability.latitude,
            longitude=availability.longitude,
            updated_at=availability.updated_at,
        )

    @router.post("/bookings", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
    def create_booking(
        payload: BookingCreateRequest,
        user: Annotated[User, Depends(require_roles("customer"))],
        session: Annotated[Session, Depends(get_session)],
    ) -> BookingResponse:
        booking = Booking(
            customer_id=user.id,
            category=payload.category.strip(),
            description=payload.description.strip(),
            latitude=payload.latitude,
            longitude=payload.longitude,
        )
        session.add(booking)
        session.flush()
        record_status(session, booking, "requested", user, "customer")
        dispatch(session, booking, user, payload.provider_id)
        session.commit()
        session.refresh(booking)
        return booking_response(session, booking)

    @router.get("/providers/me/offers", response_model=list[BookingResponse])
    def list_provider_offers(
        user: Annotated[User, Depends(require_roles("plumber"))],
        session: Annotated[Session, Depends(get_session)],
    ) -> list[BookingResponse]:
        offers = session.scalars(
            select(BookingOffer).where(
                BookingOffer.provider_id == user.id,
                BookingOffer.status == "offered",
                BookingOffer.expires_at > datetime.now(timezone.utc),
            )
        ).all()
        bookings = [session.get(Booking, offer.booking_id) for offer in offers]
        return [booking_response(session, booking) for booking in bookings if booking is not None]

    @router.get("/bookings/{booking_id}", response_model=BookingResponse)
    def get_booking(
        booking_id: UUID,
        user: Annotated[User, Depends(current_user)],
        session: Annotated[Session, Depends(get_session)],
    ) -> BookingResponse:
        booking = session.get(Booking, booking_id)
        if booking is None:
            raise HTTPException(status_code=404, detail="Booking not found")
        is_offered_provider = session.scalar(
            select(BookingOffer.id).where(
                BookingOffer.booking_id == booking_id,
                BookingOffer.provider_id == user.id,
                BookingOffer.status == "offered",
            )
        ) is not None
        if user.id not in {booking.customer_id, booking.provider_id} and not is_offered_provider:
            raise HTTPException(status_code=403, detail="You are not a participant in this booking")
        return booking_response(session, booking)

    @router.get("/bookings/{booking_id}/provider-location", response_model=ProviderLocationResponse)
    def get_booking_provider_location(
        booking_id: UUID,
        user: Annotated[User, Depends(require_roles("customer"))],
        session: Annotated[Session, Depends(get_session)],
    ) -> ProviderLocationResponse:
        booking = session.get(Booking, booking_id)
        if booking is None:
            raise HTTPException(status_code=404, detail="Booking not found")
        if booking.customer_id != user.id:
            raise HTTPException(status_code=403, detail="Only the booking customer may view the provider location")
        if booking.provider_id is None or booking.status not in ACTIVE_STATUSES:
            raise HTTPException(status_code=409, detail="Provider location is shared only during an active assigned booking")

        availability = session.get(ProviderAvailability, booking.provider_id)
        location_updated_at = availability.updated_at if availability is not None else None
        if location_updated_at is not None and location_updated_at.tzinfo is None:
            location_updated_at = location_updated_at.replace(tzinfo=timezone.utc)
        if (
            availability is None
            or not availability.is_online
            or availability.latitude is None
            or availability.longitude is None
            or location_updated_at is None
            or location_updated_at < datetime.now(timezone.utc) - timedelta(seconds=LOCATION_STALE_SECONDS)
        ):
            return ProviderLocationResponse(latitude=None, longitude=None, updated_at=None)
        return ProviderLocationResponse(
            latitude=availability.latitude,
            longitude=availability.longitude,
            updated_at=availability.updated_at,
        )

    @router.post("/bookings/{booking_id}/accept", response_model=BookingResponse)
    def accept_booking(
        booking_id: UUID,
        user: Annotated[User, Depends(require_roles("plumber"))],
        session: Annotated[Session, Depends(get_session)],
    ) -> BookingResponse:
        availability = session.scalar(
            select(ProviderAvailability).where(ProviderAvailability.user_id == user.id).with_for_update()
        )
        profile = session.get(PlumberProfile, user.id)
        booking = session.scalar(select(Booking).where(Booking.id == booking_id).with_for_update())
        offer = session.scalar(
            select(BookingOffer)
            .where(BookingOffer.booking_id == booking_id, BookingOffer.provider_id == user.id)
            .with_for_update()
        )
        if profile is None or profile.verification_status != "verified" or availability is None or not availability.is_online:
            raise HTTPException(status_code=403, detail="Provider is not eligible to accept jobs")
        if booking is None or offer is None:
            raise HTTPException(status_code=404, detail="Active offer not found")
        if booking.status != "offered" or booking.provider_id is not None or offer.status != "offered":
            raise HTTPException(status_code=409, detail="Booking offer is no longer available")
        offer_expires_at = offer.expires_at
        if offer_expires_at.tzinfo is None:
            offer_expires_at = offer_expires_at.replace(tzinfo=timezone.utc)
        if offer_expires_at <= datetime.now(timezone.utc):
            offer.status = "expired"
            dispatch(session, booking, user)
            session.commit()
            raise HTTPException(status_code=409, detail="Booking offer expired")
        assigned_count = session.scalar(
            select(func.count(Booking.id)).where(
                Booking.provider_id == user.id,
                Booking.status.in_(ACTIVE_STATUSES),
            )
        ) or 0
        if assigned_count >= availability.max_active_jobs:
            raise HTTPException(status_code=409, detail="Provider has reached active job capacity")
        booking.provider_id = user.id
        offer.status = "accepted"
        record_status(session, booking, "accepted", user, "provider")
        session.commit()
        session.refresh(booking)
        return booking_response(session, booking)

    @router.post("/bookings/{booking_id}/transition", response_model=BookingResponse)
    def transition_booking(
        booking_id: UUID,
        payload: BookingTransitionRequest,
        user: Annotated[User, Depends(current_user)],
        session: Annotated[Session, Depends(get_session)],
    ) -> BookingResponse:
        booking = session.scalar(select(Booking).where(Booking.id == booking_id).with_for_update())
        if booking is None:
            raise HTTPException(status_code=404, detail="Booking not found")
        provider_transitions = {
            "accepted": {"en_route"},
            "en_route": {"arrived"},
            "arrived": {"inspection"},
            "quote_approved": {"in_progress"},
            "in_progress": {"completion_pending"},
        }
        if user.id == booking.provider_id and user.role == "plumber":
            allowed = provider_transitions.get(booking.status, set())
            actor_type = "provider"
        elif user.id == booking.customer_id and user.role == "customer":
            allowed = {"completed"} if booking.status == "completion_pending" else set()
            actor_type = "customer"
        else:
            raise HTTPException(status_code=403, detail="Only booking participants may change its status")
        if payload.to_status not in allowed:
            raise HTTPException(status_code=409, detail=f"Invalid booking transition: {booking.status} to {payload.to_status}")
        if payload.to_status == "in_progress":
            paid_payment = session.scalar(
                select(Payment.id).where(Payment.booking_id == booking.id, Payment.status == "paid")
            )
            if paid_payment is None:
                raise HTTPException(status_code=409, detail="A confirmed customer payment is required before work starts")
        record_status(session, booking, payload.to_status, user, actor_type)
        if payload.to_status == "completed":
            record_status(session, booking, "settlement_pending", None, "system")
            payments = session.scalars(
                select(Payment).where(Payment.booking_id == booking.id, Payment.status == "paid")
            ).all()
            for payment in payments:
                existing_earning = session.scalar(
                    select(ProviderEarning.id).where(ProviderEarning.payment_id == payment.id)
                )
                if existing_earning is None and booking.provider_id is not None:
                    commission_minor = payment.amount_minor * int(os.getenv("PLATFORM_COMMISSION_BPS", "1500")) // 10000
                    session.add(PlatformCommission(payment_id=payment.id, amount_minor=commission_minor))
                    session.add(
                        ProviderEarning(
                            payment_id=payment.id,
                            provider_id=booking.provider_id,
                            amount_minor=payment.amount_minor - commission_minor,
                            status="held",
                        )
                    )
        session.commit()
        session.refresh(booking)
        return booking_response(session, booking)

    @router.post("/bookings/{booking_id}/quotes", response_model=QuoteResponse, status_code=status.HTTP_201_CREATED)
    def create_quote(
        booking_id: UUID,
        payload: QuoteCreateRequest,
        user: Annotated[User, Depends(require_roles("plumber"))],
        session: Annotated[Session, Depends(get_session)],
    ) -> Quote:
        booking = session.scalar(select(Booking).where(Booking.id == booking_id).with_for_update())
        if booking is None:
            raise HTTPException(status_code=404, detail="Booking not found")
        if booking.provider_id != user.id or booking.status != "inspection":
            raise HTTPException(status_code=409, detail="A quote can only be submitted by the assigned provider after inspection")
        prior_quotes = session.scalars(select(Quote).where(Quote.booking_id == booking_id)).all()
        for quote in prior_quotes:
            if quote.status == "pending":
                quote.status = "superseded"
        quote = Quote(
            booking_id=booking.id,
            provider_id=user.id,
            version=len(prior_quotes) + 1,
            amount_minor=payload.amount_minor,
            description=payload.description.strip(),
        )
        session.add(quote)
        record_status(session, booking, "quote_pending", user, "provider")
        session.commit()
        session.refresh(quote)
        return quote

    @router.post("/quotes/{quote_id}/approve", response_model=QuoteResponse)
    def approve_quote(
        quote_id: UUID,
        user: Annotated[User, Depends(require_roles("customer"))],
        session: Annotated[Session, Depends(get_session)],
    ) -> Quote:
        quote = session.scalar(select(Quote).where(Quote.id == quote_id).with_for_update())
        if quote is None:
            raise HTTPException(status_code=404, detail="Quote not found")
        booking = session.scalar(select(Booking).where(Booking.id == quote.booking_id).with_for_update())
        if booking is None or booking.customer_id != user.id:
            raise HTTPException(status_code=403, detail="Only the booking customer may approve this quote")
        if booking.status != "quote_pending" or quote.status != "pending":
            raise HTTPException(status_code=409, detail="Quote is no longer awaiting approval")
        quote.status = "approved"
        record_status(session, booking, "quote_approved", user, "customer")
        session.commit()
        session.refresh(quote)
        return quote

    return router