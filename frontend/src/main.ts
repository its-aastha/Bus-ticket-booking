import { jsPDF } from 'jspdf';

import { cancelBooking, confirmHold, createHold, listTrips } from './api';
import type { BookingReceipt, SeatHold, TripSnapshot } from './types';
import './styles.css';

type NoticeKind = 'info' | 'success' | 'error';

type AppState = {
  trips: TripSnapshot[];
  selectedTripId: string | null;
  selectedSeatNumbers: Set<number>;
  userId: string;
  holdMinutes: number;
  currentHold: SeatHold | null;
  currentBooking: BookingReceipt | null;
  bookingMessage: string;
  bookingKind: NoticeKind;
  loading: boolean;
  lastUpdated: string | null;
};

const state: AppState = {
  trips: [],
  selectedTripId: null,
  selectedSeatNumbers: new Set<number>(),
  userId: 'guest-1',
  holdMinutes: 15,
  currentHold: null,
  currentBooking: null,
  bookingMessage: 'Select a trip, choose seats, and hold them before confirming.',
  bookingKind: 'info',
  loading: false,
  lastUpdated: null,
};

const root = document.querySelector<HTMLDivElement>('#app')!;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);
}

function selectedTrip(): TripSnapshot | null {
  return state.trips.find((trip) => trip.trip_id === state.selectedTripId) ?? null;
}

function activeHeldSeats(trip: TripSnapshot | null): Set<number> {
  if (!trip) {
    return new Set<number>();
  }

  return new Set(
    trip.active_holds
      .filter((hold) => hold.status === 'active')
      .flatMap((hold) => hold.seat_numbers),
  );
}

function updateBookingMessage(message: string, kind: NoticeKind): void {
  state.bookingMessage = message;
  state.bookingKind = kind;
}

async function refreshTrips(preserveSelectedSeats = true): Promise<void> {
  state.loading = true;
  render();

  try {
    const trips = await listTrips();
    state.trips = trips;

    if (!state.selectedTripId && trips.length > 0) {
      state.selectedTripId = trips[0]?.trip_id ?? null;
    }

    const trip = selectedTrip();
    if (trip) {
      const available = new Set(trip.available_seats);
      const before = new Set(state.selectedSeatNumbers);
      state.selectedSeatNumbers = new Set(
        [...state.selectedSeatNumbers].filter((seat) => available.has(seat)),
      );

      if (
        preserveSelectedSeats &&
        before.size > 0 &&
        state.selectedSeatNumbers.size !== before.size
      ) {
        updateBookingMessage('Some seats became unavailable and were removed from your selection.', 'info');
      }
    }

    state.lastUpdated = new Date().toLocaleTimeString();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load trips.';
    updateBookingMessage(message, 'error');
  } finally {
    state.loading = false;
    render();
  }
}

function toggleSeat(seatNumber: number): void {
  const trip = selectedTrip();
  if (!trip) {
    return;
  }

  const available = new Set(trip.available_seats);
  if (!available.has(seatNumber)) {
    updateBookingMessage('That seat is already booked or held by another user.', 'error');
    render();
    return;
  }

  if (state.selectedSeatNumbers.has(seatNumber)) {
    state.selectedSeatNumbers.delete(seatNumber);
  } else {
    state.selectedSeatNumbers.add(seatNumber);
  }

  updateBookingMessage('Seat selection updated.', 'info');
  render();
}

function selectTrip(tripId: string): void {
  state.selectedTripId = tripId;
  state.selectedSeatNumbers = new Set<number>();
  state.currentHold = null;
  state.currentBooking = null;
  updateBookingMessage('Trip changed. Choose the seats you want to hold.', 'info');
  render();
}

function currentTripForBooking(booking: BookingReceipt): TripSnapshot | null {
  return state.trips.find((trip) => trip.trip_id === booking.trip_id) ?? null;
}

