from fastapi.testclient import TestClient

from app.database import Base, make_session_factory
from app.main import create_app
from app.models import User
from app.security import hash_password


def test_registration_login_and_server_enforced_roles() -> None:
    engine, session_factory = make_session_factory("sqlite://")
    Base.metadata.create_all(bind=engine)
    with session_factory() as session:
        session.add(User(email="admin@example.com", password_hash=hash_password("a-strong-admin-password"), role="admin"))
        session.commit()
    engine.dispose()

    with TestClient(create_app("sqlite://", "test-secret-key-that-is-at-least-32-bytes", create_schema=True)) as client:
        registered = client.post(
            "/api/v1/auth/register",
            json={"email": "Customer@Example.com", "password": "a-strong-customer-password"},
        )
        assert registered.status_code == 201
        assert registered.json()["role"] == "customer"
        assert "password_hash" not in registered.json()

        escalation = client.post(
            "/api/v1/auth/register",
            json={"email": "attacker@example.com", "password": "a-strong-attacker-password", "role": "admin"},
        )
        assert escalation.status_code == 422

        login = client.post(
            "/api/v1/auth/login",
            json={"email": "customer@example.com", "password": "a-strong-customer-password"},
        )
        assert login.status_code == 200
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        assert client.get("/api/v1/users/me", headers=headers).json()["email"] == "customer@example.com"
        assert client.get("/api/v1/admin/users", headers=headers).status_code == 403
        assert client.get("/api/v1/admin/users").status_code == 401