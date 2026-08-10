"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { strings } from "@/i18n";
import { dayjs, staysOverlap, toISODate } from "@/lib/date-range";
import { formatDate, fullName, money, nightsLabel, formatShortDate } from "@/lib/format";
import { BOOKING_STATUS_META } from "@/lib/constants";
import { useContainerWidth, useIsClient } from "@/hooks/use-client";
import { freeGaps, occupiedIntervals, type Gap } from "@/lib/availability";
import type { AvailabilityResult } from "@/lib/availability";
import type {
  Apartment,
  BookingWithRelations,
  CalendarBlock,
  ISODate,
} from "@/types/domain";

export type CalendarScale = "month" | "week" | "day";

const DAY_WIDTH: Record<CalendarScale, number> = {
  month: 46,
  week: 118,
  day: 340,
};

const ROW_HEIGHT = 62;
const RAIL_WIDTH = 248;

/**
 * Narrowest a month column may become while still carrying "SAM." above a day
 * number. Below this the month stops fitting and the grid scrolls again, which
 * is the right answer on a phone — 31 legible columns do not exist there.
 */
const MIN_MONTH_DAY_WIDTH = 28;

/**
 * Below this the weekday drops to its initial — "S" rather than "SAM." — which
 * is what lets a 31-column month keep fitting as the window narrows. The day
 * number never shrinks; it is the part being counted.
 */
const COMPACT_WEEKDAY_BELOW = 44;

/**
 * Expanded mode trades screen real estate for legibility: wider day columns and
 * taller rows. At the default scale a month is deliberately dense so it fits
 * beside the rest of the page.
 */
const LARGE_SCALE = 1.4;
const LARGE_ROW_HEIGHT = 84;

/** Longest gap we'll prefill wholesale when the user clicks it. */
const MAX_PREFILL_NIGHTS = 14;

/**
 * Paint order for the timeline.
 *
 * Every absolutely-positioned element in the grid lives in one stacking
 * context, so these have to be declared together to stay coherent. The rail
 * outranks everything in the scrolling area — including a bar being dragged —
 * because it is what the user reads to know *which* apartment a row is.
 */
const LAYER = {
  band: 1,
  gap: 2,
  block: 4,
  bar: 6,
  today: 7,
  draggingBar: 12,
  rail: 20,
  header: 30,
  headerRail: 40,
} as const;

interface DragState {
  bookingId: string;
  mode: "move" | "resize-start" | "resize-end";
  originX: number;
  originY: number;
  deltaDays: number;
  deltaRows: number;
  invalid: boolean;
}

interface HoverState {
  booking: BookingWithRelations;
  /** Viewport rect of the bar. */
  rect: DOMRect;
  /** Pointer position, which is what the tooltip actually follows. */
  pointer: { x: number; y: number };
}

export interface CalendarChange {
  bookingId: string;
  apartmentId: string;
  checkIn: ISODate;
  checkOut: ISODate;
}

export interface CalendarGridProps {
  apartments: Apartment[];
  bookings: BookingWithRelations[];
  blocks: CalendarBlock[];
  scale: CalendarScale;
  anchorDate: ISODate;
  /** Highlighted band from the availability search, if one is active. */
  searchRange?: { start: ISODate; end: ISODate } | null;
  /** Per-apartment search outcome, keyed by apartment id. */
  availability?: Map<string, AvailabilityResult>;
  onBookingClick: (booking: BookingWithRelations) => void;
  onCreate: (apartmentId: string, checkIn: ISODate, checkOut: ISODate) => void;
  onChange: (change: CalendarChange) => void;
  /** Bigger columns and rows, for the expanded view. */
  size?: "normal" | "large";
  /**
   * Caps the scrolling body so the day header stays put while rows scroll under
   * it. Without it the whole grid grows and the page scrolls instead.
   */
  maxBodyHeight?: string;
}

/**
 * Reservation timeline.
 *
 * Two ideas drive the layout:
 *
 * 1. **Vacancy is the product.** Empty background tells a manager nothing, so
 *    the gaps between stays are rendered as real objects — labelled with their
 *    length and clickable to book. Finding "where can I put a four-night stay"
 *    becomes reading, not counting columns.
 *
 * 2. **The rail carries the decision data.** Capacity, rate and — while an
 *    availability search is active — the quoted price for those exact dates sit
 *    beside each row, so comparing units doesn't require opening any of them.
 *
 * Stays can be dragged between dates and apartments and resized from either
 * edge; the preview turns red the moment it would overlap, and an invalid drop
 * is discarded rather than written. That is the same rule the database enforces
 * with its exclusion constraint, surfaced early enough to be an affordance.
 */
