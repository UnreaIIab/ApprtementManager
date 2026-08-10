"use client";

import { useMemo } from "react";
import { CalendarSearch, Minus, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { dayjs, toISODate } from "@/lib/date-range";
import { formatDateRange, money, nightsLabel } from "@/lib/format";
import { nightsBetween, type AvailabilityResult } from "@/lib/availability";
import { Button, IconButton } from "@/components/ui/button";
import { useT } from "@/i18n";
import type { ISODate } from "@/types/domain";

export interface AvailabilityQueryState {
  checkIn: ISODate;
  checkOut: ISODate;
  guests: number;
}

export function defaultAvailabilityQuery(): AvailabilityQueryState {
  const today = dayjs();
  return {
    checkIn: toISODate(today),
    checkOut: toISODate(today.add(2, "day")),
    guests: 2,
  };
}

/**
 * Availability search.
 *
 * Modelled on how a booking site asks the question — dates, then party size —
 * because that is the order a manager receives it in on the phone. Applying it
 * doesn't navigate anywhere: it bands the matching dates across the timeline
 * already on screen and prices each unit in place, so the answer arrives in the
 * context where the booking will be made.
 */
export function AvailabilitySearch({
  value,
  onChange,
  active,
  onApply,
  onClear,
  results,
  onlyAvailable,
  onOnlyAvailableChange,
}: {
  value: AvailabilityQueryState;
  onChange: (next: AvailabilityQueryState) => void;
  /** Whether the current query is applied to the grid. */
  active: boolean;
  onApply: () => void;
  onClear: () => void;
  results: AvailabilityResult[];
  onlyAvailable: boolean;
  onOnlyAvailableChange: (next: boolean) => void;
}) {
  const t = useT();
  const nights = nightsBetween(value.checkIn, value.checkOut);
  const valid = nights > 0;

  const summary = useMemo(() => {
    const availableResults = results.filter((result) => result.available);
    const prices = availableResults
      .map((result) => result.quote?.total ?? 0)
      .filter((total) => total > 0)
      .sort((a, b) => a - b);
    return {
      available: availableResults.length,
      total: results.length,
      cheapest: prices[0] ?? null,
      dearest: prices[prices.length - 1] ?? null,
      revenue: prices.reduce((acc, price) => acc + price, 0),
    };
  }, [results]);

  const setDates = (patch: Partial<AvailabilityQueryState>) => {
    const next = { ...value, ...patch };
    // Keep the range coherent while the user edits either end.
    if (next.checkOut <= next.checkIn) {
      next.checkOut = toISODate(dayjs(next.checkIn).add(1, "day"));
    }
    onChange(next);
  };

  return (
    <div
      className={cn(
        "no-print overflow-hidden rounded-card border bg-surface transition-colors",
        active ? "border-brand/40 shadow-sm" : "border-line",
      )}
    >
      <div className="flex flex-wrap items-end gap-3 p-3 sm:p-4">
        <div className="flex items-center gap-2 self-center pr-1">
          <span className="grid size-8 place-items-center rounded-xl bg-brand-wash text-brand">
            <CalendarSearch className="size-4" aria-hidden />
          </span>
          <span className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">
            {t.availability.findAvailability}
          </span>
        </div>

        <DateField
          label={t.availability.checkIn}
          id="avail-in"
          value={value.checkIn}
          onChange={(checkIn) => setDates({ checkIn })}
        />
        <DateField
          label={t.availability.checkOut}
          id="avail-out"
          value={value.checkOut}
          min={toISODate(dayjs(value.checkIn).add(1, "day"))}
          onChange={(checkOut) => setDates({ checkOut })}
        />

        <div>
          <span className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-wide text-ink-3">
            {t.availability.guests}
          </span>
          <div className="flex h-10 items-center gap-1 rounded-xl border border-line bg-surface px-1">
            <IconButton
              label={t.availability.oneGuestFewer}
              disabled={value.guests <= 1}
              onClick={() => onChange({ ...value, guests: Math.max(1, value.guests - 1) })}
              icon={<Minus className="size-3.5" />}
            />
            <span className="w-6 text-center text-[13.5px] font-medium text-ink tnum">
              {value.guests}
            </span>
            <IconButton
              label={t.availability.oneGuestMore}
              disabled={value.guests >= 20}
              onClick={() => onChange({ ...value, guests: Math.min(20, value.guests + 1) })}
              icon={<Plus className="size-3.5" />}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            icon={<Search className="size-4" />}
            disabled={!valid}
            onClick={onApply}
          >
            {active ? t.availability.update : t.availability.search}
          </Button>
          {active ? (
            <Button variant="ghost" icon={<X className="size-4" />} onClick={onClear}>
              {t.common.clear}
            </Button>
          ) : null}
        </div>

        {valid ? (
          <span className="ml-auto self-center text-[12.5px] text-ink-3">
            {nightsLabel(nights)} · {formatDateRange(value.checkIn, dayjs(value.checkOut).subtract(1, "day").format("YYYY-MM-DD"))}
          </span>
        ) : null}
      </div>

      {active ? (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line bg-surface-2 px-4 py-2.5">
          <span className="text-[13px] text-ink">
            <span className="font-semibold tnum">{summary.available}</span> of{" "}
            <span className="tnum">{summary.total}</span> apartments free
          </span>

          {summary.cheapest !== null ? (
            <span className="text-[12.5px] text-ink-2">
              From{" "}
              <span className="font-medium text-ink tnum">
                {money(summary.cheapest, { cents: false })}
              </span>
              {summary.dearest !== null && summary.dearest !== summary.cheapest ? (
                <>
                  {" "}to{" "}
                  <span className="font-medium text-ink tnum">
                    {money(summary.dearest, { cents: false })}
                  </span>
                </>
              ) : null}{" "}
              for the stay
            </span>
          ) : (
            <span className="text-[12.5px] text-serious">
              Nothing free for these dates — try shifting them or reducing the party size.
            </span>
          )}

          <label className="ml-auto flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-2">
            <input
              type="checkbox"
              checked={onlyAvailable}
              onChange={(event) => onOnlyAvailableChange(event.target.checked)}
              className="size-3.5 cursor-pointer rounded border-line accent-[var(--brand)]"
            />
            {t.availability.onlyAvailable}
          </label>
        </div>
      ) : null}
    </div>
  );
}

function DateField({
  label,
  id,
  value,
  min,
  onChange,
}: {
  label: string;
  id: string;
  value: ISODate;
  min?: ISODate;
  onChange: (value: ISODate) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-wide text-ink-3"
      >
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-10 rounded-xl border border-line bg-surface px-3 text-[13.5px] text-ink",
          "transition-[border-color,box-shadow] hover:border-line-strong",
          "focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10",
        )}
      />
    </div>
  );
}
