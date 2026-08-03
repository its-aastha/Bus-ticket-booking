from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest

from bus_booking.engine import BusBookingEngine, InvalidStateError, SeatConflictError
from bus_booking.schemas import BookingStatus, HoldStatus


class Clock:
    def __init__(self, start: datetime):
        self.current = start

    def now(self) -> datetime:
        return self.current

    def advance(self, **kwargs) -> None:
        self.current += timedelta(**kwargs)


@pytest.fixture()
def clock() -> Clock:
    return Clock(datetime(2026, 8, 3, 10, 0, 0, tzinfo=timezone.utc))


@pytest.fixture()
def engine(clock: Clock) -> BusBookingEngine:
    return BusBookingEngine(now_provider=clock.now)


def test_hold_confirm_and_cancel_flow(engine: BusBookingEngine, clock: Clock) -> None:
    engine.create_trip("route-1", total_seats=4, fare_per_seat=500.0, departure_time=clock.now() + timedelta(hours=30))

    hold = engine.hold_seats("route-1", "user-1", [1, 2], hold_minutes=10)
    assert hold.status == HoldStatus.ACTIVE
    assert engine.list_available_seats("route-1") == [3, 4]

    booking = engine.confirm_booking(hold.hold_id)
    assert booking.status == BookingStatus.CONFIRMED
    assert booking.seat_numbers == [1, 2]
    assert engine.list_available_seats("route-1") == [3, 4]

    clock.advance(hours=10)
    cancelled = engine.cancel_booking(booking.booking_id)
    assert cancelled.status == BookingStatus.CANCELLED
    assert cancelled.refund_percentage == 50
    assert cancelled.refund_amount == 500.0
    assert engine.list_available_seats("route-1") == [1, 2, 3, 4]


def test_expired_hold_releases_seats(engine: BusBookingEngine, clock: Clock) -> None:
    engine.create_trip("route-2", total_seats=3, fare_per_seat=400.0, departure_time=clock.now() + timedelta(hours=20))
    hold = engine.hold_seats("route-2", "user-2", [1], hold_minutes=5)
    clock.advance(minutes=6)

    assert engine.list_available_seats("route-2") == [1, 2, 3]
    with pytest.raises(InvalidStateError):
        engine.confirm_booking(hold.hold_id)


def test_conflicting_seat_hold_is_rejected(engine: BusBookingEngine, clock: Clock) -> None:
    engine.create_trip("route-3", total_seats=2, fare_per_seat=300.0, departure_time=clock.now() + timedelta(hours=12))
    engine.hold_seats("route-3", "user-3", [1], hold_minutes=15)

    with pytest.raises(SeatConflictError):
        engine.hold_seats("route-3", "user-4", [1], hold_minutes=15)


def test_feedback_analysis(engine: BusBookingEngine) -> None:
    analysis = engine.analyze_feedback("The bus was clean, the staff were friendly, and the ride was smooth.")
    assert analysis.sentiment == "positive"
    assert "cleanliness" in analysis.topics
    assert analysis.confidence >= 0.5
