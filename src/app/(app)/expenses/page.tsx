"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useQueryParam } from "@/hooks/use-query-param";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Download, MoreHorizontal, Paperclip, Pencil, Plus, Receipt, RefreshCw, Search, Trash2,
} from "lucide-react";
import { expenseSchema, type ExpenseFormValues } from "@/lib/schemas";
import { useT } from "@/i18n";
import { exportCsv, matches } from "@/lib/utils";
import { currencySymbol, formatDate, money, percent } from "@/lib/format";
import {
  EXPENSE_CATEGORY_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_META, categoryColor,
} from "@/lib/constants";
import {
  EXPENSE_CATEGORIES, PAYMENT_METHODS, PAYMENT_STATUSES, type ExpenseCategory,
} from "@/types/domain";
import { capSlices, expensesByApartment, expensesByCategory } from "@/data/analytics";
import { toISODate, dayjs } from "@/lib/date-range";
import { useDateFilter } from "@/hooks/use-date-filter";
import { useAnalytics } from "@/hooks/use-analytics";
import {
  useApartments, useCreateExpense, useDeleteExpense, useExpenses, useOrganization,
  useUpdateExpense,
} from "@/data/queries";
import { PageHeader, FilterBar } from "@/components/layout/page-header";
import { DataTable, type Column, type SortState } from "@/components/ui/data-table";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox, Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/badge";
import { Menu } from "@/components/ui/menu";
import { Dialog, useConfirm } from "@/components/ui/overlay";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartCard, ChartTable } from "@/components/charts/chart-card";
import { RankedBars, TrendChart } from "@/components/charts/charts";
import type { ExpenseWithRelations } from "@/types/domain";

export default function ExpensesPage() {
  return (
    <Suspense fallback={null}>
      <ExpensesView />
    </Suspense>
  );
}

