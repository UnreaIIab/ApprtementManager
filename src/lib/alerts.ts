import { strings } from "@/i18n";
import { fullName } from "@/lib/format";
import type {
  BookingWithRelations,
  InvoiceWithRelations,
  ISODate,
} from "@/types/domain";

/**
 * Alerts derived from the data already loaded.
 *
 * The `notifications` table is written by nothing, so the bell was permanently
 * empty while the app was perfectly capable of noticing the problem — a guest
 * whose departure was never recorded showed up in Today's operations and
 * nowhere else.
 *
 * These are computed on every read rather than stored, which has two
 * consequences worth stating:
 *
 *   * they are **self-clearing**. Record the departure and the alert is gone,
 *     because the condition that produced it is gone. That is why there is no
 *     "mark as read" on them — dismissing an unfinished task would only hide
 *     the work, and the count is meant to be the number of things still open.
 *   * they cannot be emailed or seen by anyone who is not looking at the app.
 *     A stored, scheduled pipeline is still what that would need.
 */
export interface DerivedAlert {
  id: string;
  title: string;
  body: string;
  href: string;
  severity: "warning" | "critical";
  /** Sort key — the date the condition started, so the oldest surfaces first. */
  since: ISODate;
}

const LIVE = (booking: BookingWithRelations) =>
  booking.status !== "cancelled" && booking.status !== "no_show";

export function deriveAlerts({
  bookings,
  invoices,
  today,
}: {
  bookings: BookingWithRelations[];
  invoices: InvoiceWithRelations[];
  today: ISODate;
}): DerivedAlert[] {
  const a = strings().alerts;
  const out: DerivedAlert[] = [];

  for (const booking of bookings) {
    if (!LIVE(booking)) continue;
    const who = fullName(booking.guest);
    const where = booking.apartment?.name ?? "";

    // Still marked as in-house on or after the departure date.
    if (booking.status === "checked_in" && booking.check_out <= today) {
      const overdue = booking.check_out < today;
      out.push({
        id: `checkout:${booking.id}`,
        title: overdue ? a.checkoutOverdue : a.checkoutToday,
        body: a.bookingLine(who, where, booking.reference),
        href: `/bookings?booking=${booking.id}`,
        severity: overdue ? "critical" : "warning",
        since: booking.check_out,
      });
      continue;
    }

    // Arrival date has passed and nobody checked them in.
    if (
      (booking.status === "confirmed" || booking.status === "pending") &&
      booking.check_in < today
    ) {
      out.push({
        id: `checkin:${booking.id}`,
        title: a.checkinMissed,
        body: a.bookingLine(who, where, booking.reference),
        href: `/bookings?booking=${booking.id}`,
        severity: "critical",
        since: booking.check_in,
      });
      continue;
    }

    // Guest has gone and still owes money.
    if (booking.check_out < today && booking.balance > 0) {
      out.push({
        id: `balance:${booking.id}`,
        title: a.balanceAfterStay,
        body: a.bookingLine(who, where, booking.reference),
        href: `/bookings?booking=${booking.id}`,
        severity: "warning",
        since: booking.check_out,
      });
    }
  }

  for (const invoice of invoices) {
    if (invoice.status === "paid" || invoice.status === "void") continue;
    if (!invoice.due_date || invoice.due_date >= today || invoice.balance <= 0) continue;
    out.push({
      id: `invoice:${invoice.id}`,
      title: a.invoiceOverdue,
      body: a.invoiceLine(invoice.number, fullName(invoice.guest)),
      href: `/invoices?invoice=${invoice.id}`,
      severity: "critical",
      since: invoice.due_date,
    });
  }

  // Most urgent first, then oldest — a two-week-old missed check-out outranks
  // one that only became due this morning.
  const rank = { critical: 0, warning: 1 };
  return out.sort(
    (x, y) => rank[x.severity] - rank[y.severity] || x.since.localeCompare(y.since),
  );
}