function downloadBookingPdf(booking: BookingReceipt): void {
  const trip = currentTripForBooking(booking);
  const doc = new jsPDF();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Bus Booking Receipt', 14, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);

  const lines = [
    `Booking ID: ${booking.booking_id}`,
    `Trip ID: ${booking.trip_id}`,
    `User ID: ${booking.user_id}`,
    `Departure Time: ${formatTime(booking.departure_time)}`,
    `Seats: ${booking.seat_numbers.join(', ')}`,
    `Fare per Seat: ${formatCurrency(booking.fare_per_seat)}`,
    `Total Price: ${formatCurrency(booking.total_amount)}`,
    `Status: ${booking.status}`,
    trip ? `Available Seats Remaining: ${trip.available_seats.length}` : undefined,
    `Booked At: ${formatTime(booking.booked_at)}`,
  ].filter((line): line is string => Boolean(line));

  let y = 32;
  for (const line of lines) {
    doc.text(line, 14, y);
    y += 8;
  }

  if (booking.status === 'cancelled') {
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.text('Cancellation Details', 14, y);
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.text(`Refund Percentage: ${booking.refund_percentage ?? 0}%`, 14, y);
    y += 8;
    doc.text(`Refund Amount: ${formatCurrency(booking.refund_amount ?? 0)}`, 14, y);
    y += 8;
    if (booking.cancelled_at) {
      doc.text(`Cancelled At: ${formatTime(booking.cancelled_at)}`, 14, y);
    }
  }

  doc.save(`bus-booking-${booking.booking_id}.pdf`);
}

async function cancelCurrentBooking(): Promise<void> {
  if (!state.currentBooking) {
    updateBookingMessage('There is no confirmed booking to cancel.', 'error');
    render();
    return;
  }

  if (state.currentBooking.status === 'cancelled') {
    updateBookingMessage('This booking has already been cancelled.', 'info');
    render();
    return;
  }

  try {
    const cancelled = await cancelBooking(state.currentBooking.booking_id);
    state.currentBooking = {
      ...state.currentBooking,
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      refund_amount: cancelled.refund_amount,
      refund_percentage: cancelled.refund_percentage,
    };
    updateBookingMessage(
      `Booking cancelled. Refund ${formatCurrency(cancelled.refund_amount)} (${cancelled.refund_percentage}%).`,
      'success',
    );
    await refreshTrips();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to cancel the booking.';
    updateBookingMessage(message, 'error');
    await refreshTrips();
  }
}

async function holdSelectedSeats(): Promise<void> {
  const trip = selectedTrip();
  if (!trip) {
    updateBookingMessage('Choose a trip first.', 'error');
    render();
    return;
  }

  const seatNumbers = [...state.selectedSeatNumbers].sort((left, right) => left - right);
  if (seatNumbers.length === 0) {
    updateBookingMessage('Select at least one seat to hold.', 'error');
    render();
    return;
  }

  try {
    const hold = await createHold(trip.trip_id, state.userId.trim(), seatNumbers, state.holdMinutes);
    const nextHold: SeatHold = {
      hold_id: hold.hold_id,
      trip_id: hold.trip_id,
      user_id: hold.user_id,
      seat_numbers: hold.seat_numbers,
      expires_at: hold.expires_at,
      status: hold.status,
      created_at: new Date().toISOString(),
    };

    state.currentHold = nextHold;
    state.selectedSeatNumbers = new Set<number>();
    updateBookingMessage(
      `Seats ${seatNumbers.join(', ')} are on hold until ${formatTime(hold.expires_at)}.`,
      'success',
    );
    await refreshTrips(false);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to place the hold.';
    updateBookingMessage(message, 'error');
    await refreshTrips();
  }
}

async function confirmCurrentHold(): Promise<void> {
  if (!state.currentHold) {
    updateBookingMessage('There is no active hold to confirm.', 'error');
    render();
    return;
  }

  try {
    const confirmed = await confirmHold(state.currentHold.hold_id);
    const trip = selectedTrip();
    if (!trip) {
      updateBookingMessage('Trip details are no longer available for this booking.', 'error');
      await refreshTrips();
      return;
    }

    const booking: BookingReceipt = {
      booking_id: confirmed.booking_id,
      trip_id: confirmed.trip_id,
      user_id: confirmed.user_id,
      seat_numbers: confirmed.seat_numbers,
      total_amount: confirmed.total_amount,
      status: confirmed.status,
      departure_time: trip.departure_time,
      fare_per_seat: trip.fare_per_seat,
      booked_at: new Date().toISOString(),
    };

    state.currentBooking = booking;
    updateBookingMessage(
      `Booking confirmed for seats ${confirmed.seat_numbers.join(', ')}. Total amount: ${formatCurrency(confirmed.total_amount)}.`,
      'success',
    );
    state.currentHold = null;
    downloadBookingPdf(booking);
    await refreshTrips();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to confirm the hold.';
    updateBookingMessage(message, 'error');
    await refreshTrips();
  }
}

