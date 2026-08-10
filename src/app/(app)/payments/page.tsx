"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, Download, MoreHorizontal, Plus, Search, Trash2, Wallet } from "lucide-react";
import { exportCsv, matches } from "@/lib/utils";
import { useT } from "@/i18n";
import { formatDate, fullName, money, percent } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_META } from "@/lib/constants";
import { PAYMENT_METHODS, PAYMENT_STATUSES } from "@/types/domain";
import { computeCashFlow } from "@/data/analytics";
import { granularityFor, toISODate } from "@/lib/date-range";
import { useDateFilter } from "@/hooks/use-date-filter";
import { useQueryParam } from "@/hooks/use-query-param";
import { useAnalytics } from "@/hooks/use-analytics";
import {
  useBookings, useDeletePayment, useExpenses, usePayments,
} from "@/data/queries";
import { PageHeader, FilterBar } from "@/components/layout/page-header";
import { DataTable, type Column, type SortState } from "@/components/ui/data-table";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/badge";
import { Menu } from "@/components/ui/menu";
import { useConfirm } from "@/components/ui/overlay";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartCard, ChartTable } from "@/components/charts/chart-card";
import { RankedBars, TrendChart } from "@/components/charts/charts";
import { PaymentDialog } from "@/components/payments/payment-dialog";
import type { PaymentWithRelations } from "@/types/domain";

export default function PaymentsPage() {
  return (
    <Suspense fallback={null}>
      <PaymentsView />
    </Suspense>
  );
}

