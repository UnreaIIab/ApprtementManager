"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ban, Copy, CreditCard, Download, FileText, Mail, MoreHorizontal, Plus,
  Printer, Search, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { exportCsv, matches } from "@/lib/utils";
import { useT } from "@/i18n";
import { formatDate, fullName, money } from "@/lib/format";
import { INVOICE_STATUS_META } from "@/lib/constants";
import { INVOICE_STATUSES } from "@/types/domain";
import { toISODate, dayjs } from "@/lib/date-range";
import { useDateFilter } from "@/hooks/use-date-filter";
import { useQueryParam } from "@/hooks/use-query-param";
import {
  useCreateInvoice, useDeleteInvoice, useInvoices, useOrganization, useUpdateInvoice,
} from "@/data/queries";
import { PageHeader, FilterBar } from "@/components/layout/page-header";
import { DataTable, type Column, type SortState } from "@/components/ui/data-table";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/badge";
import { Menu } from "@/components/ui/menu";
import { Drawer, useConfirm } from "@/components/ui/overlay";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { InvoiceDocument } from "@/components/invoices/invoice-document";
import { PaymentDialog } from "@/components/payments/payment-dialog";
import type { InvoiceWithRelations } from "@/types/domain";

export default function InvoicesPage() {
  return (
    <Suspense fallback={null}>
      <InvoicesView />
    </Suspense>
  );
}