export function CalendarGrid({
  apartments,
  bookings,
  blocks,
  scale,
  anchorDate,
  searchRange,
  availability,
  onBookingClick,
  onCreate,
  onChange,
  size = "normal",
  maxBodyHeight,
}: CalendarGridProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const large = size === "large";
  const rowHeight = large ? LARGE_ROW_HEIGHT : ROW_HEIGHT;

  const days = useMemo(() => {
    const start = dayjs(anchorDate);
    const count = scale === "month" ? start.daysInMonth() : scale === "week" ? 7 : 1;
    const from = scale === "month" ? start.startOf("month") : start;
    return Array.from({ length: count }, (_, index) => from.add(index, "day"));
  }, [anchorDate, scale]);

  /*
   * A month is asked to show the whole month, so its columns are sized to the
   * space available rather than to a constant. A fixed 46px made February and
   * August alike overflow, and the grid then opened wherever it had been
   * scrolled to — the 1st was off-screen before you had done anything.
   *
   * Week and day already fit by construction, so they keep their fixed widths;
   * only the month has more columns than the viewport naturally holds.
   */
  const available = useContainerWidth(scrollRef);
  const dayWidth = useMemo(() => {
    const fixed = Math.round(DAY_WIDTH[scale] * (large ? LARGE_SCALE : 1));
    if (scale !== "month" || available <= 0) return fixed;
    const fitted = Math.floor((available - RAIL_WIDTH) / days.length);
    return Math.max(MIN_MONTH_DAY_WIDTH, fitted);
  }, [scale, large, available, days.length]);

  const compactWeekday = scale === "month" && dayWidth < COMPACT_WEEKDAY_BELOW;

  const windowStart = toISODate(days[0]);
  const windowEnd = toISODate(days[days.length - 1].add(1, "day"));
  const todayISO = toISODate(dayjs());

  const bookingsByApartment = useMemo(() => {
    const map = new Map<string, BookingWithRelations[]>();
    for (const booking of bookings) {
      if (booking.status === "cancelled" || booking.status === "no_show") continue;
      if (!staysOverlap(booking.check_in, booking.check_out, windowStart, windowEnd)) continue;
      const list = map.get(booking.apartment_id) ?? [];
      list.push(booking);
      map.set(booking.apartment_id, list);
    }
    return map;
  }, [bookings, windowStart, windowEnd]);

  const blocksByApartment = useMemo(() => {
    const map = new Map<string, CalendarBlock[]>();
    for (const block of blocks) {
      if (!staysOverlap(block.start_date, block.end_date, windowStart, windowEnd)) continue;
      const list = map.get(block.apartment_id) ?? [];
      list.push(block);
      map.set(block.apartment_id, list);
    }
    return map;
  }, [blocks, windowStart, windowEnd]);

  /** Bookable openings per apartment, derived from stays and blocks together. */
  const gapsByApartment = useMemo(() => {
    const map = new Map<string, Gap[]>();
    for (const apartment of apartments) {
      const occupied = occupiedIntervals(apartment.id, bookings, blocks);
      map.set(apartment.id, freeGaps(occupied, windowStart, windowEnd, apartment.min_nights));
    }
    return map;
  }, [apartments, bookings, blocks, windowStart, windowEnd]);

  const hasConflict = useCallback(
    (apartmentId: string, checkIn: ISODate, checkOut: ISODate, ignoreBookingId: string) => {
      const clash = bookings.some(
        (booking) =>
          booking.apartment_id === apartmentId &&
          booking.id !== ignoreBookingId &&
          booking.status !== "cancelled" &&
          booking.status !== "no_show" &&
          staysOverlap(checkIn, checkOut, booking.check_in, booking.check_out),
      );
      if (clash) return true;
      return blocks.some(
        (block) =>
          block.apartment_id === apartmentId &&
          staysOverlap(checkIn, checkOut, block.start_date, block.end_date),
      );
    },
    [bookings, blocks],
  );

  const previewOf = useCallback(
    (booking: BookingWithRelations, state: DragState) => {
      const rowIndex = apartments.findIndex((a) => a.id === booking.apartment_id);
      const targetRow = Math.min(
        apartments.length - 1,
        Math.max(0, rowIndex + (state.mode === "move" ? state.deltaRows : 0)),
      );
      let checkIn = dayjs(booking.check_in);
      let checkOut = dayjs(booking.check_out);

      if (state.mode === "move") {
        checkIn = checkIn.add(state.deltaDays, "day");
        checkOut = checkOut.add(state.deltaDays, "day");
      } else if (state.mode === "resize-start") {
        checkIn = checkIn.add(state.deltaDays, "day");
        if (!checkIn.isBefore(checkOut, "day")) checkIn = checkOut.subtract(1, "day");
      } else {
        checkOut = checkOut.add(state.deltaDays, "day");
        if (!checkOut.isAfter(checkIn, "day")) checkOut = checkIn.add(1, "day");
      }

      return {
        apartmentId: apartments[targetRow]?.id ?? booking.apartment_id,
        checkIn: toISODate(checkIn),
        checkOut: toISODate(checkOut),
      };
    },
    [apartments],
  );

  /**
   * Hover is ignored while a drag is in flight. Clearing it once on pointer-down
   * isn't enough: dragging a bar across its neighbours fires `mouseenter` on
   * each one, so the tooltip would chase the cursor through the whole gesture.
   */
  const handleHover = useCallback((next: HoverState | null) => {
    if (dragRef.current) return;
    setHover(next);
  }, []);

  const beginDrag = useCallback(
    (event: ReactPointerEvent, booking: BookingWithRelations, mode: DragState["mode"]) => {
      event.preventDefault();
      event.stopPropagation();
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
      // The tooltip would otherwise sit under the cursor for the whole drag.
      setHover(null);
      const state: DragState = {
        bookingId: booking.id,
        mode,
        originX: event.clientX,
        originY: event.clientY,
        deltaDays: 0,
        deltaRows: 0,
        invalid: false,
      };
      dragRef.current = state;
      setDrag(state);
    },
    [],
  );

  useEffect(() => {
    if (!drag) return;

    const onPointerMove = (event: PointerEvent) => {
      const state = dragRef.current;
      if (!state) return;
      const booking = bookings.find((b) => b.id === state.bookingId);
      if (!booking) return;

      const deltaDays = Math.round((event.clientX - state.originX) / dayWidth);
      const deltaRows =
        state.mode === "move" ? Math.round((event.clientY - state.originY) / rowHeight) : 0;

      const next: DragState = { ...state, deltaDays, deltaRows, invalid: false };
      const preview = previewOf(booking, next);
      next.invalid = hasConflict(preview.apartmentId, preview.checkIn, preview.checkOut, booking.id);

      dragRef.current = next;
      setDrag(next);
    };

    const onPointerUp = () => {
      const state = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!state) return;

      const booking = bookings.find((b) => b.id === state.bookingId);
      if (!booking) return;
      if (state.deltaDays === 0 && state.deltaRows === 0) return;
      if (state.invalid) return;

      const preview = previewOf(booking, state);
      if (
        preview.apartmentId === booking.apartment_id &&
        preview.checkIn === booking.check_in &&
        preview.checkOut === booking.check_out
      ) {
        return;
      }
      onChange({ bookingId: booking.id, ...preview });
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [drag, bookings, dayWidth, rowHeight, previewOf, hasConflict, onChange]);

  const gridWidth = days.length * dayWidth;
  const columnOf = useCallback(
    (iso: ISODate) => days.findIndex((day) => toISODate(day) === iso),
    [days],
  );

  /** Pixel span of the search band, clipped to the visible window. */
  const searchBand = useMemo(() => {
    if (!searchRange) return null;
    if (!staysOverlap(searchRange.start, searchRange.end, windowStart, windowEnd)) return null;
    const from = searchRange.start < windowStart ? windowStart : searchRange.start;
    const to = searchRange.end > windowEnd ? windowEnd : searchRange.end;
    const startIndex = columnOf(from);
    const nights = dayjs(to).diff(dayjs(from), "day");
    if (startIndex < 0 || nights <= 0) return null;
    return { left: startIndex * dayWidth, width: nights * dayWidth };
  }, [searchRange, windowStart, windowEnd, dayWidth, columnOf]);

  const todayColumn = columnOf(todayISO);

  // A month is wider than the viewport, so landing on column 1 buries the part
  // of the month the user came to look at. Bring the searched dates — or
  // today — into view instead.
  const focusColumn = searchRange ? columnOf(searchRange.start) : todayColumn;
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || focusColumn < 0) return;
    // Nothing to bring into view when the whole window already fits, and
    // scrolling anyway is what pushed the 1st of the month off-screen.
    if (container.scrollWidth <= container.clientWidth + 1) return;
    container.scrollTo({ left: Math.max(0, focusColumn * dayWidth - 160), behavior: "smooth" });
  }, [focusColumn, dayWidth]);

  // Only lift the rail's shadow once there is content scrolled beneath it.
  const onScroll = useCallback(() => {
    setScrolled((scrollRef.current?.scrollLeft ?? 0) > 4);
  }, []);

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="overflow-x-auto"
        style={maxBodyHeight ? { maxHeight: maxBodyHeight, overflowY: "auto" } : undefined}
      >
        <div style={{ minWidth: RAIL_WIDTH + gridWidth }}>
          {/* --- Header ------------------------------------------------ */}
          <div
            className="sticky top-0 flex border-b border-line bg-surface-2"
            style={{ zIndex: LAYER.header }}
          >
            <div
              className={cn(
                "sticky left-0 flex shrink-0 items-end border-r border-line bg-surface-2 px-4 pb-2 pt-3",
                scrolled && "shadow-[6px_0_10px_-8px_rgba(0,0,0,0.35)]",
              )}
              style={{ width: RAIL_WIDTH, zIndex: LAYER.headerRail }}
            >
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-3">
                {strings().calendar.apartmentCount(apartments.length)}
              </span>
            </div>

            <div className="relative flex" style={{ width: gridWidth }}>
              {searchBand ? (
                <div
                  aria-hidden
                  className="absolute inset-y-0 border-x border-dashed border-brand/50 bg-brand/8"
                  style={{ left: searchBand.left, width: searchBand.width }}
                />
              ) : null}

              {days.map((day) => {
                const iso = toISODate(day);
                const isToday = iso === todayISO;
                const isWeekend = day.day() === 0 || day.day() === 6;
                const startsWeek = day.day() === 1 && scale === "month";
                return (
                  <div
                    key={iso}
                    className={cn(
                      "relative shrink-0 border-r border-line py-1.5 text-center last:border-r-0",
                      isWeekend && "bg-surface-3/60",
                      // A weekly rhythm makes a 31-column month countable.
                      startsWeek && "border-l border-l-line-strong",
                    )}
                    style={{ width: dayWidth }}
                  >
                    <div
                      className={cn(
                        "text-[10px] uppercase tracking-wide",
                        isToday ? "font-semibold text-brand" : "text-ink-3",
                      )}
                    >
                      {day.format(
                        scale === "day" ? "dddd" : compactWeekday ? "dd" : "ddd",
                      )}
                    </div>
                    {isToday && scale !== "day" ? (
                      <div className="mx-auto mt-0.5 grid size-6 place-items-center rounded-full bg-brand text-[12px] font-semibold text-brand-ink tnum">
                        {day.format("D")}
                      </div>
                    ) : (
                      <div className="mt-0.5 text-[13px] leading-6 text-ink tnum">
                        {day.format(scale === "day" ? strings().format.dateLong : "D")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* --- Rows -------------------------------------------------- */}
          <div className="relative">
            {apartments.map((apartment) => {
              const rowBookings = bookingsByApartment.get(apartment.id) ?? [];
              const rowBlocks = blocksByApartment.get(apartment.id) ?? [];
              const rowGaps = gapsByApartment.get(apartment.id) ?? [];
              const result = availability?.get(apartment.id);
              const dimmed = Boolean(result && !result.available);

              return (
                <div
                  key={apartment.id}
                  className={cn(
                    "group/row flex border-b border-line last:border-b-0",
                    dimmed && "opacity-60",
                  )}
                  style={{ height: rowHeight }}
                >
                  <ApartmentRail apartment={apartment} result={result} scrolled={scrolled} />

                  <div className="relative" style={{ width: gridWidth }}>
                    {/* Day cells — double-click one to start a booking there. */}
                    <div className="absolute inset-0 flex">
                      {days.map((day) => {
                        const iso = toISODate(day);
                        const isWeekend = day.day() === 0 || day.day() === 6;
                        const startsWeek = day.day() === 1 && scale === "month";
                        return (
                          <button
                            key={iso}
                            type="button"
                            tabIndex={-1}
                            aria-label={strings().calendar.newBookingFor(apartment.name, formatDate(iso))}
                            onDoubleClick={() =>
                              onCreate(
                                apartment.id,
                                iso,
                                toISODate(dayjs(iso).add(Math.max(1, apartment.min_nights), "day")),
                              )
                            }
                            className={cn(
                              "shrink-0 border-r border-line transition-colors last:border-r-0",
                              isWeekend && "bg-surface-3/40",
                              startsWeek && "border-l border-l-line-strong",
                              "group-hover/row:bg-surface-2/60",
                            )}
                            style={{ width: dayWidth }}
                          />
                        );
                      })}
                    </div>

                    {searchBand ? (
                      <div
                        aria-hidden
                        className={cn(
                          "absolute inset-y-0 border-x border-dashed",
                          result?.available
                            ? "border-brand/50 bg-brand/8"
                            : "border-line-strong bg-surface-3/50",
                        )}
                        style={{
                          left: searchBand.left,
                          width: searchBand.width,
                          zIndex: LAYER.band,
                        }}
                      />
                    ) : null}

                    {/* Openings, drawn before stays so bars always sit on top. */}
                    {rowGaps.map((gap) => (
                      <GapChip
                        key={`${apartment.id}-${gap.start}`}
                        gap={gap}
                        apartment={apartment}
                        columnOf={columnOf}
                        dayWidth={dayWidth}
                        onCreate={onCreate}
                      />
                    ))}

                    {rowBlocks.map((block) => {
                      const geometry = spanGeometry(
                        block.start_date, block.end_date, windowStart, windowEnd, dayWidth, columnOf,
                      );
                      if (!geometry) return null;
                      return (
                        <div
                          key={block.id}
                          title={`${block.reason.replace(/_/g, " ")}${block.note ? ` — ${block.note}` : ""}`}
                          className="pointer-events-none absolute top-2 bottom-2 rounded-lg border border-line"
                          style={{
                            left: geometry.left,
                            width: geometry.width,
                            zIndex: LAYER.block,
                            background:
                              "repeating-linear-gradient(45deg, var(--surface-3) 0 6px, var(--surface-2) 6px 12px)",
                          }}
                        >
                          <span className="flex h-full items-center px-2 text-[11px] font-medium text-ink-2">
                            {block.reason === "maintenance" ? strings().status.apartment.maintenance : strings().status.apartment.blocked}
                          </span>
                        </div>
                      );
                    })}

                    {rowBookings.map((booking) => (
                      <BookingBar
                        key={booking.id}
                        booking={booking}
                        columnOf={columnOf}
                        dayWidth={dayWidth}
                        windowStart={windowStart}
                        windowEnd={windowEnd}
                        drag={drag?.bookingId === booking.id ? drag : null}
                        hovered={hover?.booking.id === booking.id}
                        onHover={handleHover}
                        onClick={() => onBookingClick(booking)}
                        onDragStart={beginDrag}
                        rowHeight={rowHeight}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* One continuous "now" rule, rather than a tint repeated per row.
                It stops at the rail because the rail outranks it. */}
            {todayColumn >= 0 && scale !== "day" ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0"
                style={{ left: RAIL_WIDTH, width: gridWidth, zIndex: LAYER.today }}
              >
                <div
                  className="absolute inset-y-0 w-px bg-brand/70"
                  style={{ left: todayColumn * dayWidth }}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <BookingTooltip hover={hover} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Left rail                                                           */
/* ------------------------------------------------------------------ */

function ApartmentRail({
  apartment,
  result,
  scrolled,
}: {
  apartment: Apartment;
  result?: AvailabilityResult;
  scrolled: boolean;
}) {
  return (
    <div
      className={cn(
        "sticky left-0 flex shrink-0 flex-col justify-center border-r border-line bg-surface px-4",
        "transition-colors group-hover/row:bg-surface-2",
        scrolled && "shadow-[6px_0_10px_-8px_rgba(0,0,0,0.35)]",
      )}
      style={{ width: RAIL_WIDTH, zIndex: LAYER.rail }}
    >
      <span className="truncate text-[13px] font-medium text-ink">{apartment.name}</span>

      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-3">
        <span className="tnum">{apartment.code}</span>
        <span aria-hidden>·</span>
        <span className="flex items-center gap-0.5">
          <Users className="size-3" aria-hidden />
          <span className="tnum">{apartment.capacity}</span>
        </span>

        {result ? (
          result.available && result.quote ? (
            // The whole point of a search: compare price without opening rows.
            <>
              <span aria-hidden>·</span>
              <span className="font-semibold text-ink tnum">
                {money(result.quote.total, { cents: false })}
              </span>
              <span className="text-ink-3">total</span>
            </>
          ) : (
            <>
              <span aria-hidden>·</span>
              <span className="font-medium text-ink-2">{unavailableLabel(result)}</span>
            </>
          )
        ) : (
          <>
            <span aria-hidden>·</span>
            <span className="tnum">{money(apartment.nightly_rate, { cents: false })}</span>
          </>
        )}
      </span>
    </div>
  );
}

function unavailableLabel(result: AvailabilityResult): string {
  switch (result.reason) {
    case "booked":
      return strings().calendar.booked;
    case "too_small":
      return strings().calendar.sleeps(result.apartment.capacity);
    case "below_minimum":
      return strings().calendar.minNights(result.apartment.min_nights);
    case "inactive":
      return strings().calendar.inactive;
    default:
      return strings().calendar.unavailable;
  }
}

/* ------------------------------------------------------------------ */
/* Gaps                                                                */
/* ------------------------------------------------------------------ */

/**
 * A bookable opening.
 *
 * Rendering vacancy explicitly — rather than leaving it as background — is what
 * turns "scan for a white space wide enough" into "read the number".
 */
function GapChip({
  gap,
  apartment,
  columnOf,
  dayWidth,
  onCreate,
}: {
  gap: Gap;
  apartment: Apartment;
  columnOf: (iso: ISODate) => number;
  dayWidth: number;
  onCreate: (apartmentId: string, checkIn: ISODate, checkOut: ISODate) => void;
}) {
  const startIndex = columnOf(gap.start);
  if (startIndex < 0) return null;

  const width = gap.nights * dayWidth - 6;
  if (width < 14) return null;

  // Short openings prefill whole; long ones would make an absurd default stay.
  const prefillNights =
    gap.nights <= MAX_PREFILL_NIGHTS ? gap.nights : Math.max(apartment.min_nights, 7);
  const checkOut = toISODate(dayjs(gap.start).add(prefillNights, "day"));

  const showLabel = width >= 62;
  const label = gap.clippedStart || gap.clippedEnd ? `${gap.nights}n+` : `${gap.nights}n`;

  return (
    <button
      type="button"
      onClick={() => onCreate(apartment.id, gap.start, checkOut)}
      title={`${strings().calendar.freeFrom(nightsLabel(gap.nights), formatDate(gap.start))}${
        gap.belowMinimum ? strings().calendar.belowMinimum(apartment.min_nights) : ""
      }`}
      className={cn(
        "group absolute top-2.5 bottom-2.5 flex items-center justify-center gap-1",
        "rounded-lg border border-dashed transition-colors",
        gap.belowMinimum
          ? "border-warning/50 hover:border-warning hover:bg-warning-wash"
          : "border-line-strong hover:border-brand hover:bg-brand-wash",
      )}
      style={{ left: startIndex * dayWidth + 3, width, zIndex: LAYER.gap }}
    >
      <Plus
        className={cn(
          "size-3 shrink-0 transition-colors",
          gap.belowMinimum ? "text-warning" : "text-ink-3 group-hover:text-brand",
        )}
        aria-hidden
      />
      {showLabel ? (
        <span
          className={cn(
            "text-[11px] font-medium tnum transition-colors",
            gap.belowMinimum ? "text-ink-2" : "text-ink-3 group-hover:text-brand",
          )}
        >
          {label}
        </span>
      ) : null}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Stays                                                               */
/* ------------------------------------------------------------------ */

function spanGeometry(
  start: ISODate,
  end: ISODate,
  windowStart: ISODate,
  windowEnd: ISODate,
  dayWidth: number,
  columnOf: (iso: ISODate) => number,
) {
  if (!staysOverlap(start, end, windowStart, windowEnd)) return null;
  const from = start < windowStart ? windowStart : start;
  const to = end > windowEnd ? windowEnd : end;
  const startIndex = columnOf(from);
  const nights = dayjs(to).diff(dayjs(from), "day");
  if (startIndex < 0 || nights <= 0) return null;
  return {
    left: startIndex * dayWidth,
    width: nights * dayWidth - 4,
    clippedStart: start < windowStart,
    clippedEnd: end > windowEnd,
  };
}

function BookingBar({
  booking,
  columnOf,
  dayWidth,
  windowStart,
  windowEnd,
  drag,
  hovered,
  onHover,
  onClick,
  onDragStart,
  rowHeight,
}: {
  booking: BookingWithRelations;
  columnOf: (iso: ISODate) => number;
  dayWidth: number;
  rowHeight: number;
  windowStart: ISODate;
  windowEnd: ISODate;
  drag: DragState | null;
  hovered: boolean;
  onHover: (hover: HoverState | null) => void;
  onClick: () => void;
  onDragStart: (
    event: ReactPointerEvent,
    booking: BookingWithRelations,
    mode: DragState["mode"],
  ) => void;
}) {
  const geometry = spanGeometry(
    booking.check_in, booking.check_out, windowStart, windowEnd, dayWidth, columnOf,
  );
  if (!geometry) return null;

  const meta = BOOKING_STATUS_META[booking.status];
  const dragging = Boolean(drag);

  let offsetX = 0;
  let offsetY = 0;
  let widthDelta = 0;
  if (drag) {
    if (drag.mode === "move") {
      offsetX = drag.deltaDays * dayWidth;
      offsetY = drag.deltaRows * rowHeight;
    } else if (drag.mode === "resize-start") {
      offsetX = drag.deltaDays * dayWidth;
      widthDelta = -drag.deltaDays * dayWidth;
    } else {
      widthDelta = drag.deltaDays * dayWidth;
    }
  }

  const width = Math.max(dayWidth - 4, geometry.width + widthDelta);
  const compact = width < 104;

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={strings().calendar.barLabel(fullName(booking.guest), formatDate(booking.check_in), formatDate(booking.check_out))}
      onPointerDown={(event) => onDragStart(event, booking, "move")}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      onMouseEnter={(event) =>
        onHover({
          booking,
          rect: event.currentTarget.getBoundingClientRect(),
          pointer: { x: event.clientX, y: event.clientY },
        })
      }
      onMouseLeave={() => onHover(null)}
      animate={{ x: offsetX, y: offsetY }}
      transition={dragging ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }}
      className={cn(
        "group absolute top-2 bottom-2 flex cursor-grab select-none items-center gap-1.5",
        "border pl-2 pr-1.5 transition-shadow",
        // Square off an edge that runs past the window, so a clipped stay never
        // looks like one that happens to start or end at the boundary.
        geometry.clippedStart ? "rounded-l-none" : "rounded-l-lg",
        geometry.clippedEnd ? "rounded-r-none" : "rounded-r-lg",
        dragging && "cursor-grabbing shadow-lg",
        drag?.invalid && "ring-2 ring-critical",
        hovered && !dragging && "shadow-md",
        meta.chip,
      )}
      style={{
        left: geometry.left,
        width,
        zIndex: dragging ? LAYER.draggingBar : LAYER.bar,
        borderLeftWidth: geometry.clippedStart ? 0 : 3,
        borderLeftColor: meta.color,
      }}
    >
      <span
        role="presentation"
        onPointerDown={(event) => onDragStart(event, booking, "resize-start")}
        className="absolute left-0 top-0 h-full w-2 cursor-ew-resize rounded-l-lg opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: meta.color }}
      />
      <span
        role="presentation"
        onPointerDown={(event) => onDragStart(event, booking, "resize-end")}
        className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r-lg opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: meta.color }}
      />

      {/*
        A month-long stay is wider than the screen, so its start — and with it the
        guest's name — often scrolls off to the left, leaving nothing on screen but a
        blank slab. Both ends of the bar are stuck to the edges of the visible grid
        (the leading one clear of the apartment rail) so every bar stays readable
        however it is scrolled. Neither may be `flex-1`: a sticky box can only slide
        within its containing block, so one filling the whole bar has nowhere to go.
      */}
      <span
        className="sticky flex min-w-0 max-w-[14rem] items-center gap-1.5"
        style={{ left: RAIL_WIDTH + 8 }}
      >
        {geometry.clippedStart ? (
          <ChevronLeft className="size-3 shrink-0 text-ink-3" aria-label={strings().calendar.startsBefore} />
        ) : null}
        <span className="truncate text-[11.5px] font-medium leading-tight text-ink">
          {fullName(booking.guest)}
        </span>
      </span>

      <span className="sticky right-1.5 ml-auto flex shrink-0 items-center gap-1">
        {!compact && booking.balance > 0 ? (
          <span
            className="size-1.5 rounded-full bg-serious"
            title={`${money(booking.balance)} outstanding`}
            aria-label={`${money(booking.balance)} outstanding`}
          />
        ) : null}
        {!compact ? <span className="text-[10.5px] text-ink-2 tnum">{booking.nights}n</span> : null}
        {geometry.clippedEnd ? (
          <ChevronRight className="size-3 shrink-0 text-ink-3" aria-label={strings().calendar.continuesPast} />
        ) : null}
      </span>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Tooltip                                                             */
/* ------------------------------------------------------------------ */

const TOOLTIP_WIDTH = 264;
const TOOLTIP_MARGIN = 12;
/** Approximate rendered height, used only to decide whether to flip above. */
const TOOLTIP_HEIGHT = 210;

/**
 * Stay details on hover.
 *
 * Portalled to the document, because the timeline scrolls horizontally and a
 * scroll container clips on *both* axes — a tooltip drawn inside a row gets cut
 * off.
 *
 * It follows the **pointer** rather than the bar's left edge. A stay that began
 * before the visible window has a rect starting far off-screen to the left, so
 * anchoring to it and clamping to the viewport parked the tooltip in the top-left
 * corner, over the sidebar, nowhere near the bar it described. The pointer is
 * always over the bar by definition.
 */
function BookingTooltip({ hover }: { hover: HoverState | null }) {
  const isClient = useIsClient();
  if (!isClient || !hover) return null;

  const { booking, rect, pointer } = hover;
  const meta = BOOKING_STATUS_META[booking.status];

  // Centre on the cursor, then keep the whole card on screen.
  const left = Math.min(
    Math.max(TOOLTIP_MARGIN, pointer.x - TOOLTIP_WIDTH / 2),
    window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_MARGIN,
  );
  // Sit below the row, flipping above it when there is no room.
  const below = rect.bottom + TOOLTIP_HEIGHT < window.innerHeight;
  const top = below
    ? rect.bottom + 8
    : Math.max(TOOLTIP_MARGIN, rect.top - TOOLTIP_HEIGHT - 8);

  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[80] rounded-xl border border-line bg-surface p-3 text-left shadow-lg"
      style={{ left, top, width: TOOLTIP_WIDTH }}
    >
      <p className="truncate text-[13px] font-semibold text-ink">{fullName(booking.guest)}</p>
      <p className="mt-0.5 text-[12px] text-ink-2">
        {formatShortDate(booking.check_in)} → {formatDate(booking.check_out)}
      </p>
      <dl className="mt-2 space-y-1 text-[12px]">
        <Row label={strings().calendar.tooltipNights} value={nightsLabel(booking.nights)} />
        <Row label={strings().calendar.tooltipGuests} value={String(booking.adults + booking.children)} />
        <Row label={strings().common.total} value={money(booking.total)} />
        <Row
          label={strings().calendar.tooltipBalance}
          value={money(booking.balance)}
          tone={booking.balance > 0 ? "warning" : undefined}
        />
        <div className="flex items-center justify-between gap-3 pt-0.5">
          <dt className="text-ink-3">{strings().common.status}</dt>
          <dd className="flex items-center gap-1.5 text-ink">
            <span aria-hidden className="size-1.5 rounded-full" style={{ background: meta.color }} />
            {meta.label}
          </dd>
        </div>
      </dl>
    </div>,
    document.body,
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning";
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-3">{label}</dt>
      <dd className={cn("tnum", tone === "warning" ? "text-serious" : "text-ink")}>{value}</dd>
    </div>
  );
}
