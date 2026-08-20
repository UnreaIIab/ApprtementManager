"use client";

import { formatDate, formatDateRange, fullName, money, number, percent } from "@/lib/format";
import { dayjs } from "@/lib/date-range";
import { bookingPeriodShare } from "@/data/analytics";
import { PrintCalendar } from "./print-calendar";
import { expenseCategoryLabel } from "@/lib/constants";
import { useT } from "@/i18n";
import type {
  Apartment,
  BookingWithRelations,
  DateRange,
  ExpenseWithRelations,
  KpiSet,
  Organization,
} from "@/types/domain";

/**
 * The printed accounting report.
 *
 * Not the screen in a print stylesheet — a different document with a different
 * job. On screen the reports page is exploratory: charts, comparisons, things to
 * click. Printed, it is a statement handed to an accountant, so it is set in a
 * serif at 8pt, black on white, ruled rather than boxed, and carries the
 * line-by-line detail the charts deliberately summarise away.
 *
 * Nothing here is coloured. Colour costs ink, does not survive a photocopier,
 * and carries no meaning a bookkeeper needs.
 */
export function ReportPrintSheet({
  organization,
  range,
  rangeLabel,
  kpis,
  bookings,
  expenses,
  apartment,
  apartments,
  calendarBookings,
}: {
  organization: Organization | null | undefined;
  range: DateRange;
  rangeLabel: string;
  kpis: KpiSet;
  bookings: BookingWithRelations[];
  expenses: ExpenseWithRelations[];
  /** The unit this report covers; null for the whole portfolio. */
  apartment: Apartment | null;
  /** Rows of the calendar — the scoped portfolio. */
  apartments: Apartment[];
  /**
   * Stays *overlapping* the period, which is a wider set than the ones whose
   * revenue it recognises. A stay carried over from last month occupies days in
   * this one, and a calendar that omitted it would show the apartment as free
   * when it was not.
   */
  calendarBookings: BookingWithRelations[];
}) {
  const t = useT();

  /*
   * Cancelled stays and no-shows release their dates and earn nothing, so they
   * are absent from every figure above — listing them here would make the
   * detail disagree with the summary it is supposed to substantiate.
   */
  /*
   * Every row is a whole booking. Revenue is recognised on the check-in date,
   * so a stay belongs entirely to the period it arrived in and there is nothing
   * to apportion — the column adds up to exactly the revenue above it.
   */
  const live = bookings
    .filter((booking) => booking.status !== "cancelled" && booking.status !== "no_show")
    .map((booking) => ({ booking, share: bookingPeriodShare(booking, range) }))
    .filter((entry) => entry.share.nights > 0)
    .sort((a, b) => a.booking.check_in.localeCompare(b.booking.check_in));

  const costs = [...expenses].sort((a, b) => a.expense_date.localeCompare(b.expense_date));

  const bookingNights = live.reduce((sum, e) => sum + e.share.nights, 0);
  const bookingTotal = live.reduce((sum, e) => sum + e.share.revenue, 0);
  const bookingPaid = live.reduce((sum, e) => sum + e.booking.paid, 0);
  const bookingBalance = live.reduce((sum, e) => sum + e.booking.balance, 0);
  const expenseTotal = costs.reduce((sum, expense) => sum + expense.amount, 0);

  const company = organization?.legal_name || organization?.name || "";

  return (
    <div className="print-sheet">
      {/* --- Letterhead --------------------------------------------- */}
      <header className="ps-head">
        <div>
          <p className="ps-company">{company}</p>
          {organization?.address ? <p className="ps-meta">{organization.address}</p> : null}
          <p className="ps-meta">
            {[
              organization?.tax_id ? `${t.printReport.taxId}: ${organization.tax_id}` : null,
              organization?.email,
              organization?.phone,
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </p>
        </div>
        <div className="ps-head-right">
          <p className="ps-title">{t.printReport.title}</p>
          <p className="ps-meta">
            {t.printReport.period}: {rangeLabel} · {formatDateRange(range.start, range.end)}
          </p>
          <p className="ps-meta">
            {t.printReport.scopedTo}:{" "}
            {apartment ? `${apartment.name} (${apartment.code})` : t.printReport.allApartments}
          </p>
          <p className="ps-meta">
            {t.printReport.issued}: {formatDate(dayjs().format("YYYY-MM-DD"))}
          </p>
        </div>
      </header>

      {/* --- Summary ------------------------------------------------- */}
      {/*
        Two columns of figures rather than a row of tiles: a statement is read
        down a column, and it fits the money and the occupancy side by side
        without either needing its own band of the page.
      */}
      <h2 className="ps-section">{t.printReport.summary}</h2>
      <div className="ps-summary">
        <table className="ps-table">
          <tbody>
            <Line label={t.printReport.revenue} value={money(kpis.revenue)} />
            <Line label={t.printReport.expenses} value={money(kpis.expenses)} />
            <Line label={t.printReport.netProfit} value={money(kpis.netProfit)} strong />
            <Line
              label={t.printReport.margin}
              value={kpis.revenue ? percent(kpis.netProfit / kpis.revenue) : "—"}
            />
          </tbody>
        </table>

        <table className="ps-table">
          <tbody>
            <Line label={t.printReport.bookingCount} value={number(kpis.bookings)} />
            <Line label={t.printReport.nightsSold} value={number(kpis.nightsSold)} />
            <Line label={t.printReport.nightsAvailable} value={number(kpis.nightsAvailable)} />
            <Line label={t.printReport.occupancy} value={percent(kpis.occupancyRate)} />
            <Line label={t.printReport.adr} value={money(kpis.adr)} />
          </tbody>
        </table>
      </div>

      {/* --- Calendar ------------------------------------------------ */}
      <PrintCalendar apartments={apartments} bookings={calendarBookings} range={range} />

      {/* --- Bookings ------------------------------------------------ */}
      <h2 className="ps-section">{t.printReport.bookingsTable}</h2>
      {live.length === 0 ? (
        <p className="ps-empty">{t.printReport.noBookings}</p>
      ) : (
        <table className="ps-table ps-detail">
          <thead>
            <tr>
              <th>{t.printReport.colRef}</th>
              <th>{t.printReport.colApartment}</th>
              <th>{t.printReport.colGuest}</th>
              <th>{t.printReport.colCheckIn}</th>
              <th>{t.printReport.colCheckOut}</th>
              <th className="ps-num">{t.printReport.colNights}</th>
              <th className="ps-num">{t.printReport.colTotal}</th>
              <th className="ps-num">{t.printReport.colPaid}</th>
              <th className="ps-num">{t.printReport.colBalance}</th>
            </tr>
          </thead>
          <tbody>
            {live.map(({ booking, share }) => {
              return (
                <tr key={booking.id}>
                  <td>{booking.reference}</td>
                  <td>{booking.apartment?.name ?? "—"}</td>
                  <td>{fullName(booking.guest)}</td>
                  <td>{formatDate(booking.check_in)}</td>
                  <td>{formatDate(booking.check_out)}</td>
                  <td className="ps-num">{share.nights}</td>
                  <td className="ps-num">{money(share.revenue)}</td>
                  <td className="ps-num">{money(booking.paid)}</td>
                  <td className="ps-num">{money(booking.balance)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>{t.printReport.total}</td>
              <td className="ps-num">{bookingNights}</td>
              <td className="ps-num">{money(bookingTotal)}</td>
              <td className="ps-num">{money(bookingPaid)}</td>
              <td className="ps-num">{money(bookingBalance)}</td>
            </tr>
          </tfoot>
        </table>
      )}

      {/* --- Expenses ------------------------------------------------ */}
      <h2 className="ps-section">{t.printReport.expensesTable}</h2>
      {costs.length === 0 ? (
        <p className="ps-empty">{t.printReport.noExpenses}</p>
      ) : (
        <table className="ps-table ps-detail">
          <thead>
            <tr>
              <th>{t.printReport.colDate}</th>
              <th>{t.printReport.colCategory}</th>
              <th>{t.printReport.colSupplier}</th>
              <th>{t.printReport.colApartment}</th>
              <th className="ps-num">{t.printReport.colAmount}</th>
            </tr>
          </thead>
          <tbody>
            {costs.map((expense) => (
              <tr key={expense.id}>
                <td>{formatDate(expense.expense_date)}</td>
                <td>{expenseCategoryLabel(expense.category)}</td>
                <td>{expense.vendor || expense.description || "—"}</td>
                <td>{expense.apartment?.name ?? "—"}</td>
                <td className="ps-num">{money(expense.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>{t.printReport.total}</td>
              <td className="ps-num">{money(expenseTotal)}</td>
            </tr>
          </tfoot>
        </table>
      )}

      <footer className="ps-foot">
        <span>
          {t.printReport.cancelledExcluded}
          {apartment ? ` ${t.printReport.portfolioWideExcluded}` : ""}
        </span>
        <span>{t.printReport.footer(company)}</span>
      </footer>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <tr className={strong ? "ps-strong" : undefined}>
      <td>{label}</td>
      <td className="ps-num">{value}</td>
    </tr>
  );
}
