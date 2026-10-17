import base64
import binascii
import hashlib
import re
from pathlib import Path
from typing import Annotated, Callable
from uuid import UUID

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.responses import Response

from app.models import CustomerProfile, PlumberProfile, ProfilePost, User
from app.schemas import (
    ProfilePostCreateRequest,
    ProfilePostResponse,
    ProfileResponse,
    ProfileUpdateRequest,
)

MAX_UPLOAD_BYTES = 4 * 1024 * 1024
IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp"}
IDENTITY_MIMES = IMAGE_MIMES | {"application/pdf"}
DATA_URI = re.compile(r"^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$")


def plumber_profile_complete(profile: PlumberProfile) -> bool:
    return all(
        (
            bool(profile.display_name),
            bool(profile.bio),
            bool(profile.profile_image_data),
            bool(profile.service_county),
            bool(profile.service_location),
            bool(profile.phone_number),
            bool(profile.services_offered),
            profile.years_experience is not None,
        )
    )


def decode_upload(data_uri: str, allowed_mimes: set[str]) -> tuple[str, bytes]:
    match = DATA_URI.fullmatch(data_uri)
    if match is None or match.group(1) not in allowed_mimes:
        raise HTTPException(status_code=422, detail="Upload a supported JPEG, PNG, WebP image, or PDF document.")
    try:
        contents = base64.b64decode(match.group(2), validate=True)
    except binascii.Error:
        raise HTTPException(status_code=422, detail="The uploaded file is not valid base64 data.") from None
    if not contents or len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Each uploaded file must be smaller than 4 MB.")
    return match.group(1), contents


def document_cipher(secret_key: str) -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(secret_key.encode("utf-8")).digest())
    return Fernet(key)


