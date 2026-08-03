from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from bus_booking.api import app, engine


client = TestClient(app)


def setup_module() -> None:
    engine._trips.clear()
    engine._bookings.clear()


def test_api_booking_flow() -> None:
    departure_time = (datetime.now(timezone.utc) + timedelta(hours=18)).isoformat()
    response = client.post(
        "/trips",
        json={"trip_id": "api-route", "total_seats": 5, "fare_per_seat": 250, "departure_time": departure_time},
    )
    assert response.status_code == 200

    hold_response = client.post(
        "/trips/api-route/holds",
        json={"user_id": "api-user", "seat_numbers": [1, 2], "hold_minutes": 10},
    )
    assert hold_response.status_code == 200
    hold_id = hold_response.json()["hold_id"]

    confirm_response = client.post(f"/holds/{hold_id}/confirm")
    assert confirm_response.status_code == 200
    booking_id = confirm_response.json()["booking_id"]

    cancel_response = client.post(f"/bookings/{booking_id}/cancel")
    assert cancel_response.status_code == 200
    assert cancel_response.json()["refund_percentage"] in {25, 50, 75, 90}


def test_feedback_endpoint() -> None:
    response = client.post("/feedback/analyze", json={"text": "Late bus, rude staff, and poor communication."})
    assert response.status_code == 200
    body = response.json()
    assert body["sentiment"] == "negative"
    assert "punctuality" in body["topics"]


def test_list_trips_endpoint() -> None:
    response = client.get("/trips")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
