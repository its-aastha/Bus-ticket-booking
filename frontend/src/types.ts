export type HoldStatus = 'active' | 'confirmed' | 'expired' | 'released';

export interface SeatHold {
  hold_id: string;
  trip_id: string;
  user_id: string;
  seat_numbers: number[];
  expires_at: string;
  status: HoldStatus;
  created_at: string;
}

export interface TripSnapshot {
  trip_id: string;
  total_seats: number;
  fare_per_seat: number;
  departure_time: string;
  booked_seats: number[];
  available_seats: number[];
  active_holds: SeatHold[];
}

export interface CreateHoldResponse {
  hold_id: string;
  trip_id: string;
  user_id: string;
  seat_numbers: number[];
  expires_at: string;
  status: HoldStatus;
}

export interface ConfirmBookingResponse {
  booking_id: string;
  trip_id: string;
  user_id: string;
  seat_numbers: number[];
  total_amount: number;
  status: 'confirmed' | 'cancelled';
}