function seatStatus(trip: TripSnapshot, seatNumber: number): 'available' | 'held' | 'booked' | 'selected' {
  if (trip.booked_seats.includes(seatNumber)) {
    return 'booked';
  }

  if (activeHeldSeats(trip).has(seatNumber)) {
    return 'held';
  }

  if (state.selectedSeatNumbers.has(seatNumber)) {
    return 'selected';
  }

  return 'available';
}

function renderSeatMap(trip: TripSnapshot): string {
  const seats = Array.from({ length: trip.total_seats }, (_, index) => index + 1);
  const rows: number[][] = [];

  for (let index = 0; index < seats.length; index += 4) {
    rows.push(seats.slice(index, index + 4));
  }

  const rowMarkup = rows
    .map((rowSeats, rowIndex) => {
      const leftSeats = rowSeats.slice(0, 2);
      const rightSeats = rowSeats.slice(2, 4);

      return `
        <div class="bus-row" aria-label="Seat row ${rowIndex + 1}">
          <div class="bus-side bus-side-left">
            ${leftSeats
              .map((seatNumber) => renderSeatButton(trip, seatNumber))
              .join('')}
          </div>
          <div class="bus-aisle" aria-hidden="true"></div>
          <div class="bus-side bus-side-right">
            ${rightSeats
              .map((seatNumber) => renderSeatButton(trip, seatNumber))
              .join('')}
          </div>
        </div>
      `;
    })
    .join('');

  return `
    <div class="bus-layout">
      <div class="bus-front">
        <div class="bus-front-label">Front of bus</div>
        <div class="bus-front-details">
          <span>Driver</span>
          <span>Door</span>
        </div>
      </div>
      <div class="bus-seatdeck">
        ${rowMarkup}
      </div>
    </div>
  `;
}

function renderSeatButton(trip: TripSnapshot, seatNumber: number): string {
  const status = seatStatus(trip, seatNumber);
  const isDisabled = status === 'booked' || status === 'held';
  const label =
    status === 'booked'
      ? 'Booked'
      : status === 'held'
        ? 'Held'
        : status === 'selected'
          ? 'Selected'
          : 'Available';

  return `
    <button
      class="seat ${status}"
      data-seat-number="${seatNumber}"
      ${isDisabled ? 'disabled' : ''}
      aria-pressed="${status === 'selected'}"
      aria-label="Seat ${seatNumber}, ${label}"
      type="button"
    >
      <div>
        <strong>${seatNumber}</strong>
        <span>${label}</span>
      </div>
    </button>
  `;
}

function renderTrips(): string {
  if (state.trips.length === 0) {
    return '<div class="empty-state">No trips are available yet. Create trips from the backend first or seed the demo data.</div>';
  }

  return state.trips
    .map((trip) => {
      const isSelected = trip.trip_id === state.selectedTripId;
      const heldSeatCount = trip.active_holds
        .filter((hold) => hold.status === 'active')
        .reduce((count, hold) => count + hold.seat_numbers.length, 0);

      return `
        <article class="trip-card ${isSelected ? 'is-selected' : ''}">
          <button type="button" data-trip-id="${escapeHtml(trip.trip_id)}">
            <div class="eyebrow">${isSelected ? 'Active route' : 'Select route'}</div>
            <h3>${escapeHtml(trip.trip_id)}</h3>
            <p class="subtitle">Departure ${formatTime(trip.departure_time)}</p>

            <div class="trip-meta">
              <div class="metric">
                <span class="label">Fare per seat</span>
                <strong>${formatCurrency(trip.fare_per_seat)}</strong>
              </div>
              <div class="metric">
                <span class="label">Available seats</span>
                <strong>${trip.available_seats.length}</strong>
              </div>
              <div class="metric">
                <span class="label">Active holds</span>
                <strong>${heldSeatCount}</strong>
              </div>
            </div>
          </button>
        </article>
      `;
    })
    .join('');
}

