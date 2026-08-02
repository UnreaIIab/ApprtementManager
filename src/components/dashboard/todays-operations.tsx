"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, BedDouble, CalendarClock, LogIn, LogOut, Sparkles, Wrench,
} from "lucide-react";
import { dayjs, toISODate } from "@/lib/date-range";
import { formatDate, formatShortDate, formatTime, fullName, money } from "@/lib/format";
import { strings, useT } from "@/i18n";
import { BOOKING_STATUS_META, TASK_STATUS_META } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useBookings, useTasks, useUpdateBooking } from "@/data/queries";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Avatar, EmptyState } from "@/components/ui/feedback";
import type { BookingWithRelations, TaskWithRelations } from "@/types/domain";

type OpsTab =
  | "arrivals"
  | "departures"
  | "in_house"
  | "upcoming"
  | "cleaning"
  | "maintenance";

/**
 * Today's operations.
 *
 * The front-desk view: who is arriving, who is leaving, who is still in house,
 * and what housekeeping and maintenance owe today. Deliberately *not* scoped by
 * the global date filter — "today" is an operational fact, not a reporting
 * window, and staff working the desk need it regardless of which period the
 * dashboard's financials are showing.
 */
export function TodaysOperations() {
  const t = useT();
  const { data: bookings } = useBookings();
  const { data: tasks } = useTasks();
  const [tab, setTab] = useState<OpsTab>("arrivals");
  const updateBooking = useUpdateBooking();

  const today = toISODate(dayjs());
  const horizon = toISODate(dayjs().add(7, "day"));

  const groups = useMemo(() => {
    const live = bookings.filter(
      (booking) => booking.status !== "cancelled" && booking.status !== "no_show",
    );
    return {
      arrivals: live
        .filter((booking) => booking.check_in === today)
        .sort((a, b) => (a.check_in_time ?? "").localeCompare(b.check_in_time ?? "")),
      departures: live
        .filter((booking) => booking.check_out === today)
        .sort((a, b) => (a.check_out_time ?? "").localeCompare(b.check_out_time ?? "")),
      in_house: live
        .filter((booking) => booking.check_in < today && booking.check_out > today)
        .sort((a, b) => a.check_out.localeCompare(b.check_out)),
      upcoming: live
        .filter((booking) => booking.check_in > today && booking.check_in <= horizon)
        .sort((a, b) => a.check_in.localeCompare(b.check_in)),
    };
  }, [bookings, today, horizon]);

  const openTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.status !== "done" && task.status !== "cancelled")
        .filter((task) => !task.due_date || task.due_date <= horizon)
        .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")),
    [tasks, horizon],
  );

  const cleaning = openTasks.filter((task) => task.type === "cleaning");
  const maintenance = openTasks.filter((task) => task.type === "maintenance");

  // A departure that has already been checked out no longer needs action.
  const lateCheckouts = groups.departures.filter(
    (booking) => booking.status === "checked_in",
  );

  return (
    <Card className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
            Today&apos;s operations
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-2">
            {formatDate(today, strings().format.dateWeekdayLong)}
            {lateCheckouts.length > 0 ? (
              <span className="ml-2 inline-flex items-center gap-1 text-serious">
                <AlertTriangle className="size-3.5" aria-hidden />
                {lateCheckouts.length} not yet checked out
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <Tabs
        className="mt-3 px-3 sm:px-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "arrivals", label: t.operations.checkIns, count: groups.arrivals.length, icon: <LogIn /> },
          { value: "departures", label: t.operations.checkOuts, count: groups.departures.length, icon: <LogOut /> },
          { value: "in_house", label: t.operations.inHouse, count: groups.in_house.length, icon: <BedDouble /> },
          { value: "upcoming", label: t.operations.next7Days, count: groups.upcoming.length, icon: <CalendarClock /> },
          { value: "cleaning", label: t.operations.cleaning, count: cleaning.length, icon: <Sparkles /> },
          { value: "maintenance", label: t.operations.maintenance, count: maintenance.length, icon: <Wrench /> },
        ]}
      />

      <div className="max-h-[420px] min-h-[220px] overflow-y-auto">
        {tab === "cleaning" || tab === "maintenance" ? (
          <TaskList tasks={tab === "cleaning" ? cleaning : maintenance} kind={tab} />
        ) : (
          <BookingList
            bookings={groups[tab]}
            kind={tab}
            onCheckIn={(booking) =>
              updateBooking.mutate({
                id: booking.id,
                patch: { status: "checked_in", actual_check_in: new Date().toISOString() },
              })
            }
            onCheckOut={(booking) =>
              updateBooking.mutate({
                id: booking.id,
                patch: { status: "checked_out", actual_check_out: new Date().toISOString() },
              })
            }
          />
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function BookingList({
  bookings,
  kind,
  onCheckIn,
  onCheckOut,
}: {
  bookings: BookingWithRelations[];
  kind: "arrivals" | "departures" | "in_house" | "upcoming";
  onCheckIn: (booking: BookingWithRelations) => void;
  onCheckOut: (booking: BookingWithRelations) => void;
}) {
  const t = useT();
  const empty = {
    arrivals: { title: t.operations.noArrivals, description: t.operations.noArrivalsHint },
    departures: { title: t.operations.noDepartures, description: t.operations.noDeparturesHint },
    in_house: { title: t.operations.noGuests, description: t.operations.noGuestsHint },
    upcoming: { title: t.operations.nothingNext7, description: t.operations.nothingNext7Hint },
  }[kind];

  if (bookings.length === 0) {
    return <EmptyState compact icon={<CalendarClock />} {...empty} />;
  }

  return (
    <ul className="divide-y divide-line">
      {bookings.map((booking) => {
        const guestName = fullName(booking.guest);
        const time =
          kind === "departures"
            ? formatTime(booking.check_out_time)
            : formatTime(booking.check_in_time);

        return (
          <li key={booking.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
            <Avatar name={guestName} size={36} />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link
                  href={`/bookings?booking=${booking.id}`}
                  className="truncate text-[13.5px] font-medium text-ink hover:underline"
                >
                  {guestName}
                </Link>
                {booking.guest.is_vip ? (
                  <span className="rounded-full bg-brand-wash px-1.5 py-px text-[10px] font-semibold text-brand">
                    VIP
                  </span>
                ) : null}
                <StatusBadge size="sm" meta={BOOKING_STATUS_META[booking.status]} />
              </div>
              <p className="mt-0.5 truncate text-[12.5px] text-ink-2">
                {booking.apartment.name} · {booking.apartment.code} ·{" "}
                {kind === "upcoming"
                  ? formatDate(booking.check_in, strings().format.dateWeekdayShort)
                  : `${booking.nights}n`}
                {booking.balance > 0 ? (
                  <span className="ml-1.5 text-serious">· {money(booking.balance)} due</span>
                ) : null}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[13px] font-medium text-ink-2 tnum">{time}</span>
              {kind === "arrivals" && booking.status !== "checked_in" ? (
                <Button size="sm" variant="primary" onClick={() => onCheckIn(booking)}>
                  Check in
                </Button>
              ) : null}
              {kind === "departures" && booking.status === "checked_in" ? (
                <Button size="sm" variant="outline" onClick={() => onCheckOut(booking)}>
                  Check out
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */

function TaskList({ tasks, kind }: { tasks: TaskWithRelations[]; kind: "cleaning" | "maintenance" }) {
  const t = useT();
  if (tasks.length === 0) {
    return (
      <EmptyState
        compact
        icon={kind === "cleaning" ? <Sparkles /> : <Wrench />}
        title={kind === "cleaning" ? t.operations.noCleaning : t.operations.noMaintenance}
        description={t.operations.nothingNeedsAttention}
      />
    );
  }

  const today = toISODate(dayjs());

  return (
    <ul className="divide-y divide-line">
      {tasks.map((task) => {
        const overdue = Boolean(task.due_date && task.due_date < today);
        return (
          <li key={task.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-xl",
                kind === "cleaning" ? "bg-warning-wash text-warning" : "bg-serious-wash text-serious",
              )}
              aria-hidden
            >
              {kind === "cleaning" ? <Sparkles className="size-4" /> : <Wrench className="size-4" />}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium text-ink">{task.title}</p>
              <p className="mt-0.5 truncate text-[12.5px] text-ink-2">
                {task.apartment?.name ?? t.operations.unassigned}
                {task.assignee ? ` · ${task.assignee}` : ""}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  "text-[12.5px] tnum",
                  overdue ? "font-medium text-critical" : "text-ink-2",
                )}
              >
                {task.due_date ? formatShortDate(task.due_date) : "—"}
              </span>
              <StatusBadge size="sm" meta={TASK_STATUS_META[task.status]} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
