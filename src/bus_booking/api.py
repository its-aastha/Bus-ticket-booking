from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, NoReturn
from uuid import UUID

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .engine import BookingError, BusBookingEngine

app = FastAPI(title="Bus Booking Backend Engine", version="0.1.0", docs_url=None, redoc_url=None)
engine = BusBookingEngine()


class CreateTripRequest(BaseModel):
    trip_id: str = Field(min_length=1)
    total_seats: int = Field(gt=0)
    fare_per_seat: float = Field(gt=0)
    departure_time: datetime


class HoldSeatsRequest(BaseModel):
    user_id: str = Field(min_length=1)
    seat_numbers: list[int]
    hold_minutes: int = Field(default=15, gt=0, le=120)


class FeedbackRequest(BaseModel):
    text: str = Field(min_length=1)


def _handle_booking_error(error: BookingError) -> NoReturn:
    status_code = 404 if error.__class__.__name__.startswith("NotFound") else 400
    raise HTTPException(status_code=status_code, detail=str(error))


def _seed_demo_trips() -> None:
    if engine.list_trips():
        return

    now = datetime.now(timezone.utc)
    demo_trips = [
        {"trip_id": "bus-101", "total_seats": 40, "fare_per_seat": 500.0, "departure_time": now},
        {"trip_id": "bus-202", "total_seats": 32, "fare_per_seat": 650.0, "departure_time": now},
        {"trip_id": "bus-303", "total_seats": 28, "fare_per_seat": 750.0, "departure_time": now},
    ]

    for trip in demo_trips:
        engine.create_trip(**trip)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.on_event("startup")
def startup_seed() -> None:
    _seed_demo_trips()


@app.get("/")
def root() -> dict[str, str]:
    return {
        "message": "Bus Booking Backend Engine is running.",
        "health": "/health",
        "trips": "/trips",
        "openapi": "/openapi.json",
    }


@app.get("/trips")
def list_trips() -> list[dict[str, Any]]:
    return engine.list_trips()


@app.post("/trips")
def create_trip(request: CreateTripRequest) -> dict[str, Any]:
    try:
        trip = engine.create_trip(
            trip_id=request.trip_id,
            total_seats=request.total_seats,
            fare_per_seat=request.fare_per_seat,
            departure_time=request.departure_time,
        )
        return engine.snapshot_trip(trip.trip_id)
    except BookingError as error:
        _handle_booking_error(error)


@app.get("/trips/{trip_id}")
def get_trip(trip_id: str) -> dict[str, Any]:
    try:
        return engine.snapshot_trip(trip_id)
    except BookingError as error:
        _handle_booking_error(error)


@app.get("/trips/{trip_id}/availability")
def get_availability(trip_id: str) -> dict[str, Any]:
    try:
        return {"trip_id": trip_id, "available_seats": engine.list_available_seats(trip_id)}
    except BookingError as error:
        _handle_booking_error(error)


@app.post("/trips/{trip_id}/holds")
def hold_seats(trip_id: str, request: HoldSeatsRequest) -> dict[str, Any]:
    try:
        hold = engine.hold_seats(trip_id=trip_id, user_id=request.user_id, seat_numbers=request.seat_numbers, hold_minutes=request.hold_minutes)
        return {
            "hold_id": str(hold.hold_id),
            "trip_id": hold.trip_id,
            "user_id": hold.user_id,
            "seat_numbers": hold.seat_numbers,
            "expires_at": hold.expires_at.isoformat(),
            "status": hold.status,
        }
    except BookingError as error:
        _handle_booking_error(error)


@app.post("/holds/{hold_id}/confirm")
def confirm_booking(hold_id: UUID) -> dict[str, Any]:
    try:
        booking = engine.confirm_booking(hold_id)
        return {
            "booking_id": str(booking.booking_id),
            "trip_id": booking.trip_id,
            "user_id": booking.user_id,
            "seat_numbers": booking.seat_numbers,
            "total_amount": booking.total_amount,
            "status": booking.status,
        }
    except BookingError as error:
        _handle_booking_error(error)


@app.post("/bookings/{booking_id}/cancel")
def cancel_booking(booking_id: UUID) -> dict[str, Any]:
    try:
        booking = engine.cancel_booking(booking_id)
        return {
            "booking_id": str(booking.booking_id),
            "status": booking.status,
            "refund_amount": booking.refund_amount,
            "refund_percentage": booking.refund_percentage,
        }
    except BookingError as error:
        _handle_booking_error(error)


@app.post("/feedback/analyze")
def analyze_feedback(request: FeedbackRequest) -> dict[str, Any]:
    analysis = engine.analyze_feedback(request.text)
    return asdict(analysis)
