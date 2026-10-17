import base64

from fastapi.testclient import TestClient

from app.main import create_app
from app.models import PlumberProfile, User
from app.security import hash_password


def authorization(client: TestClient, email: str, password: str) -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_customer_profile_and_photo_posts_are_private_to_their_owner() -> None:
    app = create_app("sqlite://", "a-profile-test-secret-key-with-more-than-32-bytes", create_schema=True)
    with TestClient(app) as client:
        with app.state.session_factory() as session:
            session.add_all(
                [
                    User(email="customer@example.com", password_hash=hash_password("a-strong-customer-password"), role="customer"),
                    User(email="other@example.com", password_hash=hash_password("a-strong-other-password"), role="customer"),
                ]
            )
            session.commit()
        customer = authorization(client, "customer@example.com", "a-strong-customer-password")
        other = authorization(client, "other@example.com", "a-strong-other-password")

        profile_response = client.put(
            "/api/v1/profiles/me",
            headers=customer,
            json={
                "display_name": "Amara Wanjiku",
                "bio": "Homeowner and Pipego community member.",
                "profile_image_data": "data:image/png;base64,aGVsbG8=",
            },
        )
        assert profile_response.status_code == 200
        assert profile_response.json()["profile_complete"] is True

        post = client.post(
            "/api/v1/profiles/me/posts",
            headers=customer,
            json={"caption": "A little update from home.", "image_data": "data:image/jpeg;base64,aGVsbG8="},
        )
        assert post.status_code == 201
        assert [item["id"] for item in client.get("/api/v1/profiles/me/posts", headers=customer).json()] == [post.json()["id"]]
        assert client.get("/api/v1/profiles/me/posts", headers=other).json() == []
        assert client.get("/api/v1/profiles/me").status_code == 401


def test_plumber_identity_document_is_encrypted_and_admin_only() -> None:
    app = create_app("sqlite://", "another-profile-test-secret-key-over-32-bytes", create_schema=True)
    original_document = b"private identity document"
    encoded_document = base64.b64encode(original_document).decode()
    with TestClient(app) as client:
        with app.state.session_factory() as session:
            session.add_all(
                [
                    User(email="plumber@example.com", password_hash=hash_password("a-strong-plumber-password"), role="customer"),
                    User(email="admin@example.com", password_hash=hash_password("a-strong-admin-password"), role="admin"),
                ]
            )
            session.commit()
        plumber = authorization(client, "plumber@example.com", "a-strong-plumber-password")
        admin = authorization(client, "admin@example.com", "a-strong-admin-password")
        assert client.post(
            "/api/v1/providers/me/apply",
            headers=plumber,
            json={"display_name": "Maina Kariuki"},
        ).status_code == 201
        provider_id_response = client.get("/api/v1/users/me", headers=plumber).json()
        assert client.put(
            "/api/v1/providers/me/availability",
            headers=plumber,
            json={"is_online": True, "latitude": -1.2864, "longitude": 36.8172},
        ).status_code == 403
        assert client.patch(
            f"/api/v1/admin/providers/{provider_id_response['id']}/verification",
            headers=admin,
            json={"status": "verified"},
        ).status_code == 409

        payload = {
            "display_name": "Maina Kariuki",
            "bio": "Licensed plumber with a focus on home repairs.",
            "profile_image_data": "data:image/jpeg;base64,aGVsbG8=",
            "service_county": "Nairobi",
            "service_location": "Kilimani",
            "phone_number": "+254712345678",
            "services_offered": ["Leaking pipe", "Toilet repair"],
            "years_experience": 8,
            "verification_document_data": f"data:application/pdf;base64,{encoded_document}",
            "verification_document_mime": "application/pdf",
            "verification_document_filename": "national-id.pdf",
        }
        updated = client.put("/api/v1/profiles/me", headers=plumber, json=payload)
        assert updated.status_code == 200
        assert updated.json()["verification_document_uploaded"] is True
        assert updated.json()["verification_status"] == "verified"
        assert updated.json()["profile_complete"] is True
        assert updated.json()["phone_number"] == "+254712345678"
        assert updated.json()["services_offered"] == ["Leaking pipe", "Toilet repair"]
        assert "verification_document_data" not in updated.json()
        assert "national-id.pdf" not in updated.text
        assert client.put(
            "/api/v1/providers/me/availability",
            headers=plumber,
            json={"is_online": True, "latitude": -1.2864, "longitude": 36.8172},
        ).status_code == 200

        with app.state.session_factory() as session:
            plumber_user = session.query(User).filter_by(email="plumber@example.com").one()
            profile = session.get(PlumberProfile, plumber_user.id)
            assert profile is not None
            assert profile.verification_document_encrypted != original_document

        provider_id = updated.json()["id"]
        denied = client.get(f"/api/v1/admin/providers/{provider_id}/identity-document", headers=plumber)
        assert denied.status_code == 403
        document = client.get(f"/api/v1/admin/providers/{provider_id}/identity-document", headers=admin)
        assert document.status_code == 200
        assert document.content == original_document
        assert document.headers["cache-control"] == "no-store"