function InvoicesView() {
  const t = useT();
  const router = useRouter();
  const [linkedInvoiceId, clearLinkedInvoice] = useQueryParam("invoice");
  const { range, label } = useDateFilter();
  const { data: invoices, isLoading } = useInvoices();
  const organization = useOrganization();
  const updateInvoice = useUpdateInvoice();
  const deleteInvoice = useDeleteInvoice();
  const createInvoice = useCreateInvoice();
  const { confirm, dialog } = useConfirm();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState<SortState | null>({ key: "issue_date", direction: "desc" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [paymentFor, setPaymentFor] = useState<string | null>(null);

  const activePreviewId = previewId ?? linkedInvoiceId;
  const preview = activePreviewId
    ? (invoices.find((invoice) => invoice.id === activePreviewId) ?? null)
    : null;

  const closePreview = () => {
    setPreviewId(null);
    if (linkedInvoiceId) clearLinkedInvoice();
  };

  const inRange = useMemo(
    () =>
      invoices.filter(
        (invoice) => invoice.issue_date >= range.start && invoice.issue_date <= range.end,
      ),
    [invoices, range],
  );

  const filtered = useMemo(
    () =>
      inRange.filter((invoice) => {
        if (statusFilter !== "all" && invoice.status !== statusFilter) return false;
        if (query.trim()) {
          const haystack = `${invoice.number} ${invoice.guest ? fullName(invoice.guest) : ""} ${invoice.apartment?.name ?? ""}`;
          if (!matches(haystack, query)) return false;
        }
        return true;
      }),
    [inRange, statusFilter, query],
  );

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, invoice) => ({
          invoiced: acc.invoiced + (invoice.status === "void" ? 0 : invoice.total),
          paid: acc.paid + invoice.paid,
          outstanding:
            acc.outstanding + (invoice.status === "void" ? 0 : Math.max(0, invoice.balance)),
          overdue:
            acc.overdue + (invoice.status === "overdue" ? Math.max(0, invoice.balance) : 0),
        }),
        { invoiced: 0, paid: 0, outstanding: 0, overdue: 0 },
      ),
    [filtered],
  );

  const voidInvoice = async (invoice: InvoiceWithRelations) => {
    const ok = await confirm({
      title: t.invoices.voidConfirm(invoice.number),
      message:
        "A voided invoice stays on record for the audit trail but no longer counts toward outstanding balances.",
      confirmLabel: t.invoices.voidInvoice,
      destructive: true,
    });
    if (ok) updateInvoice.mutate({ id: invoice.id, patch: { status: "void" } });
  };

  const remove = async (invoice: InvoiceWithRelations) => {
    const ok = await confirm({
      title: t.invoices.deleteConfirm(invoice.number),
      message: t.invoices.deletePermanent,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (ok) deleteInvoice.mutate(invoice.id);
  };

  const duplicate = async (invoice: InvoiceWithRelations) => {
    await createInvoice.mutateAsync({
      invoice: {
        booking_id: invoice.booking_id,
        guest_id: invoice.guest_id,
        apartment_id: invoice.apartment_id,
        issue_date: toISODate(dayjs()),
        due_date: toISODate(dayjs().add(14, "day")),
        subtotal: invoice.subtotal,
        tax: invoice.tax,
        discount: invoice.discount,
        total: invoice.total,
        status: "draft",
        notes: invoice.notes,
        terms: invoice.terms,
      },
      items: invoice.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
        position: item.position,
      })),
    });
  };

  const emailInvoice = (invoice: InvoiceWithRelations) => {
    const email = invoice.guest?.email;
    if (!email) {
      toast.error(t.invoices.noEmailOnFile);
      return;
    }
    const subject = encodeURIComponent(t.invoices.emailSubject(invoice.number, organization?.name ?? ""));
    const body = encodeURIComponent(
      t.invoices.emailGreeting(invoice.guest?.first_name ?? "") +
        `Please find invoice ${invoice.number} for ${money(invoice.total)}, due ${formatDate(invoice.due_date)}.\n` +
        t.invoices.emailBalance(money(invoice.balance)) +
        t.invoices.emailSignoff(organization?.name ?? ""),
    );
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    if (invoice.status === "draft") {
      updateInvoice.mutate({ id: invoice.id, patch: { status: "sent" } });
    }
  };

  const exportRows = (rows: InvoiceWithRelations[]) =>
    exportCsv(
      `invoices-${range.start}-to-${range.end}.csv`,
      rows.map((invoice) => ({
        number: invoice.number,
        guest: invoice.guest ? fullName(invoice.guest) : "",
        apartment: invoice.apartment?.name ?? "",
        booking: invoice.booking?.reference ?? "",
        issue_date: invoice.issue_date,
        due_date: invoice.due_date ?? "",
        subtotal: (invoice.subtotal / 100).toFixed(2),
        tax: (invoice.tax / 100).toFixed(2),
        discount: (invoice.discount / 100).toFixed(2),
        total: (invoice.total / 100).toFixed(2),
        paid: (invoice.paid / 100).toFixed(2),
        balance: (invoice.balance / 100).toFixed(2),
        status: INVOICE_STATUS_META[invoice.status].label,
      })),
    );

  const columns: Column<InvoiceWithRelations>[] = [
    {
      key: "number",
      header: "Invoice",
      sortValue: (row) => row.number,
      cell: (row) => (
        <span className="block">
          <span className="block font-medium text-ink">{row.number}</span>
          <span className="block text-[12px] text-ink-3">
            {row.booking?.reference ?? t.payments.noBooking}
          </span>
        </span>
      ),
    },
    {
      key: "guest",
      header: "Guest",
      sortValue: (row) => (row.guest ? row.guest.last_name : ""),
      cell: (row) =>
        row.guest ? (
          <Link
            href={`/guests/${row.guest.id}`}
            onClick={(event) => event.stopPropagation()}
            className="text-ink hover:underline"
          >
            {fullName(row.guest)}
          </Link>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      key: "apartment",
      header: "Apartment",
      secondary: true,
      sortValue: (row) => row.apartment?.name ?? "",
      cell: (row) => <span className="text-ink-2">{row.apartment?.name ?? "—"}</span>,
    },
    {
      key: "issue_date",
      header: "Issued",
      sortValue: (row) => row.issue_date,
      cell: (row) => <span className="text-ink tnum">{formatDate(row.issue_date)}</span>,
    },
    {
      key: "due_date",
      header: "Due",
      sortValue: (row) => row.due_date ?? "",
      cell: (row) => {
        const overdue = row.status === "overdue";
        return (
          <span className={overdue ? "font-medium text-critical tnum" : "text-ink-2 tnum"}>
            {formatDate(row.due_date)}
          </span>
        );
      },
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      sortValue: (row) => row.total,
      cell: (row) => <span className="font-medium text-ink tnum">{money(row.total)}</span>,
    },
    {
      key: "paid",
      header: "Paid",
      align: "right",
      secondary: true,
      sortValue: (row) => row.paid,
      cell: (row) => <span className="text-ink-2 tnum">{money(row.paid)}</span>,
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      sortValue: (row) => row.balance,
      cell: (row) => (
        <span className={row.balance > 0 ? "font-medium text-serious tnum" : "text-ink-3 tnum"}>
          {money(row.balance)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (row) => row.status,
      cell: (row) => <StatusBadge size="sm" meta={INVOICE_STATUS_META[row.status]} />,
    },
    {
      key: "actions",
      header: "",
      width: "48px",
      cell: (row) => (
        <span onClick={(event) => event.stopPropagation()}>
          <Menu
            align="end"
            trigger={({ toggle, ref }) => (
              <IconButton
                ref={ref}
                label={t.invoices.invoiceActions}
                onClick={toggle}
                icon={<MoreHorizontal className="size-4" />}
              />
            )}
            items={[
              { label: t.invoices.preview, icon: <FileText />, onSelect: () => setPreviewId(row.id) },
              { label: t.invoices.emailToGuest, icon: <Mail />, onSelect: () => emailInvoice(row) },
              {
                label: t.invoices.printPdf,
                icon: <Printer />,
                onSelect: () => {
                  setPreviewId(row.id);
                  window.setTimeout(() => window.print(), 350);
                },
              },
              {
                label: t.payments.recordPayment,
                icon: <CreditCard />,
                separatorBefore: true,
                disabled: row.balance <= 0,
                onSelect: () => setPaymentFor(row.id),
              },
              { label: t.common.duplicate, icon: <Copy />, onSelect: () => void duplicate(row) },
              { label: t.bookings.exportRow, icon: <Download />, onSelect: () => exportRows([row]) },
              {
                label: "Void",
                icon: <Ban />,
                separatorBefore: true,
                disabled: row.status === "void",
                onSelect: () => void voidInvoice(row),
              },
              {
                label: t.common.delete,
                icon: <Trash2 />,
                destructive: true,
                onSelect: () => void remove(row),
              },
            ]}
          />
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t.invoices.title}
        description={`${filtered.length} issued · ${label}`}
        actions={
          <>
            <Button variant="outline" icon={<Download className="size-4" />} onClick={() => exportRows(filtered)}>
              Export
            </Button>
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={() => router.push("/bookings?new=1")}
            >
              New booking invoice
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t.invoices.invoiced} value={money(totals.invoiced, { cents: false })} hint={label} />
        <KpiCard label={t.invoices.collected} value={money(totals.paid, { cents: false })} hint="against these invoices" />
        <KpiCard label={t.invoices.outstanding} value={money(totals.outstanding, { cents: false })} hint="still to collect" />
        <KpiCard label={t.invoices.overdue} value={money(totals.overdue, { cents: false })} hint="past the due date" />
      </div>

      <FilterBar>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.invoices.searchPlaceholder}
            aria-label={t.invoices.searchInvoices}
            className="h-9 w-[260px] pl-9 text-[13px]"
          />
        </div>

        <Select
          aria-label={t.invoices.filterByStatus}
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-9 w-[150px] text-[13px]"
        >
          <option value="all">{t.invoices.allStatuses}</option>
          {INVOICE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {INVOICE_STATUS_META[status].label}
            </option>
          ))}
        </Select>
      </FilterBar>

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(row) => row.id}
        loading={isLoading}
        sort={sort}
        onSortChange={setSort}
        onRowClick={(row) => setPreviewId(row.id)}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        maxHeight="calc(100dvh - 320px)"
        emptyTitle={t.invoices.noneInPeriod}
        emptyDescription={t.invoices.createdAlongside}
        bulkActions={(ids) => (
          <>
            <Button
              size="sm"
              variant="outline"
              icon={<Download className="size-3.5" />}
              onClick={() => exportRows(filtered.filter((row) => ids.includes(row.id)))}
            >
              Export
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={<Printer className="size-3.5" />}
              onClick={() => window.print()}
            >
              Print
            </Button>
          </>
        )}
        footer={
          filtered.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-line bg-surface-2 px-4 py-2.5 text-[12.5px]">
              <span className="text-ink-3">{t.reports.totals}</span>
              <span className="text-ink-2">
                Invoiced <span className="font-medium text-ink tnum">{money(totals.invoiced)}</span>
              </span>
              <span className="text-ink-2">
                Paid <span className="font-medium text-ink tnum">{money(totals.paid)}</span>
              </span>
              <span className="text-ink-2">
                Outstanding{" "}
                <span className="font-medium text-serious tnum">{money(totals.outstanding)}</span>
              </span>
            </div>
          ) : null
        }
      />

      <Drawer
        open={Boolean(preview)}
        onClose={closePreview}
        width="xl"
        title={preview?.number ?? "Invoice"}
        subtitle={preview ? `${fullName(preview.guest)} · ${money(preview.total)}` : undefined}
        footer={
          preview ? (
            <>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Printer className="size-4" />}
                  onClick={() => window.print()}
                >
                  Print / PDF
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Mail className="size-4" />}
                  onClick={() => emailInvoice(preview)}
                >
                  Email
                </Button>
              </div>
              {preview.balance > 0 ? (
                <Button
                  size="sm"
                  variant="primary"
                  icon={<CreditCard className="size-4" />}
                  onClick={() => setPaymentFor(preview.id)}
                >
                  Record payment
                </Button>
              ) : null}
            </>
          ) : null
        }
      >
        {preview ? <InvoiceDocument invoice={preview} organization={organization} /> : null}
      </Drawer>

      <PaymentDialog
        open={Boolean(paymentFor)}
        onClose={() => setPaymentFor(null)}
        invoiceId={paymentFor ?? undefined}
      />
      {dialog}
    </>
  );
}
