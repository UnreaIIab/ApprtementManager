import { downloadBlob } from "@/lib/utils";
import { fullName } from "@/lib/format";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/constants";
import { strings } from "@/i18n";
import type {
  Apartment,
  BookingWithRelations,
  DateRange,
  ExpenseWithRelations,
  KpiSet,
  Organization,
} from "@/types/domain";

/**
 * The accounting report as a spreadsheet.
 *
 * Deliberately the same document as the printed sheet — same sections, same
 * rows, same totals — so the two exports can never disagree about a period.
 * What differs is the encoding, not the content:
 *
 *   * money is a bare decimal, never "1.250,00 MAD" — a formatted string lands
 *     in Excel as text and will not sum, which defeats the point of a CSV;
 *   * dates are ISO, so they sort and parse in any locale;
 *   * the currency is stated once in the header rather than repeated per cell.
 */

/** Minor units to a plain decimal a spreadsheet will treat as a number. */
const amount = (minor: number) => (minor / 100).toFixed(2);

const escape = (value: unknown) => {
  const str = value == null ? "" : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

const row = (...cells: unknown[]) => cells.map(escape).join(",");

const pct = (label: string) => `${label} (%)`;

export function buildReportCsv({
  organization,
  range,
  rangeLabel,
  kpis,
  bookings,
  expenses,
  apartment,
}: {
  organization: Organization | null | undefined;
  range: DateRange;
  rangeLabel: string;
  kpis: KpiSet;
  bookings: BookingWithRelations[];
  expenses: ExpenseWithRelations[];
  apartment: Apartment | null;
}): string {
  const t = strings();
  const r = t.printReport;

  // Same exclusions as the printed sheet, for the same reason: the detail has
  // to substantiate the summary above it.
  const live = bookings
    .filter((b) => b.status !== "cancelled" && b.status !== "no_show")
    .sort((a, b) => a.check_in.localeCompare(b.check_in));
  const costs = [...expenses].sort((a, b) =>
    a.expense_date.localeCompare(b.expense_date),
  );

  const company = organization?.legal_name || organization?.name || "";
  const currency = organization?.currency ?? "";
  const lines: string[] = [];

  /* --- Header ---------------------------------------------------- */
  lines.push(row(company));
  lines.push(row(r.title));
  lines.push(row(r.period, rangeLabel, range.start, range.end));
  lines.push(
    row(r.scopedTo, apartment ? `${apartment.name} (${apartment.code})` : r.allApartments),
  );
  lines.push(row(t.common.currency, currency));
  if (organization?.tax_id) lines.push(row(r.taxId, organization.tax_id));
  lines.push("");

  /* --- Summary --------------------------------------------------- */
  lines.push(row(r.summary));
  lines.push(row(r.revenue, amount(kpis.revenue)));
  lines.push(row(r.expenses, amount(kpis.expenses)));
  lines.push(row(r.netProfit, amount(kpis.netProfit)));
  // The value is a bare number so it stays summable; the unit moves into the
  // label, which is where a spreadsheet can carry it.
  lines.push(
    row(pct(r.margin), kpis.revenue ? ((kpis.netProfit / kpis.revenue) * 100).toFixed(1) : ""),
  );
  lines.push(row(r.collected, amount(kpis.collected)));
  lines.push(row(r.outstanding, amount(kpis.outstanding)));
  lines.push(row(r.bookingCount, kpis.bookings));
  lines.push(row(r.nightsSold, kpis.nightsSold));
  lines.push(row(r.nightsAvailable, kpis.nightsAvailable));
  lines.push(row(pct(r.occupancy), (kpis.occupancyRate * 100).toFixed(1)));
  lines.push(row(r.adr, amount(kpis.adr)));
  lines.push(row(r.revpar, amount(kpis.revpar)));
  lines.push("");

  /* --- Bookings --------------------------------------------------- */
  lines.push(row(r.bookingsTable));
  if (live.length === 0) {
    lines.push(row(r.noBookings));
  } else {
    lines.push(
      row(
        r.colRef, r.colApartment, r.colGuest, r.colCheckIn, r.colCheckOut,
        r.colNights, r.colTotal, r.colPaid, r.colBalance,
      ),
    );
    for (const booking of live) {
      lines.push(
        row(
          booking.reference,
          booking.apartment?.name ?? "",
          fullName(booking.guest),
          booking.check_in,
          booking.check_out,
          booking.nights,
          amount(booking.total),
          amount(booking.paid),
          amount(booking.balance),
        ),
      );
    }
    lines.push(
      row(
        r.total, "", "", "", "",
        live.reduce((s, b) => s + b.nights, 0),
        amount(live.reduce((s, b) => s + b.total, 0)),
        amount(live.reduce((s, b) => s + b.paid, 0)),
        amount(live.reduce((s, b) => s + b.balance, 0)),
      ),
    );
  }
  lines.push("");

  /* --- Expenses ---------------------------------------------------- */
  lines.push(row(r.expensesTable));
  if (costs.length === 0) {
    lines.push(row(r.noExpenses));
  } else {
    lines.push(row(r.colDate, r.colCategory, r.colSupplier, r.colApartment, r.colAmount));
    for (const expense of costs) {
      lines.push(
        row(
          expense.expense_date,
          EXPENSE_CATEGORY_LABELS[expense.category],
          expense.vendor || expense.description || "",
          expense.apartment?.name ?? "",
          amount(expense.amount),
        ),
      );
    }
    lines.push(
      row(r.total, "", "", "", amount(costs.reduce((s, e) => s + e.amount, 0))),
    );
  }

  /* --- Notes ------------------------------------------------------- */
  lines.push("");
  lines.push(row(r.cancelledExcluded));
  if (apartment) lines.push(row(r.portfolioWideExcluded));

  return lines.join("\n");
}

export function downloadReportCsv(
  args: Parameters<typeof buildReportCsv>[0] & { filename: string },
) {
  const { filename, ...rest } = args;
  // BOM so Excel opens the accented labels as UTF-8.
  downloadBlob(`﻿${buildReportCsv(rest)}`, filename, "text/csv;charset=utf-8");
}