def test_plumber_profile_activates_without_an_identity_document() -> None:
    app = create_app("sqlite://", "a-profile-without-id-test-secret-key", create_schema=True)
    with TestClient(app) as client:
        with app.state.session_factory() as session:
            session.add(User(email="plumber@example.com", password_hash=hash_password("a-strong-plumber-password"), role="customer"))
            session.commit()
        plumber = authorization(client, "plumber@example.com", "a-strong-plumber-password")
        assert client.post(
            "/api/v1/providers/me/apply",
            headers=plumber,
            json={"display_name": "Maina Kariuki"},
        ).status_code == 201

        updated = client.put(
            "/api/v1/profiles/me",
            headers=plumber,
            json={
                "display_name": "Maina Kariuki",
                "bio": "Experienced plumber focused on home repairs.",
                "profile_image_data": "data:image/jpeg;base64,aGVsbG8=",
                "service_county": "Nairobi",
                "service_location": "Kilimani",
                "phone_number": "+254712345678",
                "services_offered": ["Leaking pipe"],
                "years_experience": 8,
            },
        )
        assert updated.status_code == 200
        assert updated.json()["profile_complete"] is True
        assert updated.json()["verification_document_uploaded"] is False
        assert updated.json()["verification_status"] == "verified"
        assert client.put(
            "/api/v1/providers/me/availability",
            headers=plumber,
            json={"is_online": True, "latitude": -1.2864, "longitude": 36.8172},
        ).status_code == 200


def test_plumber_contact_number_accepts_kenyan_formats_and_stores_e164() -> None:
    app = create_app("sqlite://", "a-phone-validation-test-secret-key-with-more-than-32-bytes", create_schema=True)
    with TestClient(app) as client:
        with app.state.session_factory() as session:
            session.add(User(email="plumber@example.com", password_hash=hash_password("a-strong-plumber-password"), role="customer"))
            session.commit()
        plumber = authorization(client, "plumber@example.com", "a-strong-plumber-password")
        assert client.post(
            "/api/v1/providers/me/apply",
            headers=plumber,
            json={"display_name": "Maina Kariuki"},
        ).status_code == 201

        for phone_number in ("0712 345 678", "0112-345-678", "254712345678", "+254712345678"):
            updated = client.put(
                "/api/v1/profiles/me",
                headers=plumber,
                json={"phone_number": phone_number},
            )
            assert updated.status_code == 200
            expected = "+254112345678" if phone_number == "0112-345-678" else "+254712345678"
            assert updated.json()["phone_number"] == expected

        for phone_number in ("071234567", "0612345678", "+254612345678", "071234567890"):
            invalid = client.put(
                "/api/v1/profiles/me",
                headers=plumber,
                json={"phone_number": phone_number},
            )
            assert invalid.status_code == 422


def test_plumber_contact_number_cannot_be_reused() -> None:
    app = create_app("sqlite://", "a-phone-uniqueness-test-secret-key-with-more-than-32-bytes", create_schema=True)
    with TestClient(app) as client:
        with app.state.session_factory() as session:
            session.add_all(
                [
                    User(email="first@example.com", password_hash=hash_password("a-strong-first-password"), role="customer"),
                    User(email="second@example.com", password_hash=hash_password("a-strong-second-password"), role="customer"),
                ]
            )
            session.commit()
        first = authorization(client, "first@example.com", "a-strong-first-password")
        second = authorization(client, "second@example.com", "a-strong-second-password")
        for headers, name in ((first, "First Plumber"), (second, "Second Plumber")):
            assert client.post(
                "/api/v1/providers/me/apply",
                headers=headers,
                json={"display_name": name},
            ).status_code == 201

        assert client.put(
            "/api/v1/profiles/me",
            headers=first,
            json={"phone_number": "+254712345678"},
        ).status_code == 200
        duplicate = client.put(
            "/api/v1/profiles/me",
            headers=second,
            json={"phone_number": "0712 345 678"},
        )
        assert duplicate.status_code == 409
