import {
  bucketKey,
  bucketLabel,
  dayjs,
  eachDay,
  granularityFor,
  isWithin,
  nightsWithinRange,
  rangeLengthDays,
  toISODate,
  type Granularity,
} from "@/lib/date-range";
import { BOOKING_SOURCE_LABELS, expenseCategoryLabel } from "@/lib/constants";
import { strings } from "@/i18n";
import type {
  Apartment,
  ApartmentPerformance,
  Booking,
  BookingSource,
  BreakdownSlice,
  DateRange,
  Expense,
  ExpenseCategory,
  Guest,
  Invoice,
  KpiSet,
  Payment,
  TrendPoint,
} from "@/types/domain";

/**
 * Analytics engine.
 *
 * Every KPI, chart and report in the app is derived here from the same inputs
 * and the same date window, so a number can never disagree with itself between
 * two screens.
 *
 * ## Revenue recognition
 * Revenue is recognised **per night**, not on the booking date. A stay that
 * straddles a month boundary contributes to both months in proportion to the
 * nights that fall in each. This is what makes "This month" mean the same thing
 * on the dashboard, the reports page and an apartment's P&L.
 *
 * ## Which bookings count
 * Cancelled and no-show bookings never contribute revenue, occupancy, ADR or
 * RevPAR. They are counted only by `cancellationRate`.
 */

export const LIVE_STATUSES = new Set(["pending", "confirmed", "checked_in", "checked_out"]);

export function isLive(booking: Booking): boolean {
  return LIVE_STATUSES.has(booking.status);
}

/** Revenue per night of a stay, split into the two bases the KPIs need. */
function nightlyBases(booking: Booking) {
  const nights = Math.max(1, booking.nights);
  return {
    // Accommodation only — the correct denominator basis for ADR and RevPAR.
    room: (booking.subtotal - booking.discount) / nights,
    // Everything the guest owes, which is what "Total revenue" reports.
    total: booking.total / nights,
  };
}

/**
 * A stay's share of one period.
 *
 * Revenue is recognised per night, so a stay running from July into August
 * belongs to both months in proportion. Any report listing bookings for a
 * period has to use this, or its total will not agree with the KPI above it —
 * which is precisely what a statement is meant to substantiate.
 *
 * Uses the same basis as `computeKpis`, deliberately: one definition of what a
 * night is worth, or the two drift.
 */
export function bookingPeriodShare(
  booking: Booking,
  range: DateRange,
): { nights: number; revenue: number } {
  const nights = nightsWithinRange(booking.check_in, booking.check_out, range);
  if (nights <= 0) return { nights: 0, revenue: 0 };
  return { nights, revenue: Math.round(nightlyBases(booking).total * nights) };
}

export interface AnalyticsInput {
  apartments: Apartment[];
  bookings: Booking[];
  expenses: Expense[];
  payments: Payment[];
  invoices?: Invoice[];
  guests?: Guest[];
}

/* ------------------------------------------------------------------ */
/* KPIs                                                                */
/* ------------------------------------------------------------------ */

export function computeKpis(input: AnalyticsInput, range: DateRange): KpiSet {
  const { apartments, bookings, expenses, payments } = input;
  const activeApartments = apartments.filter((a) => a.is_active);
  const days = rangeLengthDays(range);
  const nightsAvailable = activeApartments.length * days;

  let revenue = 0;
  let roomRevenue = 0;
  let nightsSold = 0;
  let arrivals = 0;
  let cancellations = 0;
  let stayNightsTotal = 0;
  let outstanding = 0;
  const activeGuestIds = new Set<string>();

  const paidByBooking = paymentsByBooking(payments);

  for (const booking of bookings) {
    const arrivesInRange = isWithin(booking.check_in, range);
    if (arrivesInRange) {
      if (booking.status === "cancelled" || booking.status === "no_show") {
        cancellations += 1;
      } else {
        arrivals += 1;
        stayNightsTotal += booking.nights;
      }
    }

    if (!isLive(booking)) continue;

    const nights = nightsWithinRange(booking.check_in, booking.check_out, range);
    if (nights <= 0) continue;

    const basis = nightlyBases(booking);
    revenue += basis.total * nights;
    roomRevenue += basis.room * nights;
    nightsSold += nights;
    activeGuestIds.add(booking.guest_id);

    const balance = booking.total - (paidByBooking.get(booking.id) ?? 0);
    if (balance > 0) outstanding += balance;
  }

  const expenseTotal = expenses
    .filter((expense) => isWithin(expense.expense_date, range))
    .reduce((acc, expense) => acc + expense.amount, 0);

  const collected = payments
    .filter(
      (payment) =>
        (payment.status === "paid" || payment.status === "partial") &&
        isWithin(toISODate(payment.paid_at), range),
    )
    .reduce((acc, payment) => acc + payment.amount, 0);

  const totalArrivals = arrivals + cancellations;

  return {
    revenue: Math.round(revenue),
    expenses: expenseTotal,
    netProfit: Math.round(revenue) - expenseTotal,
    bookings: arrivals,
    nightsSold,
    nightsAvailable,
    occupancyRate: nightsAvailable ? nightsSold / nightsAvailable : 0,
    adr: nightsSold ? Math.round(roomRevenue / nightsSold) : 0,
    revpar: nightsAvailable ? Math.round(roomRevenue / nightsAvailable) : 0,
    avgLengthOfStay: arrivals ? stayNightsTotal / arrivals : 0,
    availableApartments: apartments.filter((a) => a.status === "available").length,
    totalApartments: activeApartments.length,
    activeGuests: activeGuestIds.size,
    cancellationRate: totalArrivals ? cancellations / totalArrivals : 0,
    collected,
    outstanding: Math.round(outstanding),
  };
}

