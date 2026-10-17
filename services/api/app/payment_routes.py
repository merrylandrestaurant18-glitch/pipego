import hashlib
import hmac
import os
from typing import Annotated, Callable
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Booking, Payment, ProviderEarning, Quote, User
from app.payment_provider import MockPaymentProvider, PaymentProvider
from app.schemas import EarningResponse, PaymentResponse, PaymentWebhookRequest


def create_payment_router(
    get_session: Callable,
    current_user: Callable,
    require_roles: Callable,
    webhook_secret: str,
    allow_mock_payments: bool,
    provider: PaymentProvider | None = None,
) -> APIRouter:
    router = APIRouter(prefix="/api/v1")
    payment_provider = provider or MockPaymentProvider()

    @router.post("/bookings/{booking_id}/payments", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
    def initialize_payment(
        booking_id: UUID,
        user: Annotated[User, Depends(require_roles("customer"))],
        session: Annotated[Session, Depends(get_session)],
        idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
    ) -> Payment:
        if not allow_mock_payments and payment_provider.name == "mock":
            raise HTTPException(status_code=503, detail="A production payment provider is not configured")
        booking = session.scalar(select(Booking).where(Booking.id == booking_id).with_for_update())
        if booking is None:
            raise HTTPException(status_code=404, detail="Booking not found")
        if booking.customer_id != user.id:
            raise HTTPException(status_code=403, detail="Only the booking customer may initiate payment")
        existing_key = session.scalar(
            select(Payment).where(Payment.customer_id == user.id, Payment.idempotency_key == idempotency_key)
        )
        if existing_key is not None:
            if existing_key.booking_id != booking.id:
                raise HTTPException(status_code=409, detail="Idempotency key was already used for another booking")
            return existing_key
        existing_active = session.scalar(
            select(Payment)
            .where(Payment.booking_id == booking.id, Payment.status.in_(("pending", "authorized", "paid")))
            .order_by(Payment.created_at.desc())
        )
        if existing_active is not None:
            return existing_active
        if booking.status != "quote_approved":
            raise HTTPException(status_code=409, detail="Payment requires a customer-approved quotation")
        approved_quote = session.scalar(
            select(Quote).where(Quote.booking_id == booking.id, Quote.status == "approved")
        )
        if approved_quote is None or approved_quote.amount_minor <= 0:
            raise HTTPException(status_code=409, detail="No payable approved quotation exists")
        reference = payment_provider.initialize(approved_quote.amount_minor, "KES", idempotency_key)
        payment = Payment(
            booking_id=booking.id,
            customer_id=user.id,
            provider_reference=reference,
            provider=payment_provider.name,
            idempotency_key=idempotency_key,
            amount_minor=approved_quote.amount_minor,
            currency="KES",
            status="pending",
        )
        session.add(payment)
        session.commit()
        session.refresh(payment)
        return payment

    @router.post("/payments/webhooks/{provider_name}")
    async def payment_webhook(
        provider_name: str,
        request: Request,
        signature: Annotated[str | None, Header(alias="X-Payment-Signature")] = None,
        session: Session = Depends(get_session),
    ) -> dict[str, str]:
        if provider_name != payment_provider.name:
            raise HTTPException(status_code=404, detail="Payment provider is not configured")
        raw_body = await request.body()
        expected_signature = hmac.new(webhook_secret.encode(), raw_body, hashlib.sha256).hexdigest()
        supplied_signature = signature.removeprefix("sha256=") if signature else ""
        if not hmac.compare_digest(expected_signature, supplied_signature):
            raise HTTPException(status_code=401, detail="Invalid payment webhook signature")
        try:
            event = PaymentWebhookRequest.model_validate_json(raw_body)
        except ValueError as error:
            raise HTTPException(status_code=400, detail="Invalid payment event") from error
        payment = session.scalar(
            select(Payment).where(Payment.provider_reference == event.provider_reference).with_for_update()
        )
        if payment is None:
            raise HTTPException(status_code=404, detail="Payment reference not found")
        if payment.amount_minor != event.amount_minor:
            raise HTTPException(status_code=409, detail="Payment amount does not match the initialized amount")
        if payment.status == event.status:
            return {"status": payment.status}
        if payment.status != "pending":
            raise HTTPException(status_code=409, detail="Payment is already in a terminal state")
        payment.status = event.status
        payment.provider_event_id = event.event_id
        session.commit()
        return {"status": payment.status}

    @router.get("/payments/{payment_id}", response_model=PaymentResponse)
    def get_payment(
        payment_id: UUID,
        user: Annotated[User, Depends(current_user)],
        session: Annotated[Session, Depends(get_session)],
    ) -> Payment:
        payment = session.get(Payment, payment_id)
        if payment is None:
            raise HTTPException(status_code=404, detail="Payment not found")
        booking = session.get(Booking, payment.booking_id)
        if booking is None or user.id not in {booking.customer_id, booking.provider_id}:
            raise HTTPException(status_code=403, detail="You cannot access this payment")
        return payment

    @router.get("/providers/me/earnings", response_model=list[EarningResponse])
    def list_earnings(
        user: Annotated[User, Depends(require_roles("plumber"))],
        session: Annotated[Session, Depends(get_session)],
    ) -> list[ProviderEarning]:
        return list(
            session.scalars(
                select(ProviderEarning)
                .where(ProviderEarning.provider_id == user.id)
                .order_by(ProviderEarning.created_at.desc())
            ).all()
        )

    return router