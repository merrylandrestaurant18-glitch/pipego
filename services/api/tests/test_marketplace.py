import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi.testclient import TestClient

from app.main import create_app
from app.models import PlumberProfile, ProviderAvailability, User
from app.security import hash_password


def login(client: TestClient, email: str, password: str) -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_provider_discovery_only_returns_available_verified_public_profiles() -> None:
    app = create_app("sqlite://", "a-discovery-test-secret-key-with-more-than-32-bytes", create_schema=True)
    with TestClient(app) as client:
        with app.state.session_factory() as session:
            online = User(
                email="verified@example.com",
                password_hash=hash_password("a-strong-provider-password"),
                role="plumber",
            )
            pending = User(
                email="pending@example.com",
                password_hash=hash_password("a-strong-provider-password"),
                role="plumber",
            )
            offline = User(
                email="offline@example.com",
                password_hash=hash_password("a-strong-provider-password"),
                role="plumber",
            )
            session.add_all([online, pending, offline])
            session.flush()
            session.add_all(
                [
                    PlumberProfile(
                        user_id=online.id,
                        display_name="Verified Plumber",
                        verification_status="verified",
                        bio="Helping local families.",
                        service_county="Nairobi",
                        service_location="Westlands",
                        phone_number="+254712345678",
                        services_offered=["Leaking pipe", "Water heater"],
                        years_experience=7,
                        verification_document_encrypted=b"private-document",
                    ),
                    PlumberProfile(
                        user_id=pending.id,
                        display_name="Pending Plumber",
                        verification_status="pending",
                    ),
                    PlumberProfile(
                        user_id=offline.id,
                        display_name="Offline Plumber",
                        verification_status="verified",
                    ),
                    ProviderAvailability(
                        user_id=online.id,
                        is_online=True,
                        latitude=-1.2864,
                        longitude=36.8172,
                        service_radius_km=20,
                        max_active_jobs=1,
                    ),
                    ProviderAvailability(
                        user_id=pending.id,
                        is_online=True,
                        latitude=-1.2864,
                        longitude=36.8172,
                        service_radius_km=20,
                        max_active_jobs=1,
                    ),
                    ProviderAvailability(
                        user_id=offline.id,
                        is_online=False,
                        latitude=-1.2864,
                        longitude=36.8172,
                        service_radius_km=20,
                        max_active_jobs=1,
                    ),
                ]
            )
            session.commit()

        response = client.get("/api/v1/providers/discover?latitude=-1.287&longitude=36.818")
        assert response.status_code == 200
        assert len(response.json()) == 1
        provider = response.json()[0]
        assert provider["display_name"] == "Verified Plumber"
        assert provider["service_location"] == "Westlands"
        assert provider["services_offered"] == ["Leaking pipe", "Water heater"]
        assert provider["distance_km"] > 0
        assert provider["approximate_latitude"] == round(-1.2864, 3)
        assert provider["approximate_longitude"] == round(36.8172, 3)
        assert "email" not in provider
        assert "phone_number" not in provider
        assert "verification_document_encrypted" not in provider
        assert "latitude" not in provider
        assert "longitude" not in provider

        assert client.get("/api/v1/providers/discover?latitude=-1.287").status_code == 422