export function paymentsByBooking(payments: Payment[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const payment of payments) {
    if (!payment.booking_id) continue;
    if (payment.status !== "paid" && payment.status !== "partial") continue;
    map.set(payment.booking_id, (map.get(payment.booking_id) ?? 0) + payment.amount);
  }
  return map;
}

export function paymentsByInvoice(payments: Payment[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const payment of payments) {
    if (!payment.invoice_id) continue;
    if (payment.status !== "paid" && payment.status !== "partial") continue;
    map.set(payment.invoice_id, (map.get(payment.invoice_id) ?? 0) + payment.amount);
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Trends                                                              */
/* ------------------------------------------------------------------ */

/**
 * Time series bucketed by day or month depending on the window length.
 * Buckets are pre-seeded across the whole range so a quiet week renders as a
 * zero rather than a gap in the line.
 */
export function computeTrend(
  input: AnalyticsInput,
  range: DateRange,
  granularity: Granularity = granularityFor(range),
): TrendPoint[] {
  const { apartments, bookings, expenses } = input;
  const activeCount = apartments.filter((a) => a.is_active).length;

  const buckets = new Map<string, TrendPoint>();
  for (const day of eachDay(range)) {
    const key = bucketKey(day, granularity);
    let point = buckets.get(key);
    if (!point) {
      point = {
        key,
        label: bucketLabel(key, granularity),
        revenue: 0,
        expenses: 0,
        profit: 0,
        bookings: 0,
        nightsSold: 0,
        nightsAvailable: 0,
        occupancy: 0,
      };
      buckets.set(key, point);
    }
    point.nightsAvailable += activeCount;
  }

  for (const booking of bookings) {
    if (isWithin(booking.check_in, range) && isLive(booking)) {
      const point = buckets.get(bucketKey(booking.check_in, granularity));
      if (point) point.bookings += 1;
    }
    if (!isLive(booking)) continue;

    const basis = nightlyBases(booking);
    // Walk only the nights that actually fall inside the window.
    const from = booking.check_in > range.start ? booking.check_in : range.start;
    const untilExclusive = dayjs(range.end).add(1, "day").format("YYYY-MM-DD");
    const to = booking.check_out < untilExclusive ? booking.check_out : untilExclusive;
    let cursor = dayjs(from);
    const end = dayjs(to);
    while (cursor.isBefore(end, "day")) {
      const point = buckets.get(bucketKey(cursor.format("YYYY-MM-DD"), granularity));
      if (point) {
        point.revenue += basis.total;
        point.nightsSold += 1;
      }
      cursor = cursor.add(1, "day");
    }
  }

  for (const expense of expenses) {
    if (!isWithin(expense.expense_date, range)) continue;
    const point = buckets.get(bucketKey(expense.expense_date, granularity));
    if (point) point.expenses += expense.amount;
  }

  return Array.from(buckets.values())
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((point) => ({
      ...point,
      revenue: Math.round(point.revenue),
      profit: Math.round(point.revenue) - point.expenses,
      occupancy: point.nightsAvailable ? point.nightsSold / point.nightsAvailable : 0,
    }));
}

/* ------------------------------------------------------------------ */
/* Breakdowns                                                          */
/* ------------------------------------------------------------------ */

function toSlices<K extends string>(
  totals: Map<K, number>,
  label: (key: K) => string,
): BreakdownSlice[] {
  const grand = Array.from(totals.values()).reduce((acc, value) => acc + value, 0);
  return Array.from(totals.entries())
    .map(([key, value]) => ({
      key,
      label: label(key),
      value: Math.round(value),
      share: grand ? value / grand : 0,
    }))
    .filter((slice) => slice.value !== 0)
    .sort((a, b) => b.value - a.value);
}

export function revenueBySource(bookings: Booking[], range: DateRange): BreakdownSlice[] {
  const totals = new Map<BookingSource, number>();
  for (const booking of bookings) {
    if (!isLive(booking)) continue;
    const nights = nightsWithinRange(booking.check_in, booking.check_out, range);
    if (nights <= 0) continue;
    const value = nightlyBases(booking).total * nights;
    totals.set(booking.source, (totals.get(booking.source) ?? 0) + value);
  }
  return toSlices(totals, (key) => BOOKING_SOURCE_LABELS[key]);
}

export function bookingsBySource(bookings: Booking[], range: DateRange): BreakdownSlice[] {
  const totals = new Map<BookingSource, number>();
  for (const booking of bookings) {
    if (!isLive(booking) || !isWithin(booking.check_in, range)) continue;
    totals.set(booking.source, (totals.get(booking.source) ?? 0) + 1);
  }
  return toSlices(totals, (key) => BOOKING_SOURCE_LABELS[key]);
}

export function expensesByCategory(expenses: Expense[], range: DateRange): BreakdownSlice[] {
  const totals = new Map<ExpenseCategory, number>();
  for (const expense of expenses) {
    if (!isWithin(expense.expense_date, range)) continue;
    totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount);
  }
  return toSlices(totals, (key) => expenseCategoryLabel(key));
}

export function expensesByApartment(
  expenses: Expense[],
  apartments: Apartment[],
  range: DateRange,
): BreakdownSlice[] {
  const names = new Map(apartments.map((a) => [a.id, a.name]));
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    if (!isWithin(expense.expense_date, range)) continue;
    const key = expense.apartment_id ?? "__unassigned";
    totals.set(key, (totals.get(key) ?? 0) + expense.amount);
  }
  return toSlices(totals, (key) => names.get(key) ?? "Portfolio-wide");
}

