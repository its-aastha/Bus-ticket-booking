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

export interface CancelBookingResponse {
  booking_id: string;
  status: 'confirmed' | 'cancelled';
  refund_amount: number;
  refund_percentage: number;
}

export interface BookingReceipt {
  booking_id: string;
  trip_id: string;
  user_id: string;
  seat_numbers: number[];
  total_amount: number;
  status: 'confirmed' | 'cancelled';
  departure_time: string;
  fare_per_seat: number;
  booked_at: string;
  cancelled_at?: string;
  refund_amount?: number;
  refund_percentage?: number;
}
