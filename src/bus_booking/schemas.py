from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import UUID, uuid4


class HoldStatus(str, Enum):
    ACTIVE = "active"
    CONFIRMED = "confirmed"
    EXPIRED = "expired"
    RELEASED = "released"


class BookingStatus(str, Enum):
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


@dataclass(slots=True)
class SeatHold:
    hold_id: UUID
    trip_id: str
    user_id: str
    seat_numbers: list[int]
    expires_at: datetime
    status: HoldStatus = HoldStatus.ACTIVE
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass(slots=True)
class Booking:
    booking_id: UUID
    trip_id: str
    user_id: str
    seat_numbers: list[int]
    total_amount: float
    status: BookingStatus = BookingStatus.CONFIRMED
    booked_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    cancelled_at: datetime | None = None
    refund_amount: float = 0.0
    refund_percentage: int = 0
    cancellation_reason: str | None = None


@dataclass(slots=True)
class Trip:
    trip_id: str
    total_seats: int
    fare_per_seat: float
    departure_time: datetime
    booked_seats: set[int] = field(default_factory=set)
    active_holds: dict[UUID, SeatHold] = field(default_factory=dict)

    def seat_inventory(self) -> list[int]:
        return list(range(1, self.total_seats + 1))

    def available_seats(self, now: datetime) -> list[int]:
        self._purge_expired_holds(now)
        held_seats = self._held_seats()
        return [seat for seat in self.seat_inventory() if seat not in self.booked_seats and seat not in held_seats]

    def _held_seats(self) -> set[int]:
        seats: set[int] = set()
        for hold in self.active_holds.values():
            if hold.status == HoldStatus.ACTIVE:
                seats.update(hold.seat_numbers)
        return seats

    def _purge_expired_holds(self, now: datetime) -> None:
        for hold in self.active_holds.values():
            if hold.status == HoldStatus.ACTIVE and hold.expires_at <= now:
                hold.status = HoldStatus.EXPIRED


@dataclass(slots=True)
class RefundPolicy:
    slabs: list[tuple[int, int]] = field(default_factory=lambda: [(72, 90), (24, 75), (6, 50), (0, 25)])

    def percentage_for(self, hours_before_departure: float) -> int:
        for threshold, percentage in self.slabs:
            if hours_before_departure >= threshold:
                return percentage
        return 0


@dataclass(slots=True)
class BookingResponse:
    booking: Booking
    hold: SeatHold | None = None
    available_seats: list[int] | None = None
    refund_policy: RefundPolicy | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


def new_uuid() -> UUID:
    return uuid4()
