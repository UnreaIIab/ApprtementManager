"use client";

import { useMemo } from "react";
import { useSnapshot } from "@/data/queries";
import { useDateFilter } from "@/hooks/use-date-filter";
import {
  computeApartmentPerformance,
  computeKpis,
  computeTrend,
  type AnalyticsInput,
} from "@/data/analytics";
import { granularityFor } from "@/lib/date-range";
import { pctChange } from "@/lib/utils";
import type { KpiSet } from "@/types/domain";

/**
 * Analytics bound to the global date filter.
 *
 * Everything a dashboard needs — current KPIs, the same KPIs for the comparison
 * window, the trend series and per-apartment performance — computed once and
 * memoised, so the whole page re-derives from a single pass when the filter
 * changes.
 *
 * Pass an `apartmentId` to scope the whole set to one unit. Narrowing the input
 * rather than the output is what keeps a per-unit report coherent: occupancy is
 * then measured against that unit's own available nights, not the portfolio's,
 * and every figure downstream inherits the same denominator.
 */
export function useAnalytics(apartmentId?: string | null) {
  const { data, isLoading, isFetching } = useSnapshot();
  const { range, previous, lastYear } = useDateFilter();

  const input = useMemo<AnalyticsInput>(() => {
    const all: AnalyticsInput = {
      apartments: data?.apartments ?? [],
      bookings: data?.bookings ?? [],
      expenses: data?.expenses ?? [],
      payments: data?.payments ?? [],
      invoices: data?.invoices ?? [],
      guests: data?.guests ?? [],
    };
    if (!apartmentId) return all;

    const bookings = all.bookings.filter((b) => b.apartment_id === apartmentId);
    // Payments and invoices reach an apartment only through their booking.
    const bookingIds = new Set(bookings.map((b) => b.id));

    return {
      apartments: all.apartments.filter((a) => a.id === apartmentId),
      bookings,
      /*
       * An expense with no apartment is a portfolio-wide cost — an accountant's
       * fee, a subscription. It is real, but it cannot honestly be charged to
       * one unit, so a scoped report leaves it out. The consequence is that the
       * unit reports do not sum to the portfolio report, which is why the sheet
       * says so in print.
       */
      expenses: all.expenses.filter((e) => e.apartment_id === apartmentId),
      payments: all.payments.filter((p) => p.booking_id && bookingIds.has(p.booking_id)),
      invoices: (all.invoices ?? []).filter(
        (i) => i.apartment_id === apartmentId || (i.booking_id && bookingIds.has(i.booking_id)),
      ),
      guests: all.guests,
    };
  }, [data, apartmentId]);

  const kpis = useMemo(() => computeKpis(input, range), [input, range]);
  const previousKpis = useMemo(() => computeKpis(input, previous), [input, previous]);
  const lastYearKpis = useMemo(() => computeKpis(input, lastYear), [input, lastYear]);

  const trend = useMemo(
    () => computeTrend(input, range, granularityFor(range)),
    [input, range],
  );

  const apartmentPerformance = useMemo(
    () => computeApartmentPerformance(input, range),
    [input, range],
  );

  /** Fractional change vs the previous window for any KPI field. */
  const delta = useMemo(
    () =>
      (key: keyof KpiSet): number | null =>
        pctChange(Number(kpis[key]), Number(previousKpis[key])),
    [kpis, previousKpis],
  );

  return {
    input,
    kpis,
    previousKpis,
    lastYearKpis,
    trend,
    apartmentPerformance,
    delta,
    range,
    loading: isLoading,
    refetching: isFetching && !isLoading,
  };
}
