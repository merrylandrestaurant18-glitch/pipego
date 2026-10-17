from typing import Protocol
from uuid import uuid4


class PaymentProvider(Protocol):
    name: str

    def initialize(self, amount_minor: int, currency: str, idempotency_key: str) -> str:
        """Create a provider-side payment session and return its reference."""


class MockPaymentProvider:
    name = "mock"

    def initialize(self, amount_minor: int, currency: str, idempotency_key: str) -> str:
        return f"mock_{uuid4().hex}"