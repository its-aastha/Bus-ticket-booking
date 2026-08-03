# Bus Booking system – Project Report

## 1. Project Title

**Bus Booking system**

---

## 2. Project Objective

The Bus Booking Backend Engine is a REST API-based backend application developed to manage bus seat reservations efficiently. The system ensures that there is no two users can book the same time by implementing a temporary seat hold mechanism before booking confirmation. It also supports booking management, cancellations, refunds, and customer feedback analysis.

---

## 3. Technologies Used

* **Programming Language:** Python
* **Backend Framework:** FastAPI
* **Server:** Uvicorn
* **Data Validation:** Pydantic
* **Unique ID Generation:** UUID
* **Testing:** Pytest
* **Storage:** In-Memory Data Structures

---

## 4. Key Features

* Create and manage bus trips
* View real-time seat availability
* Temporary seat hold before booking
* Confirm seat bookings
* Cancel bookings
* Refund calculation based on cancellation policy (25%)
* Prevent duplicate seat bookings
* RESTful API architecture

---

## 5. Project Modules

### API Module

Handles all REST API endpoints for trips, bookings, cancellations, refunds, and feedback.

### Booking Engine

Implements the core business logic, including seat availability, holds, booking confirmation, and cancellation.

### Data Models

Defines request and response models using Pydantic for data validation.

### Feedback Module

Analyzes customer feedback and identifies sentiment and key topics.

---

## 6. Working of the System

1. An administrator creates a bus trip with seat details.
2. Users check available seats using the availability API.
3. Selected seats are temporarily placed on hold.
4. The user confirms the booking within the hold period.
5. If confirmed, the seats become permanently booked.
6. If the booking is cancelled, the system calculates the refund based on predefined policies that is the 25% and releases the seats.
7. Customer feedback can be analyzed to determine overall sentiment.

---

## 7. API Overview

| API                                | Purpose                   |
| ---------------------------------- | ------------------------- |
| GET /health                        | Check server status       |
| POST /trips                        | Create a new trip         |
| GET /trips                         | View all trips            |
| GET /trips/{trip_id}/availability  | Check seat availability   |
| POST /trips/{trip_id}/holds        | Hold selected seats       |
| POST /holds/{hold_id}/confirm      | Confirm booking           |
| POST /bookings/{booking_id}/cancel | Cancel booking            |
| POST /feedback/analyze             | Analyze customer feedback |

---

## 8. Advantages

* Prevents duplicate seat bookings
* hold the seat for 15 minutes
* Fast and lightweight backend implementation
* Modular and scalable architecture
* Easy API integration with any frontend


---

## 9. Limitations

* Uses in-memory storage (no database)
* No user authentication
* No payment gateway integration
* No frontend interface

---

## 10. Conclusion

The **Bus Booking Backend Engine** is a backend-focused application designed to manage bus reservations through REST APIs. It effectively handles seat availability, temporary holds, booking confirmation, cancellations, and refunds 25 % while preventing duplicate seat bookings. The project demonstrates the core concepts of backend system design and provides a strong foundation for building a complete bus reservation platform.