function renderBookingSummary(): string {
  if (!state.currentBooking) {
    return '<div class="empty-state">No confirmed booking yet. Your booking receipt will appear here after confirmation.</div>';
  }

  const booking = state.currentBooking;

  return `
    <div class="booking-card ${booking.status}">
      <div class="booking-head">
        <div>
          <div class="eyebrow">Booking receipt</div>
          <h3>${booking.trip_id}</h3>
          <p class="subtitle">Booking ID ${escapeHtml(booking.booking_id)}</p>
        </div>
        <div class="booking-status ${booking.status}">${booking.status}</div>
      </div>

      <div class="receipt-grid">
        <div class="detail-row"><span>Departure time</span><strong>${formatTime(booking.departure_time)}</strong></div>
        <div class="detail-row"><span>Seats</span><strong>${booking.seat_numbers.join(', ')}</strong></div>
        <div class="detail-row"><span>Fare per seat</span><strong>${formatCurrency(booking.fare_per_seat)}</strong></div>
        <div class="detail-row"><span>Total price</span><strong>${formatCurrency(booking.total_amount)}</strong></div>
      </div>

      ${booking.status === 'cancelled' ? `
        <div class="refund-box">
          <div class="detail-row"><span>Refund percentage</span><strong>${booking.refund_percentage ?? 0}%</strong></div>
          <div class="detail-row"><span>Refund amount</span><strong>${formatCurrency(booking.refund_amount ?? 0)}</strong></div>
        </div>
      ` : ''}

      <div class="toolbar booking-actions">
        <button class="button button-secondary" id="download-receipt" type="button">Download PDF</button>
        <button class="button button-ghost" id="cancel-booking" type="button" ${booking.status === 'cancelled' ? 'disabled' : ''}>
          Cancel booking
        </button>
      </div>
    </div>
  `;
}

