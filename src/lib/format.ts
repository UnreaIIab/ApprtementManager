import dayjs from "dayjs";
import { setActiveLocale, strings } from "@/i18n";
import type { ISODate, ISODateTime } from "@/types/domain";

/**
 * Formatting layer. Money enters as **minor units** and leaves as a string —
 * this is the only place that divides by 100.
 */

let activeCurrency = "USD";
let activeLocale = strings().tag;

/**
 * Point the formatting layer at a company's currency and language.
 *
 * Both are module state rather than context because these functions are called
 * from plain modules as well as components. Called from the snapshot query so
 * it always runs before anything renders with the result.
 */
export function configureFormatting(currency: string, locale?: string) {
  activeCurrency = currency || "USD";
  if (locale) {
    setActiveLocale(locale);
    activeLocale = strings().tag;
  }
}

const currencyCache = new Map<string, Intl.NumberFormat>();

function currencyFormatter(fractionDigits: number, currency: string) {
  const key = `${activeLocale}:${currency}:${fractionDigits}`;
  let fmt = currencyCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(activeLocale, {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    currencyCache.set(key, fmt);
  }
  return fmt;
}

/** `1234567` -> `$12,345.67` */
export function money(minor: number, opts?: { currency?: string; cents?: boolean }) {
  const currency = opts?.currency ?? activeCurrency;
  const cents = opts?.cents ?? true;
  const value = (minor ?? 0) / 100;
  return currencyFormatter(cents ? 2 : 0, currency).format(value);
}

/** Compact money for axis ticks and dense KPI tiles: `$12.3k`, `$1.2M`. */
export function moneyCompact(minor: number, currency = activeCurrency) {
  const value = (minor ?? 0) / 100;
  const abs = Math.abs(value);
  const symbol = currencySymbol(currency);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${symbol}${trim(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}${symbol}${trim(abs / 1_000)}k`;
  return `${sign}${symbol}${Math.round(abs)}`;
}

function trim(value: number) {
  return value >= 100 ? Math.round(value).toString() : value.toFixed(1).replace(/\.0$/, "");
}

export function currencySymbol(currency = activeCurrency) {
  try {
    return (
      new Intl.NumberFormat(activeLocale, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      })
        .formatToParts(0)
        .find((part) => part.type === "currency")?.value ?? currency
    );
  } catch {
    return currency;
  }
}

export function number(value: number, digits = 0) {
  return new Intl.NumberFormat(activeLocale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value ?? 0);
}

/** `0.734` -> `73.4%` */
export function percent(fraction: number, digits = 1) {
  return `${((fraction ?? 0) * 100).toFixed(digits)}%`;
}

export function signedPercent(fraction: number, digits = 1) {
  const pct = (fraction ?? 0) * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(digits)}%`;
}

/* ---------------------------------------------------------------- */
/* Dates                                                             */
/* ---------------------------------------------------------------- */

export function formatDate(value: ISODate | ISODateTime | null | undefined, pattern?: string) {
  if (!value) return strings().format.empty;
  return dayjs(value).format(pattern ?? strings().format.dateMedium);
}

export function formatShortDate(value: ISODate | null | undefined) {
  return formatDate(value, strings().format.dateShort);
}

export function formatDateTime(value: ISODateTime | null | undefined) {
  return formatDate(value, strings().format.dateTime);
}

export function formatTime(value: string | null | undefined) {
  if (!value) return strings().format.empty;
  // Bare `HH:mm:ss` from Postgres `time` columns has no date to parse against.
  const bare = /^\d{2}:\d{2}/.exec(value);
  if (bare) return value.slice(0, 5);
  return dayjs(value).format("HH:mm");
}

/** `Mar 3 – 9, 2026` when the range shares a month, full dates otherwise. */
export function formatDateRange(start: ISODate, end: ISODate) {
  const f = strings().format;
  const a = dayjs(start);
  const b = dayjs(end);
  if (a.isSame(b, "day")) return a.format(f.dateMedium);
  if (a.isSame(b, "month")) {
    return `${a.format(f.rangeSameMonthStart)} – ${b.format(f.rangeSameMonthEnd)}`;
  }
  return `${a.format(f.dateShort)} – ${b.format(f.dateMedium)}`;
}

export function relativeTime(value: ISODateTime | null | undefined) {
  const f = strings().format;
  if (!value) return f.empty;
  const then = dayjs(value);
  const diffMinutes = dayjs().diff(then, "minute");
  if (diffMinutes < 1) return f.justNow;
  if (diffMinutes < 60) return f.minutesAgo(diffMinutes);
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return f.hoursAgo(diffHours);
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return f.daysAgo(diffDays);
  if (diffDays < 30) return f.weeksAgo(Math.floor(diffDays / 7));
  return then.format(f.dateMedium);
}

export function nightsLabel(count: number) {
  return strings().format.nights(count);
}

export function guestsLabel(adults: number, children: number) {
  const f = strings().format;
  const parts = [f.adults(adults)];
  if (children > 0) parts.push(f.children(children));
  return parts.join(", ");
}

export function fullName(guest: { first_name: string; last_name: string } | null | undefined) {
  if (!guest) return strings().format.empty;
  return `${guest.first_name} ${guest.last_name}`.trim();
}

/** Turns an enum member into a human label: `booking_com` -> `Booking.com`. */
const LABEL_OVERRIDES: Record<string, string> = {
  booking_com: "Booking.com",
  airbnb: "Airbnb",
  vrbo: "Vrbo",
  adr: "ADR",
  revpar: "RevPAR",
  no_show: "No-show",
  checked_in: "Checked in",
  checked_out: "Checked out",
  check_in: "Check-in",
  check_out: "Check-out",
  paypal: "PayPal",
  vip: "VIP",
  id: "ID",
};

export function humanize(value: string | null | undefined): string {
  if (!value) return strings().format.empty;
  if (LABEL_OVERRIDES[value]) return LABEL_OVERRIDES[value];
  return value
    .split("_")
    .map((word, index) =>
      index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word,
    )
    .join(" ");
}

export function fileSize(bytes: number | null | undefined) {
  if (!bytes) return strings().format.empty;
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
