import { dayjs, staysOverlap, toISODate } from "@/lib/date-range";
import { quoteStay, type StayQuote } from "@/lib/pricing";
import type {
  Apartment,
  Booking,
  CalendarBlock,
  ISODate,
} from "@/types/domain";

/**
 * Availability engine.
 *
 * All intervals are half-open `[start, end)` — the same convention the database
 * uses. That is what makes a check-out day immediately bookable again: a stay
 * ending Aug 20 and one starting Aug 20 do not overlap, and the gap between
 * them is correctly zero nights rather than one.
 */

export interface Interval {
  start: ISODate;
  /** Exclusive. */
  end: ISODate;
}

export interface Gap extends Interval {
  nights: number;
  /** True when the gap is shorter than the apartment's minimum stay. */
  belowMinimum: boolean;
  /** Open-ended because the window cut it off, not because it is occupied. */
  clippedStart: boolean;
  clippedEnd: boolean;
}

const LIVE_BOOKING = (booking: Booking) =>
  booking.status !== "cancelled" && booking.status !== "no_show";

export function nightsBetween(start: ISODate, end: ISODate): number {
  return Math.max(0, dayjs(end).diff(dayjs(start), "day"));
}

/** Everything that makes an apartment unbookable: live stays plus blocks. */
export function occupiedIntervals(
  apartmentId: string,
  bookings: Booking[],
  blocks: CalendarBlock[],
): Interval[] {
  const intervals: Interval[] = [];
  for (const booking of bookings) {
    if (booking.apartment_id !== apartmentId || !LIVE_BOOKING(booking)) continue;
    intervals.push({ start: booking.check_in, end: booking.check_out });
  }
  for (const block of blocks) {
    if (block.apartment_id !== apartmentId) continue;
    intervals.push({ start: block.start_date, end: block.end_date });
  }
  return mergeIntervals(intervals);
}

/** Sorts and coalesces touching or overlapping intervals. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length <= 1) return [...intervals];
  const sorted = [...intervals].sort((a, b) => (a.start < b.start ? -1 : 1));
  const merged: Interval[] = [sorted[0]];

  for (const current of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      if (current.end > last.end) last.end = current.end;
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

/**
 * The inverse of `occupied` within a window — the bookable gaps.
 * `windowEnd` is exclusive, matching the interval convention.
 */
export function freeGaps(
  occupied: Interval[],
  windowStart: ISODate,
  windowEnd: ISODate,
  minNights = 1,
): Gap[] {
  const gaps: Gap[] = [];
  let cursor = windowStart;

  const inWindow = occupied
    .filter((interval) => staysOverlap(interval.start, interval.end, windowStart, windowEnd))
    .sort((a, b) => (a.start < b.start ? -1 : 1));

  const push = (start: ISODate, end: ISODate) => {
    const nights = nightsBetween(start, end);
    if (nights <= 0) return;
    gaps.push({
      start,
      end,
      nights,
      belowMinimum: nights < minNights,
      // A gap touching the window edge continues beyond it; the UI shows that
      // rather than implying the apartment frees up exactly at the boundary.
      clippedStart: start === windowStart,
      clippedEnd: end === windowEnd,
    });
  };

  for (const interval of inWindow) {
    if (interval.start > cursor) push(cursor, interval.start);
    if (interval.end > cursor) cursor = interval.end;
  }
  if (cursor < windowEnd) push(cursor, windowEnd);

  return gaps;
}

