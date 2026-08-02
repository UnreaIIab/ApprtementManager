"use client";

import { useMemo, useState } from "react";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { Dialog } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { formatDate, fullName, money } from "@/lib/format";
import { dayjs } from "@/lib/date-range";
import { isFree, nightsBetween } from "@/lib/availability";
import { quoteStay } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import type {
  Apartment,
  BookingWithRelations,
  CalendarBlock,
  ISODate,
} from "@/types/domain";

/** What a drop on the timeline is proposing, before anything is written. */
export interface PendingChange {
  booking: BookingWithRelations;
  apartmentId: string;
  checkIn: ISODate;
  checkOut: ISODate;
}

export interface ConfirmedChange {
  apartmentId: string;
  checkIn: ISODate;
  checkOut: ISODate;
  checkInTime: string;
  checkOutTime: string;
}

const DEFAULT_CHECK_IN_TIME = "15:00";
const DEFAULT_CHECK_OUT_TIME = "11:00";

/**
 * Confirmation step for a stay moved, extended or shortened on the timeline.
 *
 * A drag is a coarse gesture: a few pixels either way is a different night, and
 * dropping a card on the wrong row silently reassigns the apartment. So the drop
 * proposes rather than commits, and this dialog is where the change becomes
 * real. Every field it lands on is editable here, arrival and departure times
 * included — the timeline works in whole days and cannot express those at all,
 * yet they are what the cleaner and the guest actually go by.
 */
