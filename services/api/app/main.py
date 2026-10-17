from contextlib import asynccontextmanager
import os
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_access_token_minutes, get_database_url, get_secret_key
from app.database import Base, make_session_factory, session_dependency
from app.models import User
from app.marketplace import create_marketplace_router
from app.payment_routes import create_payment_router
from app.profiles import create_profile_router
from app.schemas import LoginRequest, RegisterRequest, TokenResponse, UserResponse
from app.security import create_access_token, hash_password, verify_password


def create_app(
    database_url: str | None = None,
    secret_key: str | None = None,
    create_schema: bool | None = None,
    payment_webhook_secret: str | None = None,
    allow_mock_payments: bool | None = None,
) -> FastAPI:
    database_url = database_url or get_database_url()
    secret_key = secret_key or get_secret_key()
    access_token_minutes = get_access_token_minutes()
    engine, session_factory = make_session_factory(database_url)
    if create_schema is None:
        create_schema = os.getenv("ENVIRONMENT", "development") != "production"
    payment_webhook_secret = payment_webhook_secret or os.getenv(
        "PAYMENT_WEBHOOK_SECRET", "local-payment-webhook-secret-change-me"
    )
    if os.getenv("ENVIRONMENT", "development") == "production" and len(payment_webhook_secret) < 32:
        raise RuntimeError("PAYMENT_WEBHOOK_SECRET must contain at least 32 characters in production")
    if allow_mock_payments is None:
        allow_mock_payments = os.getenv("ENVIRONMENT", "development") != "production"

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if create_schema:
            Base.metadata.create_all(bind=engine)
        yield
        engine.dispose()

    application = FastAPI(title="Plumber Uber API", version="1.0.0", lifespan=lifespan)
    allowed_origins = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8081,http://127.0.0.1:8081",
        ).split(",")
        if origin.strip()
    ]
    cors_options: dict[str, str] = {}
    if os.getenv("ENVIRONMENT", "development") != "production":
        cors_options["allow_origin_regex"] = (
            r"^https?://(localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|"
            r"172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|"
            r"192\.168(?:\.\d{1,3}){2})(?::\d+)?$"
        )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        **cors_options,
    )
    get_session = session_dependency(session_factory)
    bearer = HTTPBearer(auto_error=False)

    def current_user(
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
        session: Annotated[Session, Depends(get_session)],
    ) -> User:
        unauthorized = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        )
        if credentials is None:
            raise unauthorized
        try:
            claims = jwt.decode(credentials.credentials, secret_key, algorithms=["HS256"])
            user_id = UUID(claims["sub"])
        except (jwt.InvalidTokenError, KeyError, ValueError):
            raise unauthorized from None
        user = session.get(User, user_id)
        if user is None or not user.is_active:
            raise unauthorized
        return user

    def require_roles(*roles: str):
        def role_guard(user: Annotated[User, Depends(current_user)]) -> User:
            if user.role not in roles:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
            return user

        return role_guard

    application.state.session_factory = session_factory
    application.include_router(create_marketplace_router(get_session, current_user, require_roles))
    application.include_router(create_profile_router(get_session, current_user, require_roles, secret_key))
    application.include_router(
        create_payment_router(
            get_session,
            current_user,
            require_roles,
            payment_webhook_secret,
            allow_mock_payments,
        )
    )

    @application.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @application.post("/api/v1/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
    def register(payload: RegisterRequest, session: Annotated[Session, Depends(get_session)]) -> User:
        email = str(payload.email).lower()
        if session.scalar(select(User).where(User.email == email)) is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")
        user = User(email=email, password_hash=hash_password(payload.password), role="customer")
        session.add(user)
        session.commit()
        session.refresh(user)
        return user

    @application.post("/api/v1/auth/login", response_model=TokenResponse)
    def login(payload: LoginRequest, session: Annotated[Session, Depends(get_session)]) -> TokenResponse:
        email = str(payload.email).lower()
        user = session.scalar(select(User).where(User.email == email))
        if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        token = create_access_token(user.id, user.role, secret_key, access_token_minutes)
        return TokenResponse(
            access_token=token,
            expires_in=access_token_minutes * 60,
        )

    @application.get("/api/v1/users/me", response_model=UserResponse)
    def read_current_user(user: Annotated[User, Depends(current_user)]) -> User:
        return user

    @application.get("/api/v1/admin/users", response_model=list[UserResponse])
    def list_users(
        _: Annotated[User, Depends(require_roles("admin"))],
        session: Annotated[Session, Depends(get_session)],
    ) -> list[User]:
        return list(session.scalars(select(User).order_by(User.created_at.desc())).all())

    return application


app = create_app()