/** Is this apartment free for the whole span? */
export function isFree(
  apartmentId: string,
  checkIn: ISODate,
  checkOut: ISODate,
  bookings: Booking[],
  blocks: CalendarBlock[],
): boolean {
  if (checkOut <= checkIn) return false;
  for (const booking of bookings) {
    if (booking.apartment_id !== apartmentId || !LIVE_BOOKING(booking)) continue;
    if (staysOverlap(checkIn, checkOut, booking.check_in, booking.check_out)) return false;
  }
  for (const block of blocks) {
    if (block.apartment_id !== apartmentId) continue;
    if (staysOverlap(checkIn, checkOut, block.start_date, block.end_date)) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

export interface AvailabilityQuery {
  checkIn: ISODate;
  checkOut: ISODate;
  guests: number;
}

export type UnavailableReason =
  | "booked"
  | "too_small"
  | "below_minimum"
  | "inactive";

export interface AvailabilityResult {
  apartment: Apartment;
  available: boolean;
  reason: UnavailableReason | null;
  nights: number;
  quote: StayQuote | null;
  /** When occupied, the stay or block standing in the way. */
  conflict: Interval | null;
}

/**
 * Booking.com-style availability lookup: given dates and a party size, which
 * units can take it and what would the stay cost?
 *
 * Unavailable units are returned too, with the reason — "booked" and "sleeps
 * only 2" are different problems, and a manager acting on the result needs to
 * know which one they are looking at.
 */
export function searchAvailability(
  apartments: Apartment[],
  bookings: Booking[],
  blocks: CalendarBlock[],
  query: AvailabilityQuery,
  taxRatePct: number,
): AvailabilityResult[] {
  const nights = nightsBetween(query.checkIn, query.checkOut);

  return apartments.map((apartment) => {
    const base = { apartment, nights, quote: null, conflict: null };

    if (!apartment.is_active) {
      return { ...base, available: false, reason: "inactive" as const };
    }
    if (apartment.capacity < query.guests) {
      return { ...base, available: false, reason: "too_small" as const };
    }

    const conflict = findConflict(apartment.id, query, bookings, blocks);
    if (conflict) {
      return { ...base, available: false, reason: "booked" as const, conflict };
    }
    if (nights < apartment.min_nights) {
      return {
        ...base,
        available: false,
        reason: "below_minimum" as const,
        quote: quoteStay(apartment, nights, taxRatePct),
      };
    }

    return {
      ...base,
      available: true,
      reason: null,
      quote: quoteStay(apartment, nights, taxRatePct),
    };
  });
}

function findConflict(
  apartmentId: string,
  query: AvailabilityQuery,
  bookings: Booking[],
  blocks: CalendarBlock[],
): Interval | null {
  for (const booking of bookings) {
    if (booking.apartment_id !== apartmentId || !LIVE_BOOKING(booking)) continue;
    if (staysOverlap(query.checkIn, query.checkOut, booking.check_in, booking.check_out)) {
      return { start: booking.check_in, end: booking.check_out };
    }
  }
  for (const block of blocks) {
    if (block.apartment_id !== apartmentId) continue;
    if (staysOverlap(query.checkIn, query.checkOut, block.start_date, block.end_date)) {
      return { start: block.start_date, end: block.end_date };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Daily operations                                                    */
/* ------------------------------------------------------------------ */

export interface DayPulse {
  arrivals: Booking[];
  departures: Booking[];
  inHouse: Booking[];
  /** Apartments with no live stay covering tonight. */
  freeTonight: Apartment[];
  occupancy: number;
}

/**
 * The state of the portfolio on a single date — what the front desk needs
 * before anything else in the morning.
 */
export function dayPulse(
  apartments: Apartment[],
  bookings: Booking[],
  date: ISODate = toISODate(dayjs()),
): DayPulse {
  const arrivals: Booking[] = [];
  const departures: Booking[] = [];
  const inHouse: Booking[] = [];
  const occupiedIds = new Set<string>();

  for (const booking of bookings) {
    if (!LIVE_BOOKING(booking)) continue;
    if (booking.check_in === date) arrivals.push(booking);
    if (booking.check_out === date) departures.push(booking);
    if (booking.check_in <= date && booking.check_out > date) {
      inHouse.push(booking);
      occupiedIds.add(booking.apartment_id);
    }
  }

  const active = apartments.filter((apartment) => apartment.is_active);
  const freeTonight = active.filter((apartment) => !occupiedIds.has(apartment.id));

  return {
    arrivals: arrivals.sort((a, b) => (a.check_in_time ?? "").localeCompare(b.check_in_time ?? "")),
    departures: departures.sort((a, b) =>
      (a.check_out_time ?? "").localeCompare(b.check_out_time ?? ""),
    ),
    inHouse,
    freeTonight,
    occupancy: active.length ? occupiedIds.size / active.length : 0,
  };
}
