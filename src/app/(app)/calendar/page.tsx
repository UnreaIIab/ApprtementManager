"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays, ChevronLeft, ChevronRight, Maximize2, Minimize2, Plus, Search,
} from "lucide-react";
import { toast } from "sonner";
import { dayjs, toISODate } from "@/lib/date-range";
import { formatDate } from "@/lib/format";
import { matches } from "@/lib/utils";
import { BOOKING_STATUSES, type ISODate } from "@/types/domain";
import { BOOKING_STATUS_META } from "@/lib/constants";
import { quoteStay } from "@/lib/pricing";
import {
  dayPulse,
  searchAvailability,
  type AvailabilityResult,
} from "@/lib/availability";
import {
  useApartments,
  useBlocks,
  useBookings,
  useOrganization,
  useSnapshot,
  useUpdateBooking,
} from "@/data/queries";
import { useT } from "@/i18n";
import { PageHeader, FilterBar } from "@/components/layout/page-header";
import { Button, IconButton } from "@/components/ui/button";
import { Segmented } from "@/components/ui/tabs";
import { Input, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/feedback";
import { useIsClient } from "@/hooks/use-client";
import {
  CalendarGrid,
  type CalendarChange,
  type CalendarScale,
} from "@/components/calendar/calendar-grid";
import {
  AvailabilitySearch,
  defaultAvailabilityQuery,
  type AvailabilityQueryState,
} from "@/components/calendar/availability-search";
import {
  DayPulseStrip,
  type PulseFocus,
} from "@/components/calendar/day-pulse-strip";
import {
  BookingChangeDialog,
  type ConfirmedChange,
  type PendingChange,
} from "@/components/calendar/change-confirm-dialog";
import { BookingFormDrawer } from "@/components/bookings/booking-form";
import { BookingDrawer } from "@/components/bookings/booking-drawer";
import type { BookingWithRelations } from "@/types/domain";

/**
 * Statuses the timeline can actually draw. Cancelled and no-show stays release
 * their dates, so they have no bar — offering them as a filter option or a
 * legend key would promise something the view cannot show.
 */
const SCHEDULED_STATUSES = BOOKING_STATUSES.filter(
  (status) => status !== "cancelled" && status !== "no_show",
);

export default function CalendarPage() {
  const t = useT();
  const { data: snapshot } = useSnapshot();
  const { data: apartments } = useApartments();
  const { data: bookings } = useBookings();
  const { data: blocks } = useBlocks();
  const organization = useOrganization();
  const updateBooking = useUpdateBooking();

  const [scale, setScale] = useState<CalendarScale>("month");
  const [anchor, setAnchor] = useState<ISODate>(toISODate(dayjs().startOf("month")));
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [focus, setFocus] = useState<PulseFocus>(null);
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const isClient = useIsClient();

  const [availabilityQuery, setAvailabilityQuery] = useState<AvailabilityQueryState>(
    defaultAvailabilityQuery,
  );
  const [appliedQuery, setAppliedQuery] = useState<AvailabilityQueryState | null>(null);
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  /*
   * The id, not the booking: the drawer edits money on the reservation — a
   * payment recorded or removed changes `paid` and `balance` — and a copy held
   * in state would keep showing the figures as they were when the bar was
   * clicked. Resolving against the live list each render keeps the header in
   * step with the ledger below it.
   */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId
    ? (bookings.find((booking) => booking.id === selectedId) ?? null)
    : null;
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BookingWithRelations | null>(null);
  const [formDefaults, setFormDefaults] = useState<{
    apartment_id?: string;
    check_in?: string;
    check_out?: string;
  }>();

  const rawBookings = useMemo(() => snapshot?.bookings ?? [], [snapshot]);
  const taxRate = organization?.tax_rate ?? 0;

  /* --- Window navigation ------------------------------------------- */

  const step = scale === "month" ? "month" : scale === "week" ? "week" : "day";

  const shift = (direction: -1 | 1) => {
    const next = dayjs(anchor).add(direction, step);
    setAnchor(toISODate(scale === "month" ? next.startOf("month") : next));
  };

  const goToday = () => {
    const today = dayjs();
    setAnchor(toISODate(scale === "month" ? today.startOf("month") : today));
  };

  const rangeLabel = useMemo(() => {
    const f = t.format;
    const start = dayjs(anchor);
    if (scale === "month") return start.format(f.monthYear);
    if (scale === "day") return start.format(f.dayFull);
    return `${start.format(f.dateShort)} – ${start.add(6, "day").format(f.dateMedium)}`;
  }, [anchor, scale, t]);

  /* --- Today's operations ------------------------------------------ */

  const pulse = useMemo(
    () => dayPulse(apartments, rawBookings),
    [apartments, rawBookings],
  );

  /* --- Availability ------------------------------------------------- */

  const results = useMemo<AvailabilityResult[]>(() => {
    if (!appliedQuery) return [];
    return searchAvailability(apartments, rawBookings, blocks, appliedQuery, taxRate);
  }, [appliedQuery, apartments, rawBookings, blocks, taxRate]);

  const resultsById = useMemo(() => {
    if (!appliedQuery) return undefined;
    return new Map(results.map((result) => [result.apartment.id, result]));
  }, [appliedQuery, results]);

  const applySearch = () => {
    setAppliedQuery(availabilityQuery);
    // Jump the timeline to the searched dates — answering "is it free?" is only
    // useful if you can then see the surrounding week.
    setAnchor(
      toISODate(
        scale === "month"
          ? dayjs(availabilityQuery.checkIn).startOf("month")
          : dayjs(availabilityQuery.checkIn),
      ),
    );
  };

  const clearSearch = () => {
    setAppliedQuery(null);
    setOnlyAvailable(false);
  };

  /* --- Row filtering ------------------------------------------------ */

  const visibleApartments = useMemo(() => {
    let list = apartments;

    if (focus) {
      const ids = new Set<string>();
      if (focus === "free") {
        pulse.freeTonight.forEach((apartment) => ids.add(apartment.id));
      } else {
        const source =
          focus === "arrivals"
            ? pulse.arrivals
            : focus === "departures"
              ? pulse.departures
              : pulse.inHouse;
        source.forEach((booking) => ids.add(booking.apartment_id));
      }
      list = list.filter((apartment) => ids.has(apartment.id));
    }

    if (onlyAvailable && resultsById) {
      list = list.filter((apartment) => resultsById.get(apartment.id)?.available);
    }

    if (query.trim()) {
      // Searching a guest name should surface the apartment they're staying in,
      // not just apartments whose own name happens to match.
      const matchedApartmentIds = new Set(
        bookings
          .filter(
            (booking) =>
              matches(`${booking.guest.first_name} ${booking.guest.last_name}`, query) ||
              matches(booking.reference, query),
          )
          .map((booking) => booking.apartment_id),
      );
      list = list.filter(
        (apartment) =>
          matches(apartment.name, query) ||
          matches(apartment.code, query) ||
          matchedApartmentIds.has(apartment.id),
      );
    }

    return list;
  }, [apartments, focus, pulse, onlyAvailable, resultsById, query, bookings]);

  const visibleBookings = useMemo(
    () =>
      statusFilter === "all"
        ? bookings
        : bookings.filter((booking) => booking.status === statusFilter),
    [bookings, statusFilter],
  );

  /* --- Mutations ---------------------------------------------------- */

  /*
   * A drop proposes a change; it does not make one. Dragging is imprecise —
   * a few pixels is a different night, and the wrong row is a different
   * apartment — so the dates, times and price go in front of the user first and
   * the write happens on confirmation.
   */
  const handleChange = useCallback(
    (change: CalendarChange) => {
      const booking = bookings.find((entry) => entry.id === change.bookingId);
      if (!booking) return;
      setPending({
        booking,
        apartmentId: change.apartmentId,
        checkIn: change.checkIn,
        checkOut: change.checkOut,
      });
    },
    [bookings],
  );

  const confirmChange = useCallback(
    (confirmed: ConfirmedChange) => {
      if (!pending) return;
      const { booking } = pending;
      const apartment = apartments.find((a) => a.id === confirmed.apartmentId);
      const nights = dayjs(confirmed.checkOut).diff(dayjs(confirmed.checkIn), "day");

      // Re-price through the shared rate card so a resized stay can't drift
      // away from what the same stay would cost if booked fresh.
      const repriced = apartment
        ? quoteStay(apartment, nights, taxRate, {
            nightlyRate: booking.nightly_rate,
            extraFees: booking.extra_fees,
          })
        : null;

      updateBooking.mutate(
        {
          id: booking.id,
          patch: {
            apartment_id: confirmed.apartmentId,
            check_in: confirmed.checkIn,
            check_out: confirmed.checkOut,
            check_in_time: confirmed.checkInTime || null,
            check_out_time: confirmed.checkOutTime || null,
            nights,
            ...(repriced
              ? {
                  subtotal: repriced.subtotal,
                  discount: repriced.discount,
                  cleaning_fee: repriced.cleaningFee,
                  tax: repriced.tax,
                  total: repriced.total,
                }
              : {}),
          },
        },
        {
          // Only close once the write lands, so a failure leaves the dialog up
          // with the intended dates still in it rather than silently dropping
          // the change.
          onSuccess: () => {
            setPending(null);
            toast.success(t.calendar.bookingUpdated, {
              description: `${apartment?.name ?? t.calendar.apartmentFallback} · ${formatDate(confirmed.checkIn, "MMM D")} ${confirmed.checkInTime} → ${formatDate(confirmed.checkOut, "MMM D")} ${confirmed.checkOutTime}`,
            });
          },
        },
      );
    },
    [pending, apartments, taxRate, updateBooking, t],
  );

  const openNew = useCallback(
    (apartmentId: string, checkIn: ISODate, checkOut: ISODate) => {
      setEditing(null);
      setFormDefaults({ apartment_id: apartmentId, check_in: checkIn, check_out: checkOut });
      setFormOpen(true);
    },
    [],
  );

  const filtersActive = focus !== null || Boolean(query.trim()) || onlyAvailable;

  // Escape leaves the expanded view, and the page behind it must not scroll.
  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [expanded]);

  /*
   * Everything below the page title is one fragment used in both places, so the
   * expanded view is genuinely the same calendar rather than a second
   * implementation that drifts. The heading differs — expanded gets its own bar
   * with an exit control — so it stays with each caller.
   */
  const board = (
    <>
      <DayPulseStrip
        className="mb-4"
        pulse={pulse}
        focus={focus}
        onFocusChange={setFocus}
      />

      <AvailabilitySearch
        value={availabilityQuery}
        onChange={setAvailabilityQuery}
        active={Boolean(appliedQuery)}
        onApply={applySearch}
        onClear={clearSearch}
        results={results}
        onlyAvailable={onlyAvailable}
        onOnlyAvailableChange={setOnlyAvailable}
      />

      <FilterBar className={expanded ? "top-0 mt-0" : "mt-4"}>
        <div className="flex items-center gap-1">
          <IconButton
            label={t.calendar.previousPeriod}
            onClick={() => shift(-1)}
            icon={<ChevronLeft className="size-4" />}
          />
          <Button size="sm" variant="outline" onClick={goToday}>
            Today
          </Button>
          <IconButton
            label={t.calendar.nextPeriod}
            onClick={() => shift(1)}
            icon={<ChevronRight className="size-4" />}
          />
        </div>

        <span className="px-1 text-[14px] font-semibold tracking-[-0.01em] text-ink">
          {rangeLabel}
        </span>

        <Segmented
          className="ml-auto"
          size="sm"
          ariaLabel={t.calendar.scale}
          value={scale}
          onChange={(value) => {
            setScale(value);
            setAnchor(
              toISODate(value === "month" ? dayjs(anchor).startOf("month") : dayjs(anchor)),
            );
          }}
          options={[
            { value: "month", label: t.calendar.month },
            { value: "week", label: t.calendar.week },
            { value: "day", label: t.calendar.day },
          ]}
        />

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.calendar.filterPlaceholder}
            aria-label={t.calendar.filterCalendar}
            className="h-9 w-[200px] pl-9 text-[13px]"
          />
        </div>

        <Select
          aria-label={t.calendar.filterByStatus}
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-9 w-[155px] text-[13px]"
        >
          <option value="all">{t.calendar.allStatuses}</option>
          {SCHEDULED_STATUSES.map((status) => (
            <option key={status} value={status}>
              {BOOKING_STATUS_META[status].label}
            </option>
          ))}
        </Select>
      </FilterBar>

      <Legend />

      {visibleApartments.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title={t.calendar.noApartmentsMatch}
          description={
            filtersActive
              ? t.calendar.clearAFilter
              : t.calendar.addApartmentFirst
          }
          action={
            filtersActive
              ? () => {
                  setFocus(null);
                  setQuery("");
                  setOnlyAvailable(false);
                }
              : undefined
          }
          actionLabel={t.common.clearFilters}
        />
      ) : (
        <CalendarGrid
          apartments={visibleApartments}
          bookings={visibleBookings}
          blocks={blocks}
          scale={scale}
          anchorDate={anchor}
          searchRange={
            appliedQuery
              ? { start: appliedQuery.checkIn, end: appliedQuery.checkOut }
              : null
          }
          availability={resultsById}
          onBookingClick={(booking) => setSelectedId(booking.id)}
          onCreate={openNew}
          onChange={handleChange}
          size={expanded ? "large" : "normal"}
          // Expanded: cap the body so the day header stays fixed while rows
          // scroll under it, instead of the whole page scrolling.
          maxBodyHeight={expanded ? "calc(100dvh - 260px)" : undefined}
        />
      )}
    </>
  );

  const drawers = (
    <>
      <BookingDrawer
        booking={selected}
        onClose={() => setSelectedId(null)}
        onEdit={(booking) => {
          setSelectedId(null);
          setEditing(booking);
          setFormDefaults(undefined);
          setFormOpen(true);
        }}
      />

      <BookingFormDrawer
        open={formOpen}
        onClose={() => setFormOpen(false)}
        booking={editing}
        defaults={formDefaults}
      />

      {pending ? (
        <BookingChangeDialog
          pending={pending}
          apartments={apartments}
          bookings={bookings}
          blocks={blocks}
          taxRate={taxRate}
          saving={updateBooking.isPending}
          onCancel={() => setPending(null)}
          onConfirm={confirmChange}
        />
      ) : null}
    </>
  );

  if (expanded && isClient) {
    return createPortal(
      <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-plane">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
          <div className="min-w-0">
            <h1 className="text-[16px] font-semibold tracking-[-0.02em] text-ink">{t.calendar.title}</h1>
            <p className="text-[12.5px] text-ink-2">{rangeLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={() => {
                setEditing(null);
                setFormDefaults(undefined);
                setFormOpen(true);
              }}
            >
              {t.calendar.newBooking}
            </Button>
            <Button
              variant="outline"
              icon={<Minimize2 className="size-4" />}
              onClick={() => setExpanded(false)}
            >
              {t.calendar.exit}
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{board}</div>
        {drawers}
      </div>,
      document.body,
    );
  }

  return (
    <>
      <PageHeader
        title={t.calendar.title}
        description={t.calendar.description}
        actions={
          <>
            <Button
              variant="outline"
              icon={<Maximize2 className="size-4" />}
              onClick={() => setExpanded(true)}
            >
              {t.calendar.expand}
            </Button>
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={() => {
                setEditing(null);
                setFormDefaults(undefined);
                setFormOpen(true);
              }}
            >
              {t.calendar.newBooking}
            </Button>
          </>
        }
      />

      {board}
      {drawers}
    </>
  );
}

/* ------------------------------------------------------------------ */

function Legend() {
  const t = useT();
  return (
    <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {SCHEDULED_STATUSES.map((status) => (
        <li key={status} className="flex items-center gap-1.5 text-[12px] text-ink-2">
          <span
            aria-hidden
            className="size-2.5 rounded-[3px]"
            style={{ background: BOOKING_STATUS_META[status].color }}
          />
          {BOOKING_STATUS_META[status].label}
        </li>
      ))}
      <li className="flex items-center gap-1.5 text-[12px] text-ink-2">
        <span
          aria-hidden
          className="size-2.5 rounded-[3px] border border-dashed border-line-strong"
        />
        {t.calendar.openClickToBook}
      </li>
      <li className="flex items-center gap-1.5 text-[12px] text-ink-2">
        <span
          aria-hidden
          className="size-2.5 rounded-[3px] border border-line"
          style={{
            background:
              "repeating-linear-gradient(45deg, var(--surface-3) 0 3px, var(--surface-2) 3px 6px)",
          }}
        />
        {t.calendar.blockedMaintenance}
      </li>
    </ul>
  );
}