def create_profile_router(
    get_session: Callable,
    current_user: Callable,
    require_roles: Callable,
    secret_key: str,
) -> APIRouter:
    router = APIRouter(prefix="/api/v1")
    profile_roles = require_roles("customer", "plumber")
    cipher = document_cipher(secret_key)

    def serialize_profile(user: User, session: Session) -> ProfileResponse:
        if user.role == "plumber":
            profile = session.get(PlumberProfile, user.id)
            if profile is None:
                raise HTTPException(status_code=404, detail="Plumber profile not found.")
            complete = plumber_profile_complete(profile)
            return ProfileResponse(
                id=user.id,
                role="plumber",
                email=user.email,
                display_name=profile.display_name,
                bio=profile.bio,
                profile_image_data=profile.profile_image_data,
                service_county=profile.service_county,
                service_location=profile.service_location,
                phone_number=profile.phone_number,
                services_offered=profile.services_offered or [],
                years_experience=profile.years_experience,
                verification_status=profile.verification_status,
                verification_document_uploaded=profile.verification_document_encrypted is not None,
                profile_complete=complete,
            )

        profile = session.get(CustomerProfile, user.id)
        complete = bool(profile and profile.display_name and profile.bio and profile.profile_image_data)
        return ProfileResponse(
            id=user.id,
            role="customer",
            email=user.email,
            display_name=profile.display_name if profile else None,
            bio=profile.bio if profile else None,
            profile_image_data=profile.profile_image_data if profile else None,
            profile_complete=complete,
        )

    @router.get("/profiles/me", response_model=ProfileResponse)
    def get_my_profile(
        user: Annotated[User, Depends(profile_roles)],
        session: Annotated[Session, Depends(get_session)],
    ) -> ProfileResponse:
        return serialize_profile(user, session)

    @router.put("/profiles/me", response_model=ProfileResponse)
    def update_my_profile(
        payload: ProfileUpdateRequest,
        user: Annotated[User, Depends(profile_roles)],
        session: Annotated[Session, Depends(get_session)],
    ) -> ProfileResponse:
        if payload.profile_image_data is not None:
            decode_upload(payload.profile_image_data, IMAGE_MIMES)

        if user.role == "plumber":
            profile = session.get(PlumberProfile, user.id)
            if profile is None:
                raise HTTPException(status_code=404, detail="Plumber profile not found.")
            if payload.display_name is not None:
                profile.display_name = payload.display_name.strip()
            if payload.bio is not None:
                profile.bio = payload.bio.strip()
            if payload.profile_image_data is not None:
                profile.profile_image_data = payload.profile_image_data
            if payload.service_county is not None:
                profile.service_county = payload.service_county.strip()
            if payload.service_location is not None:
                profile.service_location = payload.service_location.strip()
            if "phone_number" in payload.model_fields_set:
                phone_number = payload.phone_number
                if phone_number is not None:
                    phone_number = phone_number.strip()
                    existing = session.scalar(
                        select(PlumberProfile).where(
                            PlumberProfile.phone_number == phone_number,
                            PlumberProfile.user_id != user.id,
                        )
                    )
                    if existing is not None:
                        raise HTTPException(status_code=409, detail="This mobile number is already linked to another plumber account.")
                profile.phone_number = phone_number or None
            if payload.services_offered is not None:
                profile.services_offered = list(dict.fromkeys(payload.services_offered))
            if payload.years_experience is not None:
                profile.years_experience = payload.years_experience
            if payload.verification_document_data is not None:
                mime, contents = decode_upload(payload.verification_document_data, IDENTITY_MIMES)
                if payload.verification_document_mime != mime:
                    raise HTTPException(status_code=422, detail="The identity document type does not match its file.")
                filename = Path(payload.verification_document_filename or "identity-document").name
                profile.verification_document_encrypted = cipher.encrypt(contents)
                profile.verification_document_mime = mime
                profile.verification_document_filename = filename[:255]
            if (
                profile.verification_status in {"pending", "rejected"}
                and plumber_profile_complete(profile)
            ):
                profile.verification_status = "verified"
        else:
            profile = session.get(CustomerProfile, user.id)
            if profile is None:
                profile = CustomerProfile(user_id=user.id)
                session.add(profile)
            if payload.display_name is not None:
                profile.display_name = payload.display_name.strip()
            if payload.bio is not None:
                profile.bio = payload.bio.strip()
            if payload.profile_image_data is not None:
                profile.profile_image_data = payload.profile_image_data

        session.commit()
        return serialize_profile(user, session)

    @router.get("/profiles/me/posts", response_model=list[ProfilePostResponse])
    def list_my_posts(
        user: Annotated[User, Depends(profile_roles)],
        session: Annotated[Session, Depends(get_session)],
    ) -> list[ProfilePost]:
        return list(
            session.scalars(
                select(ProfilePost)
                .where(ProfilePost.user_id == user.id)
                .order_by(ProfilePost.created_at.desc())
            ).all()
        )

    @router.post(
        "/profiles/me/posts",
        response_model=ProfilePostResponse,
        status_code=status.HTTP_201_CREATED,
    )
    def create_my_post(
        payload: ProfilePostCreateRequest,
        user: Annotated[User, Depends(profile_roles)],
        session: Annotated[Session, Depends(get_session)],
    ) -> ProfilePost:
        decode_upload(payload.image_data, IMAGE_MIMES)
        post = ProfilePost(user_id=user.id, caption=payload.caption.strip(), image_data=payload.image_data)
        session.add(post)
        session.commit()
        session.refresh(post)
        return post

    @router.get("/admin/providers/{provider_id}/identity-document")
    def get_provider_identity_document(
        provider_id: UUID,
        _: Annotated[User, Depends(require_roles("admin"))],
        session: Annotated[Session, Depends(get_session)],
    ) -> Response:
        profile = session.get(PlumberProfile, provider_id)
        if profile is None or profile.verification_document_encrypted is None:
            raise HTTPException(status_code=404, detail="Identity document not found.")
        try:
            document = cipher.decrypt(profile.verification_document_encrypted)
        except InvalidToken:
            raise HTTPException(status_code=500, detail="The identity document could not be decrypted.") from None
        filename = re.sub(
            r"[^A-Za-z0-9._ -]",
            "_",
            Path(profile.verification_document_filename or "identity-document").name,
        ).strip()[:255] or "identity-document"
        return Response(
            content=document,
            media_type=profile.verification_document_mime or "application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"},
        )

    return router
