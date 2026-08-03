from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from typing import Callable
from uuid import UUID

from .feedback import FeedbackAnalyzer, FeedbackAnalysis
from .schemas import (
    Booking,
    BookingStatus,
    HoldStatus,
    RefundPolicy,
    SeatHold,
    Trip,
    new_uuid,
)


class BookingError(ValueError):
    pass


class NotFoundError(BookingError):
    pass


class InvalidStateError(BookingError):
    pass


class SeatConflictError(BookingError):
    pass


class BusBookingEngine:
    def __init__(self, now_provider: Callable[[], datetime] | None = None, refund_policy: RefundPolicy | None = None):
        self._now = now_provider or (lambda: datetime.now(timezone.utc))
        self._refund_policy = refund_policy or RefundPolicy()
        self._trips: dict[str, Trip] = {}
        self._bookings: dict[UUID, Booking] = {}
        self._feedback = FeedbackAnalyzer()

    def create_trip(self, trip_id: str, total_seats: int, fare_per_seat: float, departure_time: datetime) -> Trip:
        if trip_id in self._trips:
            raise InvalidStateError(f"Trip '{trip_id}' already exists.")
        if total_seats <= 0:
            raise InvalidStateError("total_seats must be positive.")
        if fare_per_seat <= 0:
            raise InvalidStateError("fare_per_seat must be positive.")
        trip = Trip(trip_id=trip_id, total_seats=total_seats, fare_per_seat=fare_per_seat, departure_time=departure_time)
        self._trips[trip_id] = trip
        return trip

    def get_trip(self, trip_id: str) -> Trip:
        trip = self._trips.get(trip_id)
        if trip is None:
            raise NotFoundError(f"Trip '{trip_id}' was not found.")
        return trip

    def list_available_seats(self, trip_id: str) -> list[int]:
        trip = self.get_trip(trip_id)
        return trip.available_seats(self._now())

    def list_trips(self) -> list[dict[str, object]]:
        return [self.snapshot_trip(trip_id) for trip_id in sorted(self._trips)]

    def hold_seats(self, trip_id: str, user_id: str, seat_numbers: list[int], hold_minutes: int = 15) -> SeatHold:
        trip = self.get_trip(trip_id)
        self._validate_seats(trip, seat_numbers)
        self._release_expired_holds(trip)
        self._ensure_seats_available(trip, seat_numbers)
        hold = SeatHold(
            hold_id=new_uuid(),
            trip_id=trip.trip_id,
            user_id=user_id,
            seat_numbers=sorted(set(seat_numbers)),
            expires_at=self._now() + timedelta(minutes=hold_minutes),
        )
        trip.active_holds[hold.hold_id] = hold
        return hold

    def confirm_booking(self, hold_id: UUID) -> Booking:
        hold, trip = self._find_hold(hold_id)
        self._release_expired_holds(trip)
        if hold.status != HoldStatus.ACTIVE:
            raise InvalidStateError("Only active holds can be confirmed.")
        trip.booked_seats.update(hold.seat_numbers)
        hold.status = HoldStatus.CONFIRMED
        total_amount = len(hold.seat_numbers) * trip.fare_per_seat
        booking = Booking(
            booking_id=new_uuid(),
            trip_id=trip.trip_id,
            user_id=hold.user_id,
            seat_numbers=list(hold.seat_numbers),
            total_amount=total_amount,
        )
        self._bookings[booking.booking_id] = booking
        del trip.active_holds[hold.hold_id]
        return booking

    def cancel_booking(self, booking_id: UUID) -> Booking:
        booking = self._bookings.get(booking_id)
        if booking is None:
            raise NotFoundError(f"Booking '{booking_id}' was not found.")
        if booking.status == BookingStatus.CANCELLED:
            raise InvalidStateError("Booking is already cancelled.")
        trip = self.get_trip(booking.trip_id)
        hours_before_departure = max((trip.departure_time - self._now()).total_seconds() / 3600, 0)
        refund_percentage = self._refund_policy.percentage_for(hours_before_departure)
        refund_amount = round(booking.total_amount * refund_percentage / 100, 2)
        booking.status = BookingStatus.CANCELLED
        booking.cancelled_at = self._now()
        booking.refund_percentage = refund_percentage
        booking.refund_amount = refund_amount
        booking.cancellation_reason = "cancelled_by_customer"
        for seat_number in booking.seat_numbers:
            trip.booked_seats.discard(seat_number)
        return booking

    def analyze_feedback(self, text: str) -> FeedbackAnalysis:
        return self._feedback.analyze(text)

    def snapshot_trip(self, trip_id: str) -> dict[str, object]:
        trip = self.get_trip(trip_id)
        self._release_expired_holds(trip)
        return {
            "trip_id": trip.trip_id,
            "total_seats": trip.total_seats,
            "fare_per_seat": trip.fare_per_seat,
            "departure_time": trip.departure_time.isoformat(),
            "booked_seats": sorted(trip.booked_seats),
            "available_seats": trip.available_seats(self._now()),
            "active_holds": [asdict(hold) for hold in trip.active_holds.values()],
        }

    def _find_hold(self, hold_id: UUID) -> tuple[SeatHold, Trip]:
        for trip in self._trips.values():
            hold = trip.active_holds.get(hold_id)
            if hold is not None:
                return hold, trip
        raise NotFoundError(f"Hold '{hold_id}' was not found.")

    def _validate_seats(self, trip: Trip, seat_numbers: list[int]) -> None:
        if not seat_numbers:
            raise InvalidStateError("At least one seat must be requested.")
        unique_seats = set(seat_numbers)
        if len(unique_seats) != len(seat_numbers):
            raise InvalidStateError("Duplicate seat numbers are not allowed.")
        invalid = [seat for seat in seat_numbers if seat < 1 or seat > trip.total_seats]
        if invalid:
            raise InvalidStateError(f"Invalid seat numbers requested: {invalid}.")

    def _ensure_seats_available(self, trip: Trip, seat_numbers: list[int]) -> None:
        available = set(trip.available_seats(self._now()))
        unavailable = [seat for seat in seat_numbers if seat not in available]
        if unavailable:
            raise SeatConflictError(f"Seats already reserved or held: {unavailable}.")

    def _release_expired_holds(self, trip: Trip) -> None:
        trip._purge_expired_holds(self._now())