function render(): void {
  const trip = selectedTrip();

  root.innerHTML = `
    <div class="shell">
      <section class="hero">
        <div class="hero-top">
          <div>
            <div class="eyebrow">Bus booking control panel</div>
            <h1>Seat allocation that blocks duplicate selection.</h1>
            <p>
              Live trip availability, seat holds, and booking confirmation all stay synchronized with the FastAPI backend.
              If another user holds a seat first, the frontend disables it after refresh and shows the server conflict.
            </p>
          </div>
          <div class="status-row">
            <div class="status-chip">${state.loading ? 'Refreshing availability...' : 'Live availability enabled'}</div>
            <div class="status-chip">${state.lastUpdated ? `Updated ${escapeHtml(state.lastUpdated)}` : 'Waiting for first sync'}</div>
          </div>
        </div>
        <div class="footer-note">Use the same user ID while testing a flow, or switch it to simulate another customer.</div>
      </section>

      <div class="layout">
        <section class="panel">
          <div class="panel-header">
            <div>
              <h2>Trips</h2>
              <p>Pick a route, then choose seats that are still available.</p>
            </div>
            <button class="button button-secondary" id="refresh-trips" type="button">Refresh</button>
          </div>
          <div class="panel-body">
            <div class="trip-list">
              ${renderTrips()}
            </div>
          </div>
        </section>

        <aside class="panel">
          <div class="panel-header">
            <div>
              <h3>Seat allocation</h3>
              <p>Selected seats stay local until you place a hold.</p>
            </div>
          </div>
          <div class="panel-body bus">
            <div class="controls">
              <div class="controls-grid">
                <div class="field">
                  <label for="user-id">User ID</label>
                  <input id="user-id" value="${escapeHtml(state.userId)}" placeholder="guest-1" />
                </div>
                <div class="field">
                  <label for="hold-minutes">Hold minutes</label>
                  <input id="hold-minutes" type="number" min="1" max="120" value="${state.holdMinutes}" />
                </div>
              </div>

              <div class="notice ${state.bookingKind}">${escapeHtml(state.bookingMessage)}</div>

              <div class="toolbar">
                <button class="button button-primary" id="hold-seats" type="button" ${trip ? '' : 'disabled'}>
                  Hold selected seats
                </button>
                <button class="button button-ghost" id="confirm-hold" type="button" ${state.currentHold ? '' : 'disabled'}>
                  Confirm hold
                </button>
              </div>
            </div>

            ${trip ? `
              <div>
                <div class="legend">
                  <span class="legend-item"><span class="swatch" style="background:#dbe4ee"></span>Available</span>
                  <span class="legend-item"><span class="swatch" style="background:#0f766e"></span>Selected</span>
                  <span class="legend-item"><span class="swatch" style="background:#f59e0b"></span>Held</span>
                  <span class="legend-item"><span class="swatch" style="background:#1e293b"></span>Booked</span>
                </div>
                <div class="seat-map" style="margin-top:16px;">
                  ${renderSeatMap(trip)}
                </div>
              </div>
            ` : '<div class="empty-state">Select a trip to view the bus layout.</div>'}

            <div>
              <h3 style="margin:0 0 10px;">Selection summary</h3>
              <div class="selection-summary">
                ${trip ? [...state.selectedSeatNumbers].sort((left, right) => left - right).map((seat) => `<span class="pill">Seat ${seat}</span>`).join('') : '<span class="pill">No trip selected</span>'}
                ${state.currentHold ? `<span class="pill">Hold ${escapeHtml(state.currentHold.hold_id.slice(0, 8))}</span>` : '<span class="pill">No active hold</span>'}
              </div>
            </div>

            ${state.currentHold ? `
              <div class="details-list">
                <div class="detail-row"><span>Hold expires</span><strong>${formatTime(state.currentHold.expires_at)}</strong></div>
                <div class="detail-row"><span>Seats</span><strong>${state.currentHold.seat_numbers.join(', ')}</strong></div>
                <div class="detail-row"><span>User</span><strong>${escapeHtml(state.currentHold.user_id)}</strong></div>
              </div>
            ` : ''}

            <div>
              <h3 style="margin:0 0 10px;">Confirmed booking</h3>
              ${renderBookingSummary()}
            </div>
          </div>
        </aside>
      </div>
    </div>
  `;

  root.querySelectorAll<HTMLButtonElement>('[data-seat-number]').forEach((button) => {
    button.addEventListener('click', () => {
      const seatNumber = Number(button.dataset.seatNumber);
      if (Number.isFinite(seatNumber)) {
        toggleSeat(seatNumber);
      }
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-trip-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const tripId = button.dataset.tripId;
      if (tripId) {
        selectTrip(tripId);
      }
    });
  });

  root.querySelector<HTMLButtonElement>('#refresh-trips')?.addEventListener('click', () => {
    void refreshTrips();
  });

  root.querySelector<HTMLButtonElement>('#hold-seats')?.addEventListener('click', () => {
    void holdSelectedSeats();
  });

  root.querySelector<HTMLButtonElement>('#confirm-hold')?.addEventListener('click', () => {
    void confirmCurrentHold();
  });

  root.querySelector<HTMLInputElement>('#user-id')?.addEventListener('input', (event) => {
    const input = event.currentTarget as HTMLInputElement | null;
    if (input) {
      state.userId = input.value;
    }
  });

  root.querySelector<HTMLInputElement>('#hold-minutes')?.addEventListener('input', (event) => {
    const input = event.currentTarget as HTMLInputElement | null;
    const value = Number(input?.value ?? state.holdMinutes);
    if (Number.isFinite(value) && value > 0) {
      state.holdMinutes = Math.min(Math.round(value), 120);
    }
  });

  root.querySelector<HTMLButtonElement>('#download-receipt')?.addEventListener('click', () => {
    if (state.currentBooking) {
      downloadBookingPdf(state.currentBooking);
    }
  });

  root.querySelector<HTMLButtonElement>('#cancel-booking')?.addEventListener('click', () => {
    void cancelCurrentBooking();
  });
}

window.addEventListener('load', () => {
  void refreshTrips();
});

setInterval(() => {
  void refreshTrips();
}, 10000);

render();
