"use client";

import { dayjs } from "@/lib/date-range";
import { fullName } from "@/lib/format";
import { strings } from "@/i18n";
import { BOOKING_STATUS_META } from "@/lib/constants";
import type {
  Apartment,
  BookingStatus,
  BookingWithRelations,
  DateRange,
} from "@/types/domain";

/** The statuses a bar can carry; cancelled stays never reach the calendar. */
const CALENDAR_STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "checked_in",
  "checked_out",
];

/**
 * The month timeline, for paper.
 *
 * A row per apartment, a column per day, a bar per stay — the same shape as the
 * Calendar screen, redrawn for print. It earns its place in an accounting
 * report by making the nights figure legible: a reader can see *where* the 37
 * nights came from and which days stood empty, which no table of totals shows.
 *
 * Bars are positioned as percentages of the month rather than in pixels, so
 * they survive being rendered at whatever width the printer decides on.
 */
export function PrintCalendar({
  apartments,
  bookings,
  range,
}: {
  apartments: Apartment[];
  bookings: BookingWithRelations[];
  range: DateRange;
}) {
  const t = strings();
  const months = monthsIn(range);
  const live = bookings.filter(
    (b) => b.status !== "cancelled" && b.status !== "no_show",
  );

  if (apartments.length === 0 || months.length === 0) return null;

  return (
    <>
      <h2 className="ps-section">{t.printReport.calendar}</h2>

      {/*
        Colour carries the booking's status, the same four tones the on-screen
        calendar uses, so the printed month is recognisable as the same object.
        It is never colour alone: each bar keeps a solid coloured left edge that
        survives a printer with "background graphics" switched off, and the
        legend names every tone.
      */}
      <ul className="ps-cal-legend">
        {CALENDAR_STATUSES.map((status) => (
          <li key={status}>
            <span className={`ps-cal-key ps-cal-${status}`} aria-hidden />
            {BOOKING_STATUS_META[status].label}
          </li>
        ))}
      </ul>
      {months.map((month) => (
        <MonthBlock
          key={month}
          month={month}
          apartments={apartments}
          bookings={live}
          multiple={months.length > 1}
        />
      ))}
    </>
  );
}

function MonthBlock({
  month,
  apartments,
  bookings,
  multiple,
}: {
  month: string;
  apartments: Apartment[];
  bookings: BookingWithRelations[];
  multiple: boolean;
}) {
  const start = dayjs(`${month}-01`);
  const days = start.daysInMonth();
  const monthStart = start.format("YYYY-MM-DD");
  const monthEndExclusive = start.add(1, "month").format("YYYY-MM-DD");

  return (
    <div className="ps-cal">
      {multiple ? (
        <p className="ps-cal-month">{start.format(strings().format.monthAxis)}</p>
      ) : null}

      <div className="ps-cal-head">
        <span className="ps-cal-name" />
        <span className="ps-cal-track">
          {Array.from({ length: days }, (_, i) => {
            const day = start.date(i + 1);
            const weekend = day.day() === 0 || day.day() === 6;
            return (
              <span
                key={i}
                className={weekend ? "ps-cal-day ps-cal-weekend" : "ps-cal-day"}
                style={{ width: `${100 / days}%` }}
              >
                {i + 1}
              </span>
            );
          })}
        </span>
      </div>

      {apartments.map((apartment) => (
        <div key={apartment.id} className="ps-cal-row">
          <span className="ps-cal-name">{apartment.name}</span>
          <span className="ps-cal-track">
            {/* Weekend shading sits under the bars. */}
            {Array.from({ length: days }, (_, i) => {
              const day = start.date(i + 1);
              const weekend = day.day() === 0 || day.day() === 6;
              return (
                <span
                  key={i}
                  className={weekend ? "ps-cal-cell ps-cal-weekend" : "ps-cal-cell"}
                  style={{ width: `${100 / days}%` }}
                />
              );
            })}

            {bookings
              .filter((b) => b.apartment_id === apartment.id)
              .map((booking) => {
                const from = booking.check_in > monthStart ? booking.check_in : monthStart;
                const to =
                  booking.check_out < monthEndExclusive ? booking.check_out : monthEndExclusive;
                const nights = dayjs(to).diff(dayjs(from), "day");
                if (nights <= 0) return null;
                const offset = dayjs(from).diff(start, "day");
                return (
                  <span
                    key={booking.id}
                    className={`ps-cal-bar ps-cal-${booking.status}`}
                    style={{
                      left: `${(offset / days) * 100}%`,
                      width: `${(nights / days) * 100}%`,
                    }}
                  >
                    <span className="ps-cal-guest">{fullName(booking.guest)}</span>
                  </span>
                );
              })}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Every month the range touches, as `YYYY-MM`. */
function monthsIn(range: DateRange): string[] {
  const out: string[] = [];
  let cursor = dayjs(range.start).startOf("month");
  const last = dayjs(range.end).startOf("month");
  while (!cursor.isAfter(last, "month")) {
    out.push(cursor.format("YYYY-MM"));
    cursor = cursor.add(1, "month");
  }
  return out;
}
