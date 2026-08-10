"use client";

import { formatDate, fullName, money, nightsLabel } from "@/lib/format";
import { useT } from "@/i18n";
import { INVOICE_STATUS_META } from "@/lib/constants";
import { StatusBadge } from "@/components/ui/badge";
import type { InvoiceWithRelations, Organization } from "@/types/domain";

/**
 * Printable invoice.
 *
 * Rendered as ordinary HTML rather than a canvas or PDF library so it stays
 * selectable, translatable and accessible; the print stylesheet in
 * `globals.css` drops the app chrome, and the browser's "Save as PDF" produces
 * the downloadable document.
 */
export function InvoiceDocument({
  invoice,
  organization,
}: {
  invoice: InvoiceWithRelations;
  organization: Organization | null;
}) {
  const t = useT();
  const meta = INVOICE_STATUS_META[invoice.status];

  return (
    <article className="print-full mx-auto w-full max-w-[820px] bg-surface p-8 text-ink sm:p-10">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
        <div>
          <p className="text-[19px] font-semibold tracking-[-0.02em]">
            {organization?.name ?? "Property Management"}
          </p>
          {organization?.legal_name ? (
            <p className="mt-0.5 text-[12.5px] text-ink-2">{organization.legal_name}</p>
          ) : null}
          <address className="mt-2 whitespace-pre-line text-[12.5px] not-italic leading-relaxed text-ink-2">
            {organization?.address ?? ""}
            {organization?.email ? `\n${organization.email}` : ""}
            {organization?.phone ? `\n${organization.phone}` : ""}
            {organization?.tax_id ? `\nTax ID: ${organization.tax_id}` : ""}
          </address>
        </div>

        <div className="text-right">
          <h1 className="text-[26px] font-semibold tracking-[-0.03em]">{t.invoices.invoice}</h1>
          <p className="mt-1 text-[14px] font-medium text-ink tnum">{invoice.number}</p>
          <div className="mt-2 flex justify-end">
            <StatusBadge meta={meta} />
          </div>
        </div>
      </header>

      <section className="grid gap-6 border-b border-line py-6 sm:grid-cols-3">
        <div>
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{t.ui.billedTo}</h2>
          <p className="mt-1.5 text-[14px] font-medium">{fullName(invoice.guest)}</p>
          <p className="text-[12.5px] leading-relaxed text-ink-2">
            {invoice.guest?.email ?? ""}
            {invoice.guest?.phone ? <br /> : null}
            {invoice.guest?.phone ?? ""}
            {invoice.guest?.address ? <br /> : null}
            {[invoice.guest?.address, invoice.guest?.city, invoice.guest?.country]
              .filter(Boolean)
              .join(", ")}
          </p>
        </div>

        <div>
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-ink-3">Stay</h2>
          <p className="mt-1.5 text-[14px] font-medium">{invoice.apartment?.name ?? "—"}</p>
          {invoice.booking ? (
            <p className="text-[12.5px] leading-relaxed text-ink-2 tnum">
              {formatDate(invoice.booking.check_in, "MMM D, YYYY")} →{" "}
              {formatDate(invoice.booking.check_out, "MMM D, YYYY")}
              <br />
              {nightsLabel(invoice.booking.nights)} ·{" "}
              {invoice.booking.adults + invoice.booking.children} guests
              <br />
              Ref {invoice.booking.reference}
            </p>
          ) : null}
        </div>

        <div>
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{t.ui.dates}</h2>
          <dl className="mt-1.5 space-y-1 text-[12.5px]">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">{t.invoices.issued}</dt>
              <dd className="tnum">{formatDate(invoice.issue_date)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Due</dt>
              <dd className="tnum">{formatDate(invoice.due_date)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="py-6">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="py-2 text-left text-[11px] font-medium uppercase tracking-wide text-ink-3">
                  Description
                </th>
                <th scope="col" className="py-2 text-right text-[11px] font-medium uppercase tracking-wide text-ink-3">
                  Qty
                </th>
                <th scope="col" className="py-2 text-right text-[11px] font-medium uppercase tracking-wide text-ink-3">
                  {t.invoices.unitPrice}
                </th>
                <th scope="col" className="py-2 text-right text-[11px] font-medium uppercase tracking-wide text-ink-3">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr key={item.id} className="border-b border-line">
                  <td className="py-2.5 pr-4">{item.description}</td>
                  <td className="py-2.5 text-right tnum">{item.quantity}</td>
                  <td className="py-2.5 text-right tnum">{money(item.unit_price)}</td>
                  <td className="py-2.5 text-right font-medium tnum">{money(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex justify-end">
          <dl className="w-full max-w-xs space-y-1.5 text-[13px]">
            <Row label={t.common.subtotal} value={money(invoice.subtotal)} />
            {invoice.discount > 0 ? (
              <Row label={t.bookings.discount} value={`− ${money(invoice.discount)}`} />
            ) : null}
            <Row label={`Tax (${organization?.tax_rate ?? 0}%)`} value={money(invoice.tax)} />
            <div className="flex items-center justify-between border-t border-line pt-2 text-[16px] font-semibold">
              <dt>{t.common.total}</dt>
              <dd className="tnum">{money(invoice.total)}</dd>
            </div>
            <Row label={t.bookings.paid} value={money(invoice.paid)} />
            <div className="flex items-center justify-between border-t border-line pt-2 text-[14px] font-semibold">
              <dt>{t.ui.balanceDue}</dt>
              <dd className={invoice.balance > 0 ? "text-serious tnum" : "tnum"}>
                {money(invoice.balance)}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {invoice.notes || invoice.terms ? (
        <footer className="border-t border-line pt-5 text-[12px] leading-relaxed text-ink-2">
          {invoice.notes ? <p className="mb-2">{invoice.notes}</p> : null}
          {invoice.terms ? <p>{invoice.terms}</p> : null}
        </footer>
      ) : null}
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-2">{label}</dt>
      <dd className="tnum">{value}</dd>
    </div>
  );
}
