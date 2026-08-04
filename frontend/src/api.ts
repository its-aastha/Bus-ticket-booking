import type { CancelBookingResponse, ConfirmBookingResponse, CreateHoldResponse, TripSnapshot } from './types';

const DEFAULT_API_BASE_URL = '/api';

function getApiBaseUrl(): string {
  const value = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!value) {
    return DEFAULT_API_BASE_URL;
  }

  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function makeUrl(path: string): string {
  const base = getApiBaseUrl();
  return `${base}${path}`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(makeUrl(path), {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    const bodyText = await response.text();

    if (bodyText.trim().length > 0) {
      try {
        const body = JSON.parse(bodyText) as { detail?: unknown };
        if (typeof body.detail === 'string' && body.detail.trim().length > 0) {
          detail = body.detail;
        } else {
          detail = bodyText;
        }
      } catch {
        detail = bodyText;
      }
    }

    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}

export async function listTrips(): Promise<TripSnapshot[]> {
  return requestJson<TripSnapshot[]>('/trips');
}

export async function createHold(
  tripId: string,
  userId: string,
  seatNumbers: number[],
  holdMinutes: number,
): Promise<CreateHoldResponse> {
  return requestJson<CreateHoldResponse>(`/trips/${encodeURIComponent(tripId)}/holds`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, seat_numbers: seatNumbers, hold_minutes: holdMinutes }),
  });
}

export async function confirmHold(holdId: string): Promise<ConfirmBookingResponse> {
  return requestJson<ConfirmBookingResponse>(`/holds/${encodeURIComponent(holdId)}/confirm`, {
    method: 'POST',
  });
}

export async function cancelBooking(bookingId: string): Promise<CancelBookingResponse> {
  return requestJson<CancelBookingResponse>(`/bookings/${encodeURIComponent(bookingId)}/cancel`, {
    method: 'POST',
  });
}
