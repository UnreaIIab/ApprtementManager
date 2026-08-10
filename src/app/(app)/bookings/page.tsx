"use client";

import { Suspense, useMemo, useState } from "react";
import {
  Ban, Copy, Download, MoreHorizontal, Pencil, Plus, Printer, Search, Trash2, X,
} from "lucide-react";
import { dayjs, toISODate } from "@/lib/date-range";
import { exportCsv, matches } from "@/lib/utils";
import { formatDate, fullName, money } from "@/lib/format";
import { useT } from "@/i18n";
import { BOOKING_SOURCE_LABELS, BOOKING_STATUS_META } from "@/lib/constants";
import { BOOKING_SOURCES, BOOKING_STATUSES } from "@/types/domain";
import { useDateFilter } from "@/hooks/use-date-filter";
import { useQueryParam } from "@/hooks/use-query-param";
import {
  useApartments, useBookings, useCreateBooking, useDeleteBooking, useUpdateBooking,
} from "@/data/queries";
import { PageHeader, FilterBar } from "@/components/layout/page-header";
import { DataTable, type Column, type SortState } from "@/components/ui/data-table";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/feedback";
import { Menu } from "@/components/ui/menu";
import { useConfirm } from "@/components/ui/overlay";
import { BookingDrawer } from "@/components/bookings/booking-drawer";
import { BookingFormDrawer } from "@/components/bookings/booking-form";
import type { BookingWithRelations } from "@/types/domain";

type PaymentFilter = "all" | "unpaid" | "partial" | "paid";
type DateBasis = "stay" | "arrival" | "created";

export default function BookingsPage() {
  return (
    <Suspense fallback={null}>
      <BookingsView />
    </Suspense>
  );
}