function PaymentsView() {
  const t = useT();
  const router = useRouter();
  const [newParam, clearNewParam] = useQueryParam("new");
  const { range, label } = useDateFilter();
  const { data: payments, isLoading } = usePayments();
  const { data: bookings } = useBookings();
  const { data: expenses } = useExpenses();
  const { kpis, delta } = useAnalytics();
  const deletePayment = useDeletePayment();
  const { confirm, dialog } = useConfirm();

  const [query, setQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState<SortState | null>({ key: "paid_at", direction: "desc" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);

  const inRange = useMemo(
    () =>
      payments.filter((payment) => {
        const date = toISODate(payment.paid_at);
        return date >= range.start && date <= range.end;
      }),
    [payments, range],
  );

  const filtered = useMemo(
    () =>
      inRange.filter((payment) => {
        if (methodFilter !== "all" && payment.method !== methodFilter) return false;
        if (statusFilter !== "all" && payment.status !== statusFilter) return false;
        if (query.trim()) {
          const haystack = `${payment.reference ?? ""} ${payment.note ?? ""} ${payment.guest ? fullName(payment.guest) : ""} ${payment.booking?.reference ?? ""}`;
          if (!matches(haystack, query)) return false;
        }
        return true;
      }),
    [inRange, methodFilter, statusFilter, query],
  );

  const totals = useMemo(() => {
    const collected = filtered
      .filter((payment) => payment.status === "paid" || payment.status === "partial")
      .reduce((acc, payment) => acc + payment.amount, 0);
    const refunded = filtered
      .filter((payment) => payment.status === "refunded")
      .reduce((acc, payment) => acc + payment.amount, 0);
    const pending = filtered
      .filter((payment) => payment.status === "pending")
      .reduce((acc, payment) => acc + payment.amount, 0);
    return { collected, refunded, pending, net: collected - refunded };
  }, [filtered]);

  const cashFlow = useMemo(
    () => computeCashFlow(payments, expenses, range, granularityFor(range)),
    [payments, expenses, range],
  );

  /** Split of collected money by method — the mix operators actually track. */
  const methodMix = useMemo(() => {
    const totalsByMethod = new Map<string, number>();
    for (const payment of filtered) {
      if (payment.status !== "paid" && payment.status !== "partial") continue;
      totalsByMethod.set(
        payment.method,
        (totalsByMethod.get(payment.method) ?? 0) + payment.amount,
      );
    }
    const grand = Array.from(totalsByMethod.values()).reduce((acc, value) => acc + value, 0);
    return Array.from(totalsByMethod.entries())
      .map(([method, value], index) => ({
        key: method,
        label: PAYMENT_METHOD_LABELS[method as keyof typeof PAYMENT_METHOD_LABELS],
        value,
        share: grand ? value / grand : 0,
        color: `var(--series-${(index % 8) + 1})`,
      }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const outstandingBookings = useMemo(
    () =>
      bookings
        .filter(
          (booking) =>
            booking.balance > 0 &&
            booking.status !== "cancelled" &&
            booking.status !== "no_show",
        )
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 8),
    [bookings],
  );

  const remove = async (payment: PaymentWithRelations) => {
    const ok = await confirm({
      title: t.payments.removeConfirm,
      message: `${money(payment.amount)} will be removed and the booking balance will go back up.`,
      confirmLabel: t.payments.removePayment,
      destructive: true,
    });
    if (ok) deletePayment.mutate(payment.id);
  };

  const exportRows = (rows: PaymentWithRelations[]) =>
    exportCsv(
      `payments-${range.start}-to-${range.end}.csv`,
      rows.map((payment) => ({
        receipt: payment.receipt_number ?? "",
        date: toISODate(payment.paid_at),
        amount: (payment.amount / 100).toFixed(2),
        method: PAYMENT_METHOD_LABELS[payment.method],
        status: payment.status,
        guest: payment.guest ? fullName(payment.guest) : "",
        booking: payment.booking?.reference ?? "",
        apartment: payment.apartment?.name ?? "",
        reference: payment.reference ?? "",
        note: payment.note ?? "",
      })),
    );

  const columns: Column<PaymentWithRelations>[] = [
    {
      key: "paid_at",
      header: t.common.date,
      sortValue: (row) => row.paid_at,
      cell: (row) => (
        <span className="whitespace-nowrap text-ink tnum">{formatDate(row.paid_at)}</span>
      ),
    },
    {
      key: "receipt",
      header: t.payments.receipt,
      sortValue: (row) => row.receipt_number ?? "",
      cell: (row) => (
        <span className="font-medium text-ink tnum">{row.receipt_number ?? "—"}</span>
      ),
    },
    {
      key: "guest",
      header: t.bookings.colGuest,
      sortValue: (row) => (row.guest ? row.guest.last_name : ""),
      cell: (row) =>
        row.guest ? (
          <Link href={`/guests/${row.guest.id}`} className="text-ink hover:underline">
            {fullName(row.guest)}
          </Link>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      key: "booking",
      header: t.bookings.colBooking,
      sortValue: (row) => row.booking?.reference ?? "",
      cell: (row) =>
        row.booking ? (
          <Link
            href={`/bookings?booking=${row.booking.id}`}
            className="text-ink hover:underline"
          >
            {row.booking.reference}
          </Link>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      key: "apartment",
      header: t.change.apartment,
      secondary: true,
      sortValue: (row) => row.apartment?.name ?? "",
      cell: (row) => <span className="text-ink-2">{row.apartment?.name ?? "—"}</span>,
    },
    {
      key: "method",
      header: t.payments.method,
      sortValue: (row) => row.method,
      cell: (row) => <span className="text-ink-2">{PAYMENT_METHOD_LABELS[row.method]}</span>,
    },
    {
      key: "reference",
      header: t.payments.reference,
      secondary: true,
      sortValue: (row) => row.reference ?? "",
      cell: (row) => (
        <span className="block">
          <span className="block text-ink-2 tnum">{row.reference ?? "—"}</span>
          <span className="block text-[12px] text-ink-3">{row.note ?? ""}</span>
        </span>
      ),
    },
    {
      key: "status",
      header: t.common.status,
      sortValue: (row) => row.status,
      cell: (row) => <StatusBadge size="sm" meta={PAYMENT_STATUS_META[row.status]} />,
    },
    {
      key: "amount",
      header: t.common.amount,
      align: "right",
      sortValue: (row) => row.amount,
      cell: (row) => (
        <span
          className={
            row.status === "refunded"
              ? "font-medium text-delta-down tnum"
              : "font-medium text-ink tnum"
          }
        >
          {row.status === "refunded" ? "−" : ""}
          {money(row.amount)}
        </span>
      ),
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
                label={t.payments.paymentActions}
                onClick={toggle}
                icon={<MoreHorizontal className="size-4" />}
              />
            )}
            items={[
              {
                label: t.payments.openBooking,
                disabled: !row.booking,
                onSelect: () => router.push(`/bookings?booking=${row.booking?.id}`),
              },
              { label: t.bookings.exportRow, icon: <Download />, onSelect: () => exportRows([row]) },
              {
                label: t.common.remove,
                icon: <Trash2 />,
                destructive: true,
                separatorBefore: true,
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
        title={t.payments.title}
        description={`${filtered.length} transactions · ${label}`}
        actions={
          <>
            <Button variant="outline" icon={<Download className="size-4" />} onClick={() => exportRows(filtered)}>
              {t.common.export}
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDialogOpen(true)}>
              {t.bookings.recordPayment}
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label={t.invoices.collected}
          value={money(totals.collected, { cents: false })}
          delta={delta("collected")}
          icon={<Wallet />}
        />
        <KpiCard label={t.payments.refunded} value={money(totals.refunded, { cents: false })} hint={t.payments.inThisPeriod} />
        <KpiCard label={t.payments.netCashIn} value={money(totals.net, { cents: false })} hint="collected minus refunds" />
        <KpiCard
          label={t.invoices.outstanding}
          value={money(kpis.outstanding, { cents: false })}
          hint={t.payments.stillOwedOnStays}
          href="/invoices"
        />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title={t.reports.cashFlow}
          description={t.reports.moneyInOut}
          series={[
            { key: "inflow", label: t.reports.cashIn, color: "var(--series-3)" },
            { key: "outflow", label: t.reports.cashOut, color: "var(--series-2)" },
          ]}
          isEmpty={cashFlow.every((point) => point.inflow === 0 && point.outflow === 0)}
          table={
            <ChartTable
              columns={[
                { key: "label", label: t.dashboard.period },
                { key: "inflow", label: t.reports.cashIn, align: "right" },
                { key: "outflow", label: t.reports.cashOut, align: "right" },
                { key: "net", label: t.reports.net, align: "right" },
              ]}
              rows={cashFlow.map((point) => ({
                key: point.key,
                label: point.label,
                inflow: money(point.inflow),
                outflow: money(point.outflow),
                net: money(point.net),
              }))}
            />
          }
        >
          <TrendChart
            data={cashFlow}
            xKey="label"
            kind="bar"
            series={[
              { key: "inflow", label: t.reports.cashIn, color: "var(--series-3)" },
              { key: "outflow", label: t.reports.cashOut, color: "var(--series-2)" },
            ]}
            formatValue={(value) => money(value)}
            formatAxis={(value) => money(value, { cents: false })}
          />
        </ChartCard>

        <ChartCard
          title={t.payments.paymentMethods}
          description={t.payments.howGuestsPay}
          isEmpty={methodMix.length === 0}
          series={methodMix.map((entry) => ({
            key: entry.key,
            label: entry.label,
            color: entry.color,
          }))}
          table={
            <ChartTable
              columns={[
                { key: "label", label: t.payments.method },
                { key: "amount", label: t.common.amount, align: "right" },
                { key: "share", label: t.dashboard.share, align: "right" },
              ]}
              rows={methodMix.map((entry) => ({
                key: entry.key,
                swatch: entry.color,
                label: entry.label,
                amount: money(entry.value),
                share: percent(entry.share),
              }))}
            />
          }
        >
          <RankedBars
            rows={methodMix.map((entry) => ({
              key: entry.key,
              label: entry.label,
              value: entry.value,
              color: entry.color,
              sublabel: percent(entry.share, 0),
            }))}
            formatValue={(value) => money(value, { cents: false })}
          />
        </ChartCard>
      </div>

      {outstandingBookings.length > 0 ? (
        <div className="mb-5 overflow-hidden rounded-card border border-line bg-surface">
          <div className="border-b border-line px-5 py-3.5 sm:px-6">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
              {t.payments.largestOutstanding}
            </h2>
            <p className="mt-0.5 text-[13px] text-ink-2">
              {t.payments.largestOutstandingHint}
            </p>
          </div>
          <ul className="divide-y divide-line">
            {outstandingBookings.map((booking) => (
              <li key={booking.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/bookings?booking=${booking.id}`}
                    className="text-[13.5px] font-medium text-ink hover:underline"
                  >
                    {booking.reference} · {fullName(booking.guest)}
                  </Link>
                  <p className="truncate text-[12px] text-ink-3">
                    {booking.apartment.name} · {formatDate(booking.check_in, "MMM D")} →{" "}
                    {formatDate(booking.check_out, "MMM D, YYYY")}
                  </p>
                </div>
                <span className="shrink-0 text-right">
                  <span className="block text-[13.5px] font-semibold text-serious tnum">
                    {money(booking.balance)}
                  </span>
                  <span className="block text-[11.5px] text-ink-3 tnum">
                    of {money(booking.total)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <FilterBar>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.payments.searchPlaceholder}
            aria-label={t.payments.searchPayments}
            className="h-9 w-[240px] pl-9 text-[13px]"
          />
        </div>

        <Select
          aria-label={t.payments.filterByMethod}
          value={methodFilter}
          onChange={(event) => setMethodFilter(event.target.value)}
          className="h-9 w-[165px] text-[13px]"
        >
          <option value="all">{t.payments.allMethods}</option>
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {PAYMENT_METHOD_LABELS[method]}
            </option>
          ))}
        </Select>

        <Select
          aria-label={t.invoices.filterByStatus}
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-9 w-[145px] text-[13px]"
        >
          <option value="all">{t.reports.anyStatus}</option>
          {PAYMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {PAYMENT_STATUS_META[status].label}
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
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        maxHeight="calc(100dvh - 320px)"
        emptyTitle={t.payments.noneInPeriod}
        emptyDescription={t.payments.recordOrWiden}
        emptyAction={() => setDialogOpen(true)}
        emptyActionLabel={t.payments.recordPayment}
        bulkActions={(ids) => (
          <Button
            size="sm"
            variant="outline"
            icon={<Download className="size-3.5" />}
            onClick={() => exportRows(filtered.filter((row) => ids.includes(row.id)))}
          >
            {t.common.exportSelected}
          </Button>
        )}
        footer={
          filtered.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-line bg-surface-2 px-4 py-2.5 text-[12.5px]">
              <span className="text-ink-3">
                <CreditCard className="mr-1 inline size-3.5" aria-hidden />
                {filtered.length} transactions
              </span>
              <span className="text-ink-2">
                Collected <span className="font-medium text-ink tnum">{money(totals.collected)}</span>
              </span>
              <span className="text-ink-2">
                Refunded <span className="font-medium text-ink tnum">{money(totals.refunded)}</span>
              </span>
              <span className="text-ink-2">
                Net <span className="font-medium text-ink tnum">{money(totals.net)}</span>
              </span>
            </div>
          ) : null
        }
      />

      <PaymentDialog
        open={dialogOpen || Boolean(newParam)}
        onClose={() => {
          setDialogOpen(false);
          if (newParam) clearNewParam();
        }}
      />
      {dialog}
    </>
  );
}