/**
 * Folds everything past `limit` into a single "Other" slice.
 * The palette has eight categorical slots; a ninth series would have to be an
 * invented hue, so it becomes "Other" instead.
 */
export function capSlices(slices: BreakdownSlice[], limit: number): BreakdownSlice[] {
  if (slices.length <= limit) return slices;
  const head = slices.slice(0, limit - 1);
  const tail = slices.slice(limit - 1);
  const value = tail.reduce((acc, slice) => acc + slice.value, 0);
  const share = tail.reduce((acc, slice) => acc + slice.share, 0);
  return [...head, { key: "__other", label: strings().category.other, value, share }];
}

/* ------------------------------------------------------------------ */
/* Per-apartment performance                                           */
/* ------------------------------------------------------------------ */

export function computeApartmentPerformance(
  input: AnalyticsInput,
  range: DateRange,
): ApartmentPerformance[] {
  const { apartments, bookings, expenses } = input;
  const days = rangeLengthDays(range);

  const stats = new Map<
    string,
    { revenue: number; room: number; nights: number; bookings: number; stayNights: number; cancelled: number }
  >();
  for (const apartment of apartments) {
    stats.set(apartment.id, { revenue: 0, room: 0, nights: 0, bookings: 0, stayNights: 0, cancelled: 0 });
  }

  for (const booking of bookings) {
    const entry = stats.get(booking.apartment_id);
    if (!entry) continue;

    if (isWithin(booking.check_in, range)) {
      if (booking.status === "cancelled" || booking.status === "no_show") entry.cancelled += 1;
      else {
        entry.bookings += 1;
        entry.stayNights += booking.nights;
      }
    }

    if (!isLive(booking)) continue;
    const nights = nightsWithinRange(booking.check_in, booking.check_out, range);
    if (nights <= 0) continue;
    const basis = nightlyBases(booking);
    entry.revenue += basis.total * nights;
    entry.room += basis.room * nights;
    entry.nights += nights;
  }

  const expenseTotals = new Map<string, number>();
  for (const expense of expenses) {
    if (!expense.apartment_id || !isWithin(expense.expense_date, range)) continue;
    expenseTotals.set(
      expense.apartment_id,
      (expenseTotals.get(expense.apartment_id) ?? 0) + expense.amount,
    );
  }

  return apartments.map((apartment) => {
    const entry = stats.get(apartment.id)!;
    const revenue = Math.round(entry.revenue);
    const apartmentExpenses = expenseTotals.get(apartment.id) ?? 0;
    const nightsAvailable = apartment.is_active ? days : 0;
    const totalArrivals = entry.bookings + entry.cancelled;
    const profit = revenue - apartmentExpenses;
    return {
      apartment,
      revenue,
      expenses: apartmentExpenses,
      profit,
      margin: revenue ? profit / revenue : 0,
      nightsSold: entry.nights,
      nightsAvailable,
      occupancy: nightsAvailable ? entry.nights / nightsAvailable : 0,
      adr: entry.nights ? Math.round(entry.room / entry.nights) : 0,
      revpar: nightsAvailable ? Math.round(entry.room / nightsAvailable) : 0,
      bookings: entry.bookings,
      avgStay: entry.bookings ? entry.stayNights / entry.bookings : 0,
      cancellationRate: totalArrivals ? entry.cancelled / totalArrivals : 0,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Occupancy calendar                                                  */
/* ------------------------------------------------------------------ */

export interface OccupancyCell {
  date: string;
  occupancy: number;
  nightsSold: number;
  nightsAvailable: number;
}

export function computeOccupancyByDay(
  input: AnalyticsInput,
  range: DateRange,
): OccupancyCell[] {
  const activeCount = input.apartments.filter((a) => a.is_active).length;
  const sold = new Map<string, number>();
  for (const booking of input.bookings) {
    if (!isLive(booking)) continue;
    let cursor = dayjs(booking.check_in);
    const end = dayjs(booking.check_out);
    while (cursor.isBefore(end, "day")) {
      const key = cursor.format("YYYY-MM-DD");
      if (key >= range.start && key <= range.end) sold.set(key, (sold.get(key) ?? 0) + 1);
      cursor = cursor.add(1, "day");
    }
  }
  return eachDay(range).map((date) => {
    const nightsSold = sold.get(date) ?? 0;
    return {
      date,
      nightsSold,
      nightsAvailable: activeCount,
      occupancy: activeCount ? nightsSold / activeCount : 0,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Cash flow & seasonality                                             */
/* ------------------------------------------------------------------ */

export interface CashFlowPoint {
  key: string;
  label: string;
  inflow: number;
  outflow: number;
  net: number;
}

/** Cash actually moved — payments received against expenses paid. */
export function computeCashFlow(
  payments: Payment[],
  expenses: Expense[],
  range: DateRange,
  granularity: Granularity = granularityFor(range),
): CashFlowPoint[] {
  const buckets = new Map<string, CashFlowPoint>();
  for (const day of eachDay(range)) {
    const key = bucketKey(day, granularity);
    if (!buckets.has(key)) {
      buckets.set(key, { key, label: bucketLabel(key, granularity), inflow: 0, outflow: 0, net: 0 });
    }
  }
  for (const payment of payments) {
    const date = toISODate(payment.paid_at);
    if (!isWithin(date, range)) continue;
    const point = buckets.get(bucketKey(date, granularity));
    if (!point) continue;
    if (payment.status === "refunded") point.outflow += payment.amount;
    else if (payment.status === "paid" || payment.status === "partial") point.inflow += payment.amount;
  }
  for (const expense of expenses) {
    if (!isWithin(expense.expense_date, range) || expense.status !== "paid") continue;
    const point = buckets.get(bucketKey(expense.expense_date, granularity));
    if (point) point.outflow += expense.amount;
  }
  return Array.from(buckets.values())
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((point) => ({ ...point, net: point.inflow - point.outflow }));
}

export interface SeasonalityPoint {
  month: number;
  label: string;
  revenue: number;
  occupancy: number;
  adr: number;
}

/** Month-of-year profile across whatever history is supplied. */
export function computeSeasonality(input: AnalyticsInput, years: number[]): SeasonalityPoint[] {
  const activeCount = input.apartments.filter((a) => a.is_active).length;
  const revenue = new Array(12).fill(0);
  const room = new Array(12).fill(0);
  const nights = new Array(12).fill(0);
  const available = new Array(12).fill(0);

  for (const year of years) {
    for (let month = 0; month < 12; month += 1) {
      available[month] += dayjs(`${year}-${String(month + 1).padStart(2, "0")}-01`).daysInMonth() * activeCount;
    }
  }

  for (const booking of input.bookings) {
    if (!isLive(booking)) continue;
    const basis = nightlyBases(booking);
    let cursor = dayjs(booking.check_in);
    const end = dayjs(booking.check_out);
    while (cursor.isBefore(end, "day")) {
      if (years.includes(cursor.year())) {
        const month = cursor.month();
        revenue[month] += basis.total;
        room[month] += basis.room;
        nights[month] += 1;
      }
      cursor = cursor.add(1, "day");
    }
  }

  return Array.from({ length: 12 }, (_, month) => ({
    month,
    label: dayjs().month(month).format("MMM"),
    revenue: Math.round(revenue[month]),
    occupancy: available[month] ? nights[month] / available[month] : 0,
    adr: nights[month] ? Math.round(room[month] / nights[month]) : 0,
  }));
}
