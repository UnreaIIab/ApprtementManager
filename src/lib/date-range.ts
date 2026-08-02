import dayjs, { type Dayjs } from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import minMax from "dayjs/plugin/minMax";
import { strings } from "@/i18n";
import type { DateRange, ISODate } from "@/types/domain";

dayjs.extend(isoWeek);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(minMax);

export const DATE_PRESETS = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_year",
  "last_year",
  "custom",
] as const;

export type DatePreset = (typeof DATE_PRESETS)[number];

export const DEFAULT_PRESET: DatePreset = "this_month";

export const PRESET_LABELS: Record<DatePreset, string> = {
  get today() {
    return strings().datePreset.today;
  },
  get yesterday() {
    return strings().datePreset.yesterday;
  },
  get this_week() {
    return strings().datePreset.this_week;
  },
  get last_week() {
    return strings().datePreset.last_week;
  },
  get this_month() {
    return strings().datePreset.this_month;
  },
  get last_month() {
    return strings().datePreset.last_month;
  },
  get this_year() {
    return strings().datePreset.this_year;
  },
  get last_year() {
    return strings().datePreset.last_year;
  },
  get custom() {
    return strings().datePreset.custom;
  },
};

export function toISODate(value: Dayjs | Date | string): ISODate {
  return dayjs(value).format("YYYY-MM-DD");
}

/**
 * Resolves a preset to a concrete inclusive range.
 * `today` is passed in rather than read from the clock so server and client
 * render the same range and the app stays testable.
 */
export function resolvePreset(preset: DatePreset, today: Dayjs = dayjs()): DateRange {
  switch (preset) {
    case "today":
      return { start: toISODate(today), end: toISODate(today) };
    case "yesterday": {
      const d = today.subtract(1, "day");
      return { start: toISODate(d), end: toISODate(d) };
    }
    case "this_week":
      return {
        start: toISODate(today.startOf("isoWeek")),
        end: toISODate(today.endOf("isoWeek")),
      };
    case "last_week": {
      const d = today.subtract(1, "week");
      return {
        start: toISODate(d.startOf("isoWeek")),
        end: toISODate(d.endOf("isoWeek")),
      };
    }
    case "last_month": {
      const d = today.subtract(1, "month");
      return {
        start: toISODate(d.startOf("month")),
        end: toISODate(d.endOf("month")),
      };
    }
    case "this_year":
      return {
        start: toISODate(today.startOf("year")),
        end: toISODate(today.endOf("year")),
      };
    case "last_year": {
      const d = today.subtract(1, "year");
      return {
        start: toISODate(d.startOf("year")),
        end: toISODate(d.endOf("year")),
      };
    }
    case "this_month":
    case "custom":
    default:
      return {
        start: toISODate(today.startOf("month")),
        end: toISODate(today.endOf("month")),
      };
  }
}

/**
 * The immediately preceding window of the same length — the comparison basis
 * for every "vs previous period" delta shown on a KPI tile.
 */
export function previousRange(range: DateRange): DateRange {
  const start = dayjs(range.start);
  const end = dayjs(range.end);
  const days = end.diff(start, "day") + 1;
  return {
    start: toISODate(start.subtract(days, "day")),
    end: toISODate(end.subtract(days, "day")),
  };
}

/** Same window shifted back one year, for year-over-year comparisons. */
export function sameRangeLastYear(range: DateRange): DateRange {
  return {
    start: toISODate(dayjs(range.start).subtract(1, "year")),
    end: toISODate(dayjs(range.end).subtract(1, "year")),
  };
}

export function rangeLengthDays(range: DateRange): number {
  return dayjs(range.end).diff(dayjs(range.start), "day") + 1;
}

/** Every calendar day in the range, inclusive of both ends. */
export function eachDay(range: DateRange): ISODate[] {
  const out: ISODate[] = [];
  let cursor = dayjs(range.start);
  const end = dayjs(range.end);
  while (cursor.isSameOrBefore(end, "day")) {
    out.push(toISODate(cursor));
    cursor = cursor.add(1, "day");
  }
  return out;
}

export function eachMonth(range: DateRange): string[] {
  const out: string[] = [];
  let cursor = dayjs(range.start).startOf("month");
  const end = dayjs(range.end).startOf("month");
  while (cursor.isSameOrBefore(end, "month")) {
    out.push(cursor.format("YYYY-MM"));
    cursor = cursor.add(1, "month");
  }
  return out;
}

/** Day buckets for short windows, month buckets once a range spans a quarter. */
export type Granularity = "day" | "month";

export function granularityFor(range: DateRange): Granularity {
  return rangeLengthDays(range) > 92 ? "month" : "day";
}

export function bucketKey(date: ISODate, granularity: Granularity): string {
  return granularity === "month" ? date.slice(0, 7) : date;
}

export function bucketLabel(key: string, granularity: Granularity): string {
  return granularity === "month"
    ? dayjs(`${key}-01`).format("MMM YYYY")
    : dayjs(key).format("MMM D");
}

/** Inclusive-start, exclusive-end overlap — the rule a stay actually follows. */
export function staysOverlap(
  aStart: ISODate,
  aEnd: ISODate,
  bStart: ISODate,
  bEnd: ISODate,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Whether a calendar day falls inside a range (both ends inclusive). */
export function isWithin(date: ISODate, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

/**
 * Nights of a stay that land inside the reporting window. Revenue is recognised
 * per night, so a booking straddling a month boundary contributes to both.
 */
export function nightsWithinRange(
  checkIn: ISODate,
  checkOut: ISODate,
  range: DateRange,
): number {
  const start = dayjs.max(dayjs(checkIn), dayjs(range.start))!;
  // Stays are exclusive of check-out night; the window end is inclusive.
  const end = dayjs.min(dayjs(checkOut), dayjs(range.end).add(1, "day"))!;
  return Math.max(0, end.diff(start, "day"));
}

export { dayjs };