export function BookingChangeDialog({
  pending,
  apartments,
  bookings,
  blocks,
  taxRate,
  saving,
  onCancel,
  onConfirm,
}: {
  pending: PendingChange;
  apartments: Apartment[];
  bookings: BookingWithRelations[];
  blocks: CalendarBlock[];
  taxRate: number;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (change: ConfirmedChange) => void;
}) {
  const t = useT();
  const { booking } = pending;

  const [apartmentId, setApartmentId] = useState(pending.apartmentId);
  const [checkIn, setCheckIn] = useState<ISODate>(pending.checkIn);
  const [checkOut, setCheckOut] = useState<ISODate>(pending.checkOut);
  const [checkInTime, setCheckInTime] = useState(
    booking.check_in_time ?? DEFAULT_CHECK_IN_TIME,
  );
  const [checkOutTime, setCheckOutTime] = useState(
    booking.check_out_time ?? DEFAULT_CHECK_OUT_TIME,
  );

  const from = apartments.find((a) => a.id === booking.apartment_id);
  const to = apartments.find((a) => a.id === apartmentId);

  const nights = nightsBetween(checkIn, checkOut);
  const movedRoom = apartmentId !== booking.apartment_id;
  const movedDates = checkIn !== booking.check_in || checkOut !== booking.check_out;
  const movedTimes =
    checkInTime !== (booking.check_in_time ?? DEFAULT_CHECK_IN_TIME) ||
    checkOutTime !== (booking.check_out_time ?? DEFAULT_CHECK_OUT_TIME);

  /*
   * The dates are editable here, so the check the grid ran on drop no longer
   * settles it — it has to be re-run against whatever is in the fields now. The
   * stay being moved is excluded, otherwise it would always collide with itself.
   */
  const others = useMemo(
    () => bookings.filter((entry) => entry.id !== booking.id),
    [bookings, booking.id],
  );
  const conflict = nights > 0 && !isFree(apartmentId, checkIn, checkOut, others, blocks);

  const quote = to ? quoteStay(to, nights, taxRate, {
    nightlyRate: booking.nightly_rate,
    extraFees: booking.extra_fees,
  }) : null;
  const difference = quote ? quote.total - booking.total : 0;

  const belowMinimum = to && nights > 0 && nights < to.min_nights;
  const blocked = nights <= 0 || conflict;

  return (
    <Dialog
      open
      onClose={onCancel}
      size="lg"
      title={t.change.title}
      description={`${booking.reference} · ${fullName(booking.guest)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {t.common.cancel}
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={blocked}
            onClick={() =>
              onConfirm({ apartmentId, checkIn, checkOut, checkInTime, checkOutTime })
            }
          >
            {t.change.confirmChange}
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        {/* --- What is changing ---------------------------------------- */}
        <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
          <ComparisonRow
            label={t.change.apartment}
            before={from?.name ?? "—"}
            after={to?.name ?? "—"}
            changed={movedRoom}
          />
          <ComparisonRow
            label={t.change.checkIn}
            before={`${formatDate(booking.check_in, t.format.weekdayDate)} · ${booking.check_in_time ?? DEFAULT_CHECK_IN_TIME}`}
            after={`${formatDate(checkIn, t.format.weekdayDate)} · ${checkInTime}`}
            changed={checkIn !== booking.check_in || checkInTime !== (booking.check_in_time ?? DEFAULT_CHECK_IN_TIME)}
          />
          <ComparisonRow
            label={t.change.checkOut}
            before={`${formatDate(booking.check_out, t.format.weekdayDate)} · ${booking.check_out_time ?? DEFAULT_CHECK_OUT_TIME}`}
            after={`${formatDate(checkOut, t.format.weekdayDate)} · ${checkOutTime}`}
            changed={checkOut !== booking.check_out || checkOutTime !== (booking.check_out_time ?? DEFAULT_CHECK_OUT_TIME)}
          />
          <ComparisonRow
            label={t.change.nights}
            before={`${booking.nights}`}
            after={`${nights}`}
            changed={nights !== booking.nights}
          />
          {quote ? (
            <ComparisonRow
              label={t.common.total}
              before={money(booking.total)}
              after={money(quote.total)}
              changed={quote.total !== booking.total}
              last
            />
          ) : null}
        </div>

        {/* --- Adjust before committing -------------------------------- */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.change.apartment} className="sm:col-span-2" htmlFor="cc-apartment">
            <Select
              id="cc-apartment"
              value={apartmentId}
              onChange={(event) => setApartmentId(event.target.value)}
            >
              {apartments.map((apartment) => (
                <option key={apartment.id} value={apartment.id}>
                  {apartment.name} · {apartment.code}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t.change.checkInDate} htmlFor="cc-in">
            <Input
              id="cc-in"
              type="date"
              value={checkIn}
              onChange={(event) => {
                const value = event.target.value as ISODate;
                setCheckIn(value);
                // Keep the stay at least one night rather than letting the
                // dates cross over and read as a negative length.
                if (value >= checkOut) {
                  setCheckOut(dayjs(value).add(1, "day").format("YYYY-MM-DD") as ISODate);
                }
              }}
            />
          </Field>

          <Field label={t.change.arrivalTime} hint={t.change.arrivalTimeHint} htmlFor="cc-in-time">
            <Input
              id="cc-in-time"
              type="time"
              value={checkInTime}
              onChange={(event) => setCheckInTime(event.target.value)}
            />
          </Field>

          <Field label={t.change.checkOutDate} htmlFor="cc-out">
            <Input
              id="cc-out"
              type="date"
              value={checkOut}
              min={dayjs(checkIn).add(1, "day").format("YYYY-MM-DD")}
              onChange={(event) => setCheckOut(event.target.value as ISODate)}
            />
          </Field>

          <Field label={t.change.departureTime} hint={t.change.departureTimeHint} htmlFor="cc-out-time">
            <Input
              id="cc-out-time"
              type="time"
              value={checkOutTime}
              onChange={(event) => setCheckOutTime(event.target.value)}
            />
          </Field>
        </div>

        {/* --- Anything worth stopping for ----------------------------- */}
        {conflict ? (
          <Notice tone="critical">
            {t.change.overlap(to?.name ?? t.change.thatApartment)}
          </Notice>
        ) : null}

        {nights <= 0 ? (
          <Notice tone="critical">{t.change.checkOutAfterCheckIn}</Notice>
        ) : null}

        {belowMinimum ? (
          <Notice tone="serious">
            {t.change.belowMinimum(nights, to?.min_nights ?? 0, to?.name ?? "")}
          </Notice>
        ) : null}

        {quote && difference !== 0 ? (
          <Notice tone="serious">
            {difference > 0
              ? t.change.repricedUp(money(Math.abs(difference)))
              : t.change.repricedDown(money(Math.abs(difference)))}
            {booking.paid > 0 ? t.change.alreadyPaid(money(booking.paid)) : "."}
          </Notice>
        ) : null}

        {!movedRoom && !movedDates && !movedTimes ? (
          <Notice tone="muted">{t.common.nothingChanged}</Notice>
        ) : null}
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

function ComparisonRow({
  label,
  before,
  after,
  changed,
  last,
}: {
  label: string;
  before: string;
  after: string;
  changed: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[7rem_1fr_auto_1fr] items-center gap-2 py-1.5",
        !last && "border-b border-line/60",
      )}
    >
      <span className="text-[12px] text-ink-2">{label}</span>
      <span className={cn("truncate text-[13px]", changed ? "text-ink-2 line-through" : "text-ink")}>
        {before}
      </span>
      <ArrowRight className={cn("size-3.5", changed ? "text-ink-2" : "text-transparent")} />
      <span
        className={cn(
          "truncate text-[13px]",
          changed ? "font-semibold text-ink" : "text-ink-3",
        )}
      >
        {changed ? after : "unchanged"}
      </span>
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "critical" | "serious" | "muted";
  children: React.ReactNode;
}) {
  const tones = {
    critical: "border-critical/30 bg-critical/10 text-critical",
    serious: "border-serious/30 bg-serious/10 text-ink",
    muted: "border-line bg-surface-2 text-ink-2",
  } as const;

  return (
    <p className={cn("flex gap-2 rounded-lg border px-3 py-2 text-[12.5px]", tones[tone])}>
      {tone === "muted" ? null : <TriangleAlert className="mt-px size-4 shrink-0" />}
      <span>{children}</span>
    </p>
  );
}