function BookingsView() {
  const t = useT();
  const { range, label } = useDateFilter();
  // Deep links (?booking=<id>, ?new=1) are read straight from the URL rather
  // than copied into state, so the panel is open on first paint and closing it
  // updates the address bar.
  const [linkedBookingId, clearLinkedBooking] = useQueryParam("booking");
  const [newParam, clearNewParam] = useQueryParam("new");

  const { data: bookings, isLoading, isFetching } = useBookings();
  const { data: apartments } = useApartments();
  const updateBooking = useUpdateBooking();
  const deleteBooking = useDeleteBooking();
  const createBooking = useCreateBooking();
  const { confirm, dialog } = useConfirm();

  const [query, setQuery] = useState("");
  const [apartmentFilter, setApartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [basis, setBasis] = useState<DateBasis>("stay");
  const [sort, setSort] = useState<SortState | null>({ key: "check_in", direction: "desc" });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BookingWithRelations | null>(null);

  const detailId = selectedId ?? linkedBookingId;
  const detail = detailId
    ? (bookings.find((booking) => booking.id === detailId) ?? null)
    : null;

  const closeDetail = () => {
    setSelectedId(null);
    if (linkedBookingId) clearLinkedBooking();
  };

  const closeForm = () => {
    setFormOpen(false);
    if (newParam) clearNewParam();
  };

  const filtered = useMemo(() => {
    return bookings.filter((booking) => {
      // The global window can mean three different things for a reservation;
      // the basis switch makes which one explicit rather than assumed.
      if (basis === "stay") {
        const overlaps =
          booking.check_in <= range.end && booking.check_out > range.start;
        if (!overlaps) return false;
      } else if (basis === "arrival") {
        if (booking.check_in < range.start || booking.check_in > range.end) return false;
      } else {
        const created = toISODate(booking.created_at);
        if (created < range.start || created > range.end) return false;
      }

      if (apartmentFilter !== "all" && booking.apartment_id !== apartmentFilter) return false;
      if (statusFilter !== "all" && booking.status !== statusFilter) return false;
      if (sourceFilter !== "all" && booking.source !== sourceFilter) return false;

      if (paymentFilter === "unpaid" && booking.paid > 0) return false;
      if (paymentFilter === "partial" && !(booking.paid > 0 && booking.balance > 0)) return false;
      if (paymentFilter === "paid" && booking.balance > 0) return false;

      if (query.trim()) {
        const haystack = `${booking.reference} ${fullName(booking.guest)} ${booking.guest.email ?? ""} ${booking.apartment.name} ${booking.apartment.code}`;
        if (!matches(haystack, query)) return false;
      }
      return true;
    });
  }, [bookings, range, basis, apartmentFilter, statusFilter, sourceFilter, paymentFilter, query]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, booking) => ({
          value: acc.value + booking.total,
          paid: acc.paid + booking.paid,
          balance: acc.balance + booking.balance,
          nights: acc.nights + booking.nights,
        }),
        { value: 0, paid: 0, balance: 0, nights: 0 },
      ),
    [filtered],
  );

  const activeFilters =
    (apartmentFilter !== "all" ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0) +
    (sourceFilter !== "all" ? 1 : 0) +
    (paymentFilter !== "all" ? 1 : 0) +
    (query.trim() ? 1 : 0);

  const clearFilters = () => {
    setApartmentFilter("all");
    setStatusFilter("all");
    setSourceFilter("all");
    setPaymentFilter("all");
    setQuery("");
  };

  const exportRows = (rows: BookingWithRelations[]) =>
    exportCsv(
      `bookings-${range.start}-to-${range.end}.csv`,
      rows.map((booking) => ({
        reference: booking.reference,
        guest: fullName(booking.guest),
        email: booking.guest.email ?? "",
        apartment: `${booking.apartment.name} (${booking.apartment.code})`,
        check_in: booking.check_in,
        check_out: booking.check_out,
        nights: booking.nights,
        guests: booking.adults + booking.children,
        status: BOOKING_STATUS_META[booking.status].label,
        source: BOOKING_SOURCE_LABELS[booking.source],
        total: (booking.total / 100).toFixed(2),
        paid: (booking.paid / 100).toFixed(2),
        balance: (booking.balance / 100).toFixed(2),
      })),
    );

  const duplicate = async (booking: BookingWithRelations) => {
    const nights = booking.nights;
    const checkIn = toISODate(dayjs(booking.check_out));
    await createBooking.mutateAsync({
      apartment_id: booking.apartment_id,
      guest_id: booking.guest_id,
      check_in: checkIn,
      check_out: toISODate(dayjs(checkIn).add(nights, "day")),
      check_in_time: booking.check_in_time,
      check_out_time: booking.check_out_time,
      actual_check_in: null,
      actual_check_out: null,
      adults: booking.adults,
      children: booking.children,
      status: "pending",
      source: booking.source,
      nightly_rate: booking.nightly_rate,
      subtotal: booking.subtotal,
      cleaning_fee: booking.cleaning_fee,
      extra_fees: booking.extra_fees,
      discount: booking.discount,
      tax: booking.tax,
      total: booking.total,
      commission: booking.commission,
      notes: booking.notes,
      internal_notes: booking.internal_notes,
      cancelled_at: null,
      cancellation_reason: null,
    });
  };

  const bulkCancel = async (ids: string[]) => {
    const ok = await confirm({
      title: t.bookings.cancelMany(ids.length),
      message: t.bookings.datesReleased,
      confirmLabel: t.bookings.cancelBookings,
      destructive: true,
    });
    if (!ok) return;
    for (const id of ids) {
      updateBooking.mutate({
        id,
        patch: { status: "cancelled", cancelled_at: new Date().toISOString() },
      });
    }
    setSelected(new Set());
  };

  const bulkDelete = async (ids: string[]) => {
    const ok = await confirm({
      title: t.bookings.deleteMany(ids.length),
      message: t.bookings.deleteManyMessage,
      confirmLabel: t.bookings.deletePermanently,
      destructive: true,
    });
    if (!ok) return;
    for (const id of ids) deleteBooking.mutate(id);
    setSelected(new Set());
  };

  const columns: Column<BookingWithRelations>[] = [
    {
      key: "reference",
      header: t.bookings.colBooking,
      sortValue: (row) => row.reference,
      cell: (row) => (
        <span className="block">
          <span className="block font-medium text-ink">{row.reference}</span>
          <span className="block text-[12px] text-ink-3">
            {formatDate(row.created_at, "MMM D, YYYY")}
          </span>
        </span>
      ),
    },
    {
      key: "guest",
      header: t.bookings.colGuest,
      sortValue: (row) => `${row.guest.last_name} ${row.guest.first_name}`,
      cell: (row) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={fullName(row.guest)} size={30} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-medium text-ink">{fullName(row.guest)}</span>
              {row.guest.is_vip ? (
                <span className="rounded-full bg-brand-wash px-1.5 py-px text-[10px] font-semibold text-brand">
                  VIP
                </span>
              ) : null}
            </span>
            <span className="block truncate text-[12px] text-ink-3">
              {row.guest.email ?? row.guest.phone ?? "—"}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "apartment",
      header: t.change.apartment,
      sortValue: (row) => row.apartment.name,
      cell: (row) => (
        <span className="block">
          <span className="block truncate text-ink">{row.apartment.name}</span>
          <span className="block text-[12px] text-ink-3">{row.apartment.code}</span>
        </span>
      ),
    },
    {
      key: "check_in",
      header: t.bookings.colStay,
      sortValue: (row) => row.check_in,
      cell: (row) => (
        <span className="block whitespace-nowrap">
          <span className="block text-ink tnum">
            {formatDate(row.check_in, "MMM D")} → {formatDate(row.check_out, "MMM D, YYYY")}
          </span>
          <span className="block text-[12px] text-ink-3 tnum">
            {row.nights}n · {row.adults + row.children} guests
          </span>
        </span>
      ),
    },
    {
      key: "status",
      header: t.common.status,
      sortValue: (row) => row.status,
      cell: (row) => <StatusBadge size="sm" meta={BOOKING_STATUS_META[row.status]} />,
    },
    {
      key: "source",
      header: t.bookings.colSource,
      secondary: true,
      sortValue: (row) => row.source,
      cell: (row) => (
        <span className="text-[13px] text-ink-2">{BOOKING_SOURCE_LABELS[row.source]}</span>
      ),
    },
    {
      key: "total",
      header: t.common.total,
      align: "right",
      sortValue: (row) => row.total,
      cell: (row) => <span className="font-medium text-ink tnum">{money(row.total)}</span>,
    },
    {
      key: "paid",
      header: t.bookings.paid,
      align: "right",
      secondary: true,
      sortValue: (row) => row.paid,
      cell: (row) => <span className="text-ink-2 tnum">{money(row.paid)}</span>,
    },
    {
      key: "balance",
      header: t.bookings.colBalance,
      align: "right",
      sortValue: (row) => row.balance,
      cell: (row) => (
        <span
          className={
            row.balance > 0 ? "font-medium text-serious tnum" : "text-ink-3 tnum"
          }
        >
          {money(row.balance)}
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
                label={t.bookings.bookingActions}
                onClick={toggle}
                icon={<MoreHorizontal className="size-4" />}
              />
            )}
            items={[
              { label: t.common.open, onSelect: () => setSelectedId(row.id) },
              {
                label: t.common.edit,
                icon: <Pencil />,
                onSelect: () => {
                  setEditing(row);
                  setFormOpen(true);
                },
              },
              { label: t.common.duplicate, icon: <Copy />, onSelect: () => void duplicate(row) },
              {
                label: t.bookings.exportRow,
                icon: <Download />,
                separatorBefore: true,
                onSelect: () => exportRows([row]),
              },
              { label: t.common.print, icon: <Printer />, onSelect: () => window.print() },
              {
                label: t.bookings.cancelBooking,
                icon: <Ban />,
                separatorBefore: true,
                disabled: row.status === "cancelled",
                onSelect: () => void bulkCancel([row.id]),
              },
              {
                label: t.common.delete,
                icon: <Trash2 />,
                destructive: true,
                onSelect: () => void bulkDelete([row.id]),
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
        title={t.bookings.title}
        description={t.bookings.countOfTotal(filtered.length, bookings.length, label)}
        actions={
          <>
            <Button
              variant="outline"
              icon={<Download className="size-4" />}
              onClick={() => exportRows(filtered)}
            >
              {t.common.export}
            </Button>
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              {t.calendar.newBooking}
            </Button>
          </>
        }
      />

      <FilterBar>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.bookings.searchPlaceholder}
            aria-label={t.bookings.searchBookings}
            className="h-9 w-[240px] pl-9 text-[13px]"
          />
        </div>

        <Select
          aria-label={t.bookings.dateBasis}
          value={basis}
          onChange={(event) => setBasis(event.target.value as DateBasis)}
          className="h-9 w-[165px] text-[13px]"
        >
          <option value="stay">{t.bookings.staysInPeriod}</option>
          <option value="arrival">{t.bookings.arrivalsInPeriod}</option>
          <option value="created">{t.bookings.bookedInPeriod}</option>
        </Select>

        <Select
          aria-label={t.bookings.filterByApartment}
          value={apartmentFilter}
          onChange={(event) => setApartmentFilter(event.target.value)}
          className="h-9 w-[175px] text-[13px]"
        >
          <option value="all">{t.bookings.allApartments}</option>
          {apartments.map((apartment) => (
            <option key={apartment.id} value={apartment.id}>
              {apartment.name}
            </option>
          ))}
        </Select>

        <Select
          aria-label={t.bookings.filterByStatus}
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-9 w-[150px] text-[13px]"
        >
          <option value="all">{t.bookings.allStatuses}</option>
          {BOOKING_STATUSES.map((status) => (
            <option key={status} value={status}>
              {BOOKING_STATUS_META[status].label}
            </option>
          ))}
        </Select>

        <Select
          aria-label={t.bookings.filterBySource}
          value={sourceFilter}
          onChange={(event) => setSourceFilter(event.target.value)}
          className="h-9 w-[150px] text-[13px]"
        >
          <option value="all">{t.bookings.allSources}</option>
          {BOOKING_SOURCES.map((source) => (
            <option key={source} value={source}>
              {BOOKING_SOURCE_LABELS[source]}
            </option>
          ))}
        </Select>

        <Select
          aria-label={t.bookings.filterByPaymentStatus}
          value={paymentFilter}
          onChange={(event) => setPaymentFilter(event.target.value as PaymentFilter)}
          className="h-9 w-[150px] text-[13px]"
        >
          <option value="all">{t.bookings.anyPayment}</option>
          <option value="unpaid">{t.bookings.unpaid}</option>
          <option value="partial">{t.bookings.partiallyPaid}</option>
          <option value="paid">{t.bookings.fullyPaid}</option>
        </Select>

        {activeFilters > 0 ? (
          <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={clearFilters}>
            Clear {activeFilters}
          </Button>
        ) : null}
      </FilterBar>

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(row) => row.id}
        loading={isLoading}
        refetching={isFetching && !isLoading}
        sort={sort}
        onSortChange={setSort}
        onRowClick={(row) => setSelectedId(row.id)}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        maxHeight="calc(100dvh - 300px)"
        emptyTitle={t.bookings.noMatch}
        emptyDescription={t.bookings.widenRange}
        emptyAction={activeFilters > 0 ? clearFilters : undefined}
        emptyActionLabel={t.common.clearFilters}
        bulkActions={(ids) => (
          <>
            <Button
              size="sm"
              variant="outline"
              icon={<Download className="size-3.5" />}
              onClick={() =>
                exportRows(filtered.filter((booking) => ids.includes(booking.id)))
              }
            >
              {t.common.export}
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={<Printer className="size-3.5" />}
              onClick={() => window.print()}
            >
              {t.common.print}
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={<Ban className="size-3.5" />}
              onClick={() => void bulkCancel(ids)}
            >
              {t.common.cancel}
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
                Totals for <span className="text-ink">{filtered.length}</span> bookings
              </span>
              <span className="text-ink-2">
                Nights <span className="font-medium text-ink tnum">{totals.nights}</span>
              </span>
              <span className="text-ink-2">
                Value <span className="font-medium text-ink tnum">{money(totals.value)}</span>
              </span>
              <span className="text-ink-2">
                Paid <span className="font-medium text-ink tnum">{money(totals.paid)}</span>
              </span>
              <span className="text-ink-2">
                Outstanding{" "}
                <span
                  className={
                    totals.balance > 0 ? "font-medium text-serious tnum" : "font-medium text-ink tnum"
                  }
                >
                  {money(totals.balance)}
                </span>
              </span>
            </div>
          ) : null
        }
      />

      <BookingDrawer
        booking={detail}
        onClose={closeDetail}
        onEdit={(booking) => {
          closeDetail();
          setEditing(booking);
          setFormOpen(true);
        }}
      />

      <BookingFormDrawer
        open={formOpen || Boolean(newParam)}
        onClose={closeForm}
        booking={editing}
      />

      {dialog}
    </>
  );
}
