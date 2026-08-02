"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  DEFAULT_PRESET,
  PRESET_LABELS,
  previousRange,
  resolvePreset,
  sameRangeLastYear,
  type DatePreset,
} from "@/lib/date-range";
import { formatDateRange } from "@/lib/format";
import { useLocalJson } from "@/hooks/use-local-store";
import type { DateRange } from "@/types/domain";

/**
 * The global reporting window.
 *
 * One filter row scopes every KPI, chart, table and report in the app — there
 * are deliberately no per-card date pickers, so two numbers on the same screen
 * can never be describing different periods.
 *
 * The selection lives in `localStorage` and is read through
 * `useSyncExternalStore`, so it survives a reload and restores in the first
 * render pass rather than flashing the default window first.
 */
interface DateFilterValue {
  preset: DatePreset;
  range: DateRange;
  /** Same-length window immediately before `range`, for "vs previous" deltas. */
  previous: DateRange;
  /** `range` shifted back a year, for year-over-year comparisons. */
  lastYear: DateRange;
  label: string;
  setPreset: (preset: DatePreset) => void;
  setCustomRange: (range: DateRange) => void;
}

interface StoredFilter {
  preset: DatePreset;
  custom: DateRange | null;
}

const STORAGE_KEY = "aptmanager.date-filter";
const DEFAULT_STORED: StoredFilter = { preset: DEFAULT_PRESET, custom: null };

const DateFilterContext = createContext<DateFilterValue | null>(null);

export function DateFilterProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useLocalJson<StoredFilter>(STORAGE_KEY, DEFAULT_STORED);

  const setPreset = useCallback(
    (preset: DatePreset) => {
      setStored({ preset, custom: preset === "custom" ? stored.custom : null });
    },
    [setStored, stored.custom],
  );

  const setCustomRange = useCallback(
    (next: DateRange) => {
      // Tolerate a reversed selection rather than showing an empty window.
      const ordered = next.start <= next.end ? next : { start: next.end, end: next.start };
      setStored({ preset: "custom", custom: ordered });
    },
    [setStored],
  );

  const value = useMemo<DateFilterValue>(() => {
    const preset = stored.preset ?? DEFAULT_PRESET;
    const range =
      preset === "custom" && stored.custom ? stored.custom : resolvePreset(preset);
    return {
      preset,
      range,
      previous: previousRange(range),
      lastYear: sameRangeLastYear(range),
      label:
        preset === "custom" ? formatDateRange(range.start, range.end) : PRESET_LABELS[preset],
      setPreset,
      setCustomRange,
    };
  }, [stored, setPreset, setCustomRange]);

  return <DateFilterContext.Provider value={value}>{children}</DateFilterContext.Provider>;
}

export function useDateFilter(): DateFilterValue {
  const context = useContext(DateFilterContext);
  if (!context) throw new Error("useDateFilter must be used inside <DateFilterProvider>");
  return context;
}
