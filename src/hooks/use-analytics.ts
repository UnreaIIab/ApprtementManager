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
 */
export function useAnalytics() {
  const { data, isLoading, isFetching } = useSnapshot();
  const { range, previous, lastYear } = useDateFilter();

  const input = useMemo<AnalyticsInput>(
    () => ({
      apartments: data?.apartments ?? [],
      bookings: data?.bookings ?? [],
      expenses: data?.expenses ?? [],
      payments: data?.payments ?? [],
      invoices: data?.invoices ?? [],
      guests: data?.guests ?? [],
    }),
    [data],
  );

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