def test_verified_provider_booking_quote_and_customer_confirmation() -> None:
    app = create_app("sqlite://", "a-test-secret-key-with-more-than-32-bytes", create_schema=True)
    with TestClient(app) as client:
        session_factory = app.state.session_factory
        with session_factory() as session:
            session.add_all(
                [
                    User(
                        email="customer@example.com",
                        password_hash=hash_password("a-strong-customer-password"),
                        role="customer",
                    ),
                    User(
                        email="provider@example.com",
                        password_hash=hash_password("a-strong-provider-password"),
                        role="customer",
                    ),
                    User(
                        email="admin@example.com",
                        password_hash=hash_password("a-strong-admin-password"),
                        role="admin",
                    ),
                ]
            )
            session.commit()

        customer_headers = login(client, "customer@example.com", "a-strong-customer-password")
        provider_headers = login(client, "provider@example.com", "a-strong-provider-password")
        admin_headers = login(client, "admin@example.com", "a-strong-admin-password")

        application = client.post(
            "/api/v1/providers/me/apply",
            headers=provider_headers,
            json={"display_name": "Provider One"},
        )
        assert application.status_code == 201
        assert application.json()["status"] == "pending"
        provider_id = client.get("/api/v1/users/me", headers=provider_headers).json()["id"]
        profile = client.put(
            "/api/v1/profiles/me",
            headers=provider_headers,
            json={
                "display_name": "Provider One",
                "bio": "Experienced plumber serving homes across Nairobi.",
                "profile_image_data": "data:image/png;base64,aGVsbG8=",
                "service_county": "Nairobi",
                "service_location": "Westlands",
                "phone_number": "+254712345678",
                "services_offered": ["Blocked drain", "Leaking pipe"],
                "years_experience": 7,
                "verification_document_data": "data:application/pdf;base64,aWRlbnRpdHk=",
                "verification_document_mime": "application/pdf",
                "verification_document_filename": "identity.pdf",
            },
        )
        assert profile.status_code == 200
        assert profile.json()["verification_document_uploaded"] is True

        verification = client.patch(
            f"/api/v1/admin/providers/{provider_id}/verification",
            headers=admin_headers,
            json={"status": "verified"},
        )
        assert verification.status_code == 200
        assert client.put(
            "/api/v1/providers/me/availability",
            headers=provider_headers,
            json={"is_online": True, "latitude": -1.2864, "longitude": 36.8172},
        ).status_code == 200
        assert client.get("/api/v1/providers/me/availability", headers=provider_headers).json() == {"is_online": True}
        assert client.put(
            "/api/v1/providers/me/location",
            headers=provider_headers,
            json={"latitude": -1.2864, "longitude": 36.8172},
        ).status_code == 200

        booking_response = client.post(
            "/api/v1/bookings",
            headers=customer_headers,
            json={
                "category": "pipe_leak",
                "description": "Water is leaking beneath the kitchen sink.",
                "latitude": -1.287,
                "longitude": 36.818,
            },
        )
        assert booking_response.status_code == 201
        booking = booking_response.json()
        assert booking["status"] == "offered"
        assert booking["offer_id"]

        offers = client.get("/api/v1/providers/me/offers", headers=provider_headers)
        assert offers.status_code == 200
        assert offers.json()[0]["id"] == booking["id"]
        assert client.get(f"/api/v1/bookings/{booking['id']}", headers=admin_headers).status_code == 403
        assert client.get(
            f"/api/v1/bookings/{booking['id']}/provider-location",
            headers=customer_headers,
        ).status_code == 409

        accepted = client.post(f"/api/v1/bookings/{booking['id']}/accept", headers=provider_headers)
        assert accepted.status_code == 200
        assert accepted.json()["status"] == "accepted"
        assert client.post(f"/api/v1/bookings/{booking['id']}/accept", headers=provider_headers).status_code == 409
        location_response = client.get(
            f"/api/v1/bookings/{booking['id']}/provider-location",
            headers=customer_headers,
        )
        assert location_response.status_code == 200
        assert location_response.json()["latitude"] == -1.2864
        assert location_response.json()["longitude"] == 36.8172
        assert location_response.json()["updated_at"] is not None
        assert client.get(
            f"/api/v1/bookings/{booking['id']}/provider-location",
            headers=provider_headers,
        ).status_code == 403
        with session_factory() as session:
            availability = session.get(ProviderAvailability, UUID(provider_id))
            assert availability is not None
            availability.updated_at = datetime.now(timezone.utc) - timedelta(minutes=2)
            session.commit()
        stale_location = client.get(
            f"/api/v1/bookings/{booking['id']}/provider-location",
            headers=customer_headers,
        )
        assert stale_location.status_code == 200
        assert stale_location.json() == {"latitude": None, "longitude": None, "updated_at": None}

        for target in ("en_route", "arrived", "inspection"):
            moved = client.post(
                f"/api/v1/bookings/{booking['id']}/transition",
                headers=provider_headers,
                json={"to_status": target},
            )
            assert moved.status_code == 200
            assert moved.json()["status"] == target

        quote_response = client.post(
            f"/api/v1/bookings/{booking['id']}/quotes",
            headers=provider_headers,
            json={"amount_minor": 125000, "description": "Replace the damaged sink trap and test for leaks."},
        )
        assert quote_response.status_code == 201
        quote = quote_response.json()
        assert quote["currency"] == "KES"
        assert quote["amount_minor"] == 125000

        assert client.post(
            f"/api/v1/bookings/{booking['id']}/transition",
            headers=provider_headers,
            json={"to_status": "in_progress"},
        ).status_code == 409
        approved = client.post(f"/api/v1/quotes/{quote['id']}/approve", headers=customer_headers)
        assert approved.status_code == 200
        assert approved.json()["status"] == "approved"

        idempotency_key = "booking-payment-0001"
        payment_response = client.post(
            f"/api/v1/bookings/{booking['id']}/payments",
            headers={**customer_headers, "Idempotency-Key": idempotency_key},
        )
        assert payment_response.status_code == 201
        payment = payment_response.json()
        assert payment["status"] == "pending"
        assert payment["amount_minor"] == quote["amount_minor"]
        retried_payment = client.post(
            f"/api/v1/bookings/{booking['id']}/payments",
            headers={**customer_headers, "Idempotency-Key": idempotency_key},
        )
        assert retried_payment.json()["id"] == payment["id"]

        payment_event = {
            "event_id": "mock-event-0001",
            "provider_reference": payment["provider_reference"],
            "status": "paid",
            "amount_minor": payment["amount_minor"],
        }
        raw_event = json.dumps(payment_event, separators=(",", ":")).encode()
        unsigned = client.post(
            "/api/v1/payments/webhooks/mock",
            content=raw_event,
            headers={"Content-Type": "application/json", "X-Payment-Signature": "sha256=00"},
        )
        assert unsigned.status_code == 401
        signature = hmac.new(
            b"local-payment-webhook-secret-change-me", raw_event, hashlib.sha256
        ).hexdigest()
        confirmed = client.post(
            "/api/v1/payments/webhooks/mock",
            content=raw_event,
            headers={"Content-Type": "application/json", "X-Payment-Signature": f"sha256={signature}"},
        )
        assert confirmed.status_code == 200
        assert confirmed.json()["status"] == "paid"
        duplicate_event = client.post(
            "/api/v1/payments/webhooks/mock",
            content=raw_event,
            headers={"Content-Type": "application/json", "X-Payment-Signature": f"sha256={signature}"},
        )
        assert duplicate_event.status_code == 200

        for target in ("in_progress", "completion_pending"):
            moved = client.post(
                f"/api/v1/bookings/{booking['id']}/transition",
                headers=provider_headers,
                json={"to_status": target},
            )
            assert moved.status_code == 200
            assert moved.json()["status"] == target
        completed = client.post(
            f"/api/v1/bookings/{booking['id']}/transition",
            headers=customer_headers,
            json={"to_status": "completed"},
        )
        assert completed.status_code == 200
        assert completed.json()["status"] == "settlement_pending"
        earnings = client.get("/api/v1/providers/me/earnings", headers=provider_headers)
        assert earnings.status_code == 200
        assert earnings.json()[0]["amount_minor"] == 106250
        assert earnings.json()[0]["status"] == "held"
        offline = client.put(
            "/api/v1/providers/me/availability",
            headers=provider_headers,
            json={"is_online": False, "latitude": None, "longitude": None},
        )
        assert offline.status_code == 200
        assert client.put(
            "/api/v1/providers/me/location",
            headers=provider_headers,
            json={"latitude": -1.2864, "longitude": 36.8172},
        ).status_code == 409