function ExpensesView() {
  const t = useT();
  const [newParam, clearNewParam] = useQueryParam("new");
  const { range, label } = useDateFilter();
  const { data: expenses, isLoading } = useExpenses();
  const { data: apartments } = useApartments();
  const { kpis, trend, delta } = useAnalytics();
  const deleteExpense = useDeleteExpense();
  const { confirm, dialog } = useConfirm();

  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | "all">("all");
  const [apartmentFilter, setApartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState<SortState | null>({ key: "date", direction: "desc" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseWithRelations | null>(null);

  const inRange = useMemo(
    () =>
      expenses.filter(
        (expense) => expense.expense_date >= range.start && expense.expense_date <= range.end,
      ),
    [expenses, range],
  );

  const filtered = useMemo(
    () =>
      inRange.filter((expense) => {
        if (categoryFilter !== "all" && expense.category !== categoryFilter) return false;
        if (apartmentFilter === "__none" && expense.apartment_id) return false;
        if (
          apartmentFilter !== "all" &&
          apartmentFilter !== "__none" &&
          expense.apartment_id !== apartmentFilter
        ) {
          return false;
        }
        if (statusFilter !== "all" && expense.status !== statusFilter) return false;
        if (query.trim()) {
          const haystack = `${expense.vendor ?? ""} ${expense.description ?? ""} ${expense.invoice_ref ?? ""} ${EXPENSE_CATEGORY_LABELS[expense.category]}`;
          if (!matches(haystack, query)) return false;
        }
        return true;
      }),
    [inRange, categoryFilter, apartmentFilter, statusFilter, query],
  );

  const filteredTotal = filtered.reduce((acc, expense) => acc + expense.amount, 0);
  const recurringTotal = filtered
    .filter((expense) => expense.is_recurring)
    .reduce((acc, expense) => acc + expense.amount, 0);

  const categorySlices = useMemo(
    () => capSlices(expensesByCategory(inRange, range), 7),
    [inRange, range],
  );
  const apartmentSlices = useMemo(
    () => capSlices(expensesByApartment(inRange, apartments, range), 8),
    [inRange, apartments, range],
  );

  const remove = async (expense: ExpenseWithRelations) => {
    const ok = await confirm({
      title: t.expenses.deleteConfirm,
      message: `${expense.vendor ?? EXPENSE_CATEGORY_LABELS[expense.category]} · ${money(expense.amount)} will be removed.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (ok) deleteExpense.mutate(expense.id);
  };

  const bulkDelete = async (ids: string[]) => {
    const ok = await confirm({
      title: t.expenses.deleteMany(ids.length),
      message: t.invoices.cannotBeUndone,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    for (const id of ids) deleteExpense.mutate(id);
    setSelected(new Set());
  };

  const exportRows = (rows: ExpenseWithRelations[]) =>
    exportCsv(
      `expenses-${range.start}-to-${range.end}.csv`,
      rows.map((expense) => ({
        date: expense.expense_date,
        category: EXPENSE_CATEGORY_LABELS[expense.category],
        apartment: expense.apartment?.name ?? "Portfolio-wide",
        vendor: expense.vendor ?? "",
        description: expense.description ?? "",
        amount: (expense.amount / 100).toFixed(2),
        method: PAYMENT_METHOD_LABELS[expense.method],
        status: expense.status,
        invoice_ref: expense.invoice_ref ?? "",
        recurring: expense.is_recurring ? expense.recurrence ?? "yes" : "no",
      })),
    );

  const columns: Column<ExpenseWithRelations>[] = [
    {
      key: "date",
      header: "Date",
      sortValue: (row) => row.expense_date,
      cell: (row) => <span className="whitespace-nowrap text-ink tnum">{formatDate(row.expense_date)}</span>,
    },
    {
      key: "category",
      header: "Category",
      sortValue: (row) => row.category,
      cell: (row) => (
        <span className="flex items-center gap-2 text-ink">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ background: categoryColor(row.category) }}
          />
          {EXPENSE_CATEGORY_LABELS[row.category]}
        </span>
      ),
    },
    {
      key: "apartment",
      header: "Apartment",
      sortValue: (row) => row.apartment?.name ?? "",
      cell: (row) => (
        <span className="text-ink-2">{row.apartment?.name ?? "Portfolio-wide"}</span>
      ),
    },
    {
      key: "vendor",
      header: "Vendor",
      sortValue: (row) => row.vendor ?? "",
      cell: (row) => (
        <span className="block">
          <span className="block truncate text-ink">{row.vendor ?? "—"}</span>
          <span className="block truncate text-[12px] text-ink-3">{row.description ?? ""}</span>
        </span>
      ),
    },
    {
      key: "method",
      header: "Method",
      secondary: true,
      sortValue: (row) => row.method,
      cell: (row) => <span className="text-ink-2">{PAYMENT_METHOD_LABELS[row.method]}</span>,
    },
    {
      key: "invoice",
      header: "Invoice",
      secondary: true,
      sortValue: (row) => row.invoice_ref ?? "",
      cell: (row) => (
        <span className="flex items-center gap-1.5 text-ink-2">
          {row.attachment_url ? <Paperclip className="size-3.5" aria-hidden /> : null}
          {row.invoice_ref ?? "—"}
        </span>
      ),
    },
    {
      key: "recurring",
      header: "Recurring",
      align: "center",
      secondary: true,
      sortValue: (row) => (row.is_recurring ? 1 : 0),
      cell: (row) =>
        row.is_recurring ? (
          <span className="inline-flex items-center gap-1 text-[12px] text-ink-2">
            <RefreshCw className="size-3.5" aria-hidden />
            {row.recurrence ?? "recurring"}
          </span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (row) => row.status,
      cell: (row) => <StatusBadge size="sm" meta={PAYMENT_STATUS_META[row.status]} />,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sortValue: (row) => row.amount,
      cell: (row) => <span className="font-medium text-ink tnum">{money(row.amount)}</span>,
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
                label={t.expenses.expenseActions}
                onClick={toggle}
                icon={<MoreHorizontal className="size-4" />}
              />
            )}
            items={[
              {
                label: t.common.edit,
                icon: <Pencil />,
                onSelect: () => {
                  setEditing(row);
                  setFormOpen(true);
                },
              },
              { label: t.bookings.exportRow, icon: <Download />, onSelect: () => exportRows([row]) },
              {
                label: t.common.delete,
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
        title={t.expenses.title}
        description={`${filtered.length} entries · ${label}`}
        actions={
          <>
            <Button variant="outline" icon={<Download className="size-4" />} onClick={() => exportRows(filtered)}>
              Export
            </Button>
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Record expense
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label={t.expenses.totalExpenses}
          value={money(kpis.expenses, { cents: false })}
          delta={delta("expenses")}
          invertDelta
          icon={<Receipt />}
        />
        <KpiCard
          label={t.dashboard.revenue}
          value={money(kpis.revenue, { cents: false })}
          delta={delta("revenue")}
        />
        <KpiCard
          label={t.reports.profitAfterExpenses}
          value={money(kpis.netProfit, { cents: false })}
          delta={delta("netProfit")}
        />
        <KpiCard
          label={t.reports.expenseRatio}
          value={kpis.revenue ? percent(kpis.expenses / kpis.revenue) : "—"}
          hint="expenses as a share of revenue"
        />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <ChartCard
          title={t.expenses.monthlyExpenses}
          description={t.expenses.costsRecordedIn(label.toLowerCase())}
          isEmpty={trend.every((point) => point.expenses === 0)}
          table={
            <ChartTable
              columns={[
                { key: "label", label: t.dashboard.period },
                { key: "expenses", label: t.dashboard.expenses, align: "right" },
                { key: "revenue", label: t.dashboard.revenue, align: "right" },
              ]}
              rows={trend.map((point) => ({
                key: point.key,
                label: point.label,
                expenses: money(point.expenses),
                revenue: money(point.revenue),
              }))}
            />
          }
        >
          <TrendChart
            data={trend}
            xKey="label"
            kind="bar"
            series={[{ key: "expenses", label: t.dashboard.expenses, color: "var(--series-2)" }]}
            formatValue={(value) => money(value)}
            formatAxis={(value) => money(value, { cents: false })}
          />
        </ChartCard>

        <ChartCard
          title={t.dashboard.categoryCol}
          description={t.ui.whereMoneyWent}
          isEmpty={categorySlices.length === 0}
          series={categorySlices.map((slice) => ({
            key: slice.key,
            label: slice.label,
            color: categoryColor(slice.key as never),
          }))}
          table={
            <ChartTable
              columns={[
                { key: "label", label: t.dashboard.categoryCol },
                { key: "amount", label: t.common.amount, align: "right" },
                { key: "share", label: t.dashboard.share, align: "right" },
              ]}
              rows={categorySlices.map((slice) => ({
                key: slice.key,
                swatch: categoryColor(slice.key as never),
                label: slice.label,
                amount: money(slice.value),
                share: percent(slice.share),
              }))}
            />
          }
        >
          <RankedBars
            rows={categorySlices.map((slice) => ({
              key: slice.key,
              label: slice.label,
              value: slice.value,
              color: categoryColor(slice.key as never),
              sublabel: percent(slice.share, 0),
            }))}
            formatValue={(value) => money(value, { cents: false })}
          />
        </ChartCard>

        <ChartCard
          title={t.reports.byApartment}
          description={t.reports.whichUnitsCost}
          isEmpty={apartmentSlices.length === 0}
          table={
            <ChartTable
              columns={[
                { key: "label", label: t.bookings.colApartment },
                { key: "amount", label: t.common.amount, align: "right" },
                { key: "share", label: t.dashboard.share, align: "right" },
              ]}
              rows={apartmentSlices.map((slice) => ({
                key: slice.key,
                label: slice.label,
                amount: money(slice.value),
                share: percent(slice.share),
              }))}
            />
          }
        >
          <RankedBars
            rows={apartmentSlices.map((slice) => ({
              key: slice.key,
              label: slice.label,
              value: slice.value,
              color: "var(--series-2)",
              sublabel: percent(slice.share, 0),
            }))}
            formatValue={(value) => money(value, { cents: false })}
          />
        </ChartCard>
      </div>

      <FilterBar>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.expenses.searchPlaceholder}
            aria-label={t.expenses.searchExpenses}
            className="h-9 w-[240px] pl-9 text-[13px]"
          />
        </div>

        <Select
          aria-label={t.expenses.filterByCategory}
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value as ExpenseCategory | "all")}
          className="h-9 w-[165px] text-[13px]"
        >
          <option value="all">{t.expenses.allCategories}</option>
          {EXPENSE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {EXPENSE_CATEGORY_LABELS[category]}
            </option>
          ))}
        </Select>

        <Select
          aria-label={t.expenses.filterByApartment}
          value={apartmentFilter}
          onChange={(event) => setApartmentFilter(event.target.value)}
          className="h-9 w-[175px] text-[13px]"
        >
          <option value="all">{t.expenses.allApartments}</option>
          <option value="__none">{t.expenses.portfolioWideOnly}</option>
          {apartments.map((apartment) => (
            <option key={apartment.id} value={apartment.id}>
              {apartment.name}
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
        onRowClick={(row) => {
          setEditing(row);
          setFormOpen(true);
        }}
        maxHeight="calc(100dvh - 320px)"
        emptyTitle={t.expenses.noneInPeriod}
        emptyDescription={t.expenses.recordOrWiden}
        emptyAction={() => {
          setEditing(null);
          setFormOpen(true);
        }}
        emptyActionLabel={t.expenses.recordExpense}
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
              variant="danger"
              icon={<Trash2 className="size-3.5" />}
              onClick={() => void bulkDelete(ids)}
            >
              Delete
            </Button>
          </>
        )}
        footer={
          filtered.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-line bg-surface-2 px-4 py-2.5 text-[12.5px]">
              <span className="text-ink-3">
                Totals for <span className="text-ink">{filtered.length}</span> entries
              </span>
              <span className="text-ink-2">
                Amount <span className="font-medium text-ink tnum">{money(filteredTotal)}</span>
              </span>
              <span className="text-ink-2">
                Recurring <span className="font-medium text-ink tnum">{money(recurringTotal)}</span>
              </span>
            </div>
          ) : null
        }
      />

      <ExpenseFormDialog
        open={formOpen || Boolean(newParam)}
        onClose={() => {
          setFormOpen(false);
          if (newParam) clearNewParam();
        }}
        expense={editing}
      />
      {dialog}
    </>
  );
}

/* ------------------------------------------------------------------ */

function ExpenseFormDialog({
  open,
  onClose,
  expense,
}: {
  open: boolean;
  onClose: () => void;
  expense?: ExpenseWithRelations | null;
}) {
  const t = useT();
  const { data: apartments } = useApartments();
  const organization = useOrganization();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const symbol = currencySymbol(organization?.currency);
  const editing = Boolean(expense);

  const defaults = useMemo<ExpenseFormValues>(
    () => ({
      apartment_id: expense?.apartment_id ?? "",
      category: expense?.category ?? "maintenance",
      vendor: expense?.vendor ?? "",
      description: expense?.description ?? "",
      amount: expense?.amount ?? 0,
      expense_date: expense?.expense_date ?? toISODate(dayjs()),
      method: expense?.method ?? "bank_transfer",
      status: expense?.status ?? "paid",
      invoice_ref: expense?.invoice_ref ?? "",
      is_recurring: expense?.is_recurring ?? false,
      recurrence: expense?.recurrence ?? "monthly",
    }),
    [expense],
  );

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (open) reset(defaults);
  }, [open, defaults, reset]);

  const isRecurring = useWatch({ control, name: "is_recurring" });

  const onSubmit = handleSubmit(async (values) => {
    const payload = {
      ...values,
      apartment_id: values.apartment_id || null,
      booking_id: expense?.booking_id ?? null,
      vendor: values.vendor || null,
      description: values.description || null,
      invoice_ref: values.invoice_ref || null,
      recurrence: values.is_recurring ? values.recurrence || "monthly" : null,
      attachment_url: expense?.attachment_url ?? null,
    };

    if (expense) await updateExpense.mutateAsync({ id: expense.id, patch: payload });
    else await createExpense.mutateAsync(payload);
    onClose();
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? t.expenses.editExpense : t.expenses.recordExpense}
      description={t.expenses.costsFeedProfit}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSubmit} loading={isSubmitting}>
            {editing ? t.common.saveChanges : t.expenses.recordExpense}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label={t.common.amount} required error={errors.amount?.message}>
          <Controller
            control={control}
            name="amount"
            render={({ field }) => (
              <MoneyInput data-autofocus symbol={symbol} value={field.value} onValueChange={field.onChange} />
            )}
          />
        </Field>

        <Field label={t.common.date} required error={errors.expense_date?.message} htmlFor="exp-date">
          <Input id="exp-date" type="date" {...register("expense_date")} />
        </Field>

        <Field label={t.dashboard.categoryCol} htmlFor="exp-cat">
          <Select id="exp-cat" {...register("category")}>
            {EXPENSE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {EXPENSE_CATEGORY_LABELS[category]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t.change.apartment} hint={t.expenses.leaveEmptyForPortfolio} htmlFor="exp-apt">
          <Select id="exp-apt" {...register("apartment_id")}>
            <option value="">{t.expenses.portfolioWide}</option>
            {apartments.map((apartment) => (
              <option key={apartment.id} value={apartment.id}>
                {apartment.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t.expenses.vendor} htmlFor="exp-vendor">
          <Input id="exp-vendor" placeholder={t.expenses.vendorPlaceholder} {...register("vendor")} />
        </Field>

        <Field label={t.invoices.invoice} htmlFor="exp-ref">
          <Input id="exp-ref" {...register("invoice_ref")} />
        </Field>

        <Field label={t.payments.method} htmlFor="exp-method">
          <Select id="exp-method" {...register("method")}>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {PAYMENT_METHOD_LABELS[method]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t.common.status} htmlFor="exp-status">
          <Select id="exp-status" {...register("status")}>
            {PAYMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PAYMENT_STATUS_META[status].label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t.expenses.description2} className="sm:col-span-2" htmlFor="exp-desc">
          <Textarea id="exp-desc" rows={2} {...register("description")} />
        </Field>

        <div className="sm:col-span-2">
          <Checkbox
            label={t.expenses.recurringExpense}
            description={t.expenses.repeatsOnSchedule}
            {...register("is_recurring")}
          />
          {isRecurring ? (
            <Field label={t.expenses.frequency} className="mt-3 max-w-xs" htmlFor="exp-rec">
              <Select id="exp-rec" {...register("recurrence")}>
                <option value="weekly">{t.expenses.weekly}</option>
                <option value="monthly">{t.expenses.monthly}</option>
                <option value="quarterly">{t.expenses.quarterly}</option>
                <option value="yearly">{t.expenses.yearly}</option>
              </Select>
            </Field>
          ) : null}
        </div>
      </form>
    </Dialog>
  );
}
