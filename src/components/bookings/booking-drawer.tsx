"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Ban, BedDouble, Building2, Copy, CreditCard, FileText, LogIn, LogOut,
  Mail, MessageSquare, Phone, Pencil, Printer, Trash2, User,
} from "lucide-react";
import { dayjs } from "@/lib/date-range";
import {
  formatDate, formatDateTime, formatShortDate, formatTime, fullName, guestsLabel, humanize,
  money, nightsLabel, relativeTime,
} from "@/lib/format";
import { useT } from "@/i18n";
import {
  BOOKING_SOURCE_LABELS, BOOKING_STATUS_META, INVOICE_STATUS_META,
  PAYMENT_METHOD_LABELS, PAYMENT_STATUS_META,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  useActivity, useAddNote, useDeleteBooking, useDeletePayment, useInvoices, useNotes,
  usePayments, useUpdateBooking,
} from "@/data/queries";
import { Drawer, useConfirm } from "@/components/ui/overlay";
import { Button, IconButton } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { Avatar, EmptyState, Progress } from "@/components/ui/feedback";
import { Menu } from "@/components/ui/menu";
import { Textarea } from "@/components/ui/field";
import { PaymentDialog } from "@/components/payments/payment-dialog";
import type { BookingWithRelations } from "@/types/domain";

type Tab = "details" | "guest" | "payments" | "invoices" | "notes" | "timeline";

/**
 * Booking detail panel.
 *
 * Opened from the calendar, the bookings table and global search. Everything
 * about a reservation — money, guest, documents and history — is reachable
 * here without leaving the list behind it.
 */
export function BookingDrawer({
  booking,
  onClose,
  onEdit,
}: {
  booking: BookingWithRelations | null;
  onClose: () => void;
  onEdit: (booking: BookingWithRelations) => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("details");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  const { data: payments } = usePayments();
  const { data: invoices } = useInvoices();
  const notes = useNotes("booking", booking?.id);
  const activity = useActivity("booking", booking?.id);
  const updateBooking = useUpdateBooking();
  const deleteBooking = useDeleteBooking();
  const deletePayment = useDeletePayment();
  const addNote = useAddNote();
  const { confirm, dialog } = useConfirm();

  const bookingPayments = useMemo(
    () => payments.filter((payment) => payment.booking_id === booking?.id),
    [payments, booking?.id],
  );
  const bookingInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.booking_id === booking?.id),
    [invoices, booking?.id],
  );

  if (!booking) return <>{dialog}</>;

  const meta = BOOKING_STATUS_META[booking.status];
  const paidShare = booking.total ? booking.paid / booking.total : 0;

  const setStatus = async (status: BookingWithRelations["status"]) => {
    /*
     * Cancelling frees the dates immediately — the bar leaves the timeline and
     * the nights become bookable — so it gets a confirmation. Check-in and
     * check-out are routine, reversible, and done dozens of times a day; a
     * prompt on those would be noise.
     */
    if (status === "cancelled") {
      const ok = await confirm({
        title: t.bookings.cancelOne,
        message: t.bookings.cancelMessage(booking.reference, fullName(booking.guest), formatShortDate(booking.check_in), formatDate(booking.check_out), nightsLabel(booking.nights)),
        confirmLabel: t.bookings.cancelBooking,
        destructive: true,
      });
      if (!ok) return;
    }

    const patch: Partial<BookingWithRelations> = { status };
    if (status === "checked_in") patch.actual_check_in = new Date().toISOString();
    if (status === "checked_out") patch.actual_check_out = new Date().toISOString();
    if (status === "cancelled") patch.cancelled_at = new Date().toISOString();
    updateBooking.mutate({ id: booking.id, patch });
  };

  /*
   * Payments are the ledger the header totals are derived from, so removing one
   * moves the money on the booking — hence a confirmation that names the amount.
   * The snapshot is invalidated by the mutation, and `paid` / `balance` are
   * recomputed from the remaining payments, so nothing here needs patching by
   * hand.
   */
  const removePayment = async (payment: (typeof bookingPayments)[number]) => {
    const ok = await confirm({
      title: t.payments.removeConfirm,
      message: t.payments.removeMessage(money(payment.amount)),
      confirmLabel: t.payments.removePayment,
      destructive: true,
    });
    if (!ok) return;
    deletePayment.mutate(payment.id);
  };

  const remove = async () => {
    const ok = await confirm({
      title: t.bookings.deleteOne,
      message: t.bookings.deleteMessage(booking.reference, fullName(booking.guest)),
      confirmLabel: t.bookings.deleteBooking,
      destructive: true,
    });
    if (!ok) return;
    deleteBooking.mutate(booking.id);
    onClose();
  };

  return (
    <>
      <Drawer
        open={Boolean(booking)}
        onClose={onClose}
        width="lg"
        title={booking.reference}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge size="sm" meta={meta} />
            <span>
              {formatDate(booking.check_in, "MMM D")} → {formatDate(booking.check_out, "MMM D, YYYY")}
            </span>
            <span className="text-ink-3">·</span>
            <span>{nightsLabel(booking.nights)}</span>
          </span>
        }
        footer={
          <>
            <div className="flex items-center gap-2">
              {booking.status !== "checked_in" && booking.status !== "checked_out" ? (
                <Button
                  size="sm"
                  variant="primary"
                  icon={<LogIn className="size-4" />}
                  onClick={() => setStatus("checked_in")}
                >
                  {t.bookings.checkInAction}
                </Button>
              ) : null}
              {booking.status === "checked_in" ? (
                <Button
                  size="sm"
                  variant="outline"
                  icon={<LogOut className="size-4" />}
                  onClick={() => setStatus("checked_out")}
                >
                  {t.bookings.checkOutAction}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                icon={<CreditCard className="size-4" />}
                onClick={() => setPaymentOpen(true)}
              >
                {t.bookings.recordPayment}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <IconButton
                label={t.bookings.editBooking}
                onClick={() => onEdit(booking)}
                icon={<Pencil className="size-4" />}
              />
              <Menu
                align="end"
                trigger={({ toggle, ref }) => (
                  <Button ref={ref} size="sm" variant="ghost" onClick={toggle}>
                    {t.common.more}
                  </Button>
                )}
                items={[
                  {
                    label: t.bookings.printConfirmation,
                    icon: <Printer />,
                    onSelect: () => window.print(),
                  },
                  {
                    label: t.bookings.copyReference,
                    icon: <Copy />,
                    onSelect: () => navigator.clipboard?.writeText(booking.reference),
                  },
                  {
                    label: t.bookings.markCancelled,
                    icon: <Ban />,
                    separatorBefore: true,
                    disabled: booking.status === "cancelled",
                    onSelect: () => setStatus("cancelled"),
                  },
                  {
                    label: t.bookings.deleteBooking,
                    icon: <Trash2 />,
                    destructive: true,
                    onSelect: () => void remove(),
                  },
                ]}
              />
            </div>
          </>
        }
      >
        {/* --- Money summary ------------------------------------------ */}
        <div className="border-b border-line bg-surface-2 px-5 py-4 sm:px-6">
          <div className="grid grid-cols-3 gap-4">
            <Metric label={t.common.total} value={money(booking.total)} />
            <Metric label={t.bookings.paid} value={money(booking.paid)} tone="good" />
            <Metric
              label={t.bookings.colBalance}
              value={money(booking.balance)}
              tone={booking.balance > 0 ? "warning" : "muted"}
            />
          </div>
          <Progress
            className="mt-3"
            value={paidShare}
            tone={paidShare >= 1 ? "good" : paidShare > 0 ? "warning" : "critical"}
            label={t.bookings.shareCollected}
          />
        </div>

        <Tabs
          className="px-3 sm:px-4"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "details", label: t.bookings.tabDetails },
            { value: "guest", label: t.bookings.colGuest },
            { value: "payments", label: t.bookings.tabPayments, count: bookingPayments.length },
            { value: "invoices", label: t.bookings.tabInvoices, count: bookingInvoices.length },
            { value: "notes", label: t.bookings.tabNotes, count: notes.length },
            { value: "timeline", label: t.bookings.tabTimeline },
          ]}
        />

        <div className="px-5 py-5 sm:px-6">
          {tab === "details" ? (
            <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
              <Detail label={t.change.apartment} icon={<Building2 />}>
                <Link
                  href={`/apartments/${booking.apartment_id}`}
                  className="font-medium text-ink hover:underline"
                >
                  {booking.apartment.name}
                </Link>
                <span className="block text-[12px] text-ink-3">
                  {booking.apartment.code} · {booking.apartment.bedrooms} bed ·{" "}
                  {booking.apartment.bathrooms} bath
                </span>
              </Detail>
              <Detail label={t.availability.guests} icon={<BedDouble />}>
                {guestsLabel(booking.adults, booking.children)}
              </Detail>
              <Detail label={t.change.checkIn}>
                {formatDate(booking.check_in, "dddd, MMM D, YYYY")}
                <span className="block text-[12px] text-ink-3">
                  from {formatTime(booking.check_in_time)}
                  {booking.actual_check_in
                    ? ` · arrived ${formatDateTime(booking.actual_check_in)}`
                    : ""}
                </span>
              </Detail>
              <Detail label={t.change.checkOut}>
                {formatDate(booking.check_out, "dddd, MMM D, YYYY")}
                <span className="block text-[12px] text-ink-3">
                  by {formatTime(booking.check_out_time)}
                  {booking.actual_check_out
                    ? ` · departed ${formatDateTime(booking.actual_check_out)}`
                    : ""}
                </span>
              </Detail>
              <Detail label={t.bookings.colSource}>{BOOKING_SOURCE_LABELS[booking.source]}</Detail>
              <Detail label={t.bookings.booked}>{formatDate(booking.created_at)}</Detail>

              <div className="sm:col-span-2">
                <h4 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ink-3">
                  {t.bookings.priceBreakdown}
                </h4>
                <dl className="space-y-1.5 rounded-xl border border-line p-3.5 text-[13px]">
                  <PriceRow
                    label={`${booking.nights} × ${money(booking.nightly_rate)}`}
                    value={money(booking.subtotal)}
                  />
                  {booking.discount > 0 ? (
                    <PriceRow label={t.bookings.discount} value={`− ${money(booking.discount)}`} />
                  ) : null}
                  <PriceRow label={t.bookings.cleaningFee} value={money(booking.cleaning_fee)} />
                  {booking.extra_fees > 0 ? (
                    <PriceRow label={t.bookings.extraFees} value={money(booking.extra_fees)} />
                  ) : null}
                  <PriceRow label={t.bookings.tax} value={money(booking.tax)} />
                  {booking.commission > 0 ? (
                    <PriceRow
                      label={t.bookings.channelCommission(BOOKING_SOURCE_LABELS[booking.source])}
                      value={`− ${money(booking.commission)}`}
                      muted
                    />
                  ) : null}
                  <div className="flex items-center justify-between border-t border-line pt-2 text-[14px] font-semibold">
                    <dt className="text-ink">{t.common.total}</dt>
                    <dd className="text-ink tnum">{money(booking.total)}</dd>
                  </div>
                </dl>
              </div>

              {booking.notes ? (
                <div className="sm:col-span-2">
                  <h4 className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-ink-3">
                    {t.bookings.guestNotes}
                  </h4>
                  <p className="rounded-xl bg-surface-2 px-3.5 py-3 text-[13px] leading-relaxed text-ink-2">
                    {booking.notes}
                  </p>
                </div>
              ) : null}

              {booking.cancellation_reason ? (
                <div className="sm:col-span-2">
                  <h4 className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-ink-3">
                    Cancellation
                  </h4>
                  <p className="rounded-xl bg-critical-wash px-3.5 py-3 text-[13px] text-ink">
                    {booking.cancellation_reason}
                    {booking.cancelled_at
                      ? ` · ${formatDate(booking.cancelled_at)}`
                      : ""}
                  </p>
                </div>
              ) : null}
            </dl>
          ) : null}

          {tab === "guest" ? (
            <div>
              <div className="flex items-center gap-3">
                <Avatar name={fullName(booking.guest)} size={48} />
                <div className="min-w-0">
                  <Link
                    href={`/guests/${booking.guest_id}`}
                    className="text-[15px] font-semibold text-ink hover:underline"
                  >
                    {fullName(booking.guest)}
                  </Link>
                  <p className="text-[13px] text-ink-2">
                    {booking.guest.nationality ?? "—"}
                    {booking.guest.is_vip ? " · VIP" : ""}
                  </p>
                </div>
              </div>

              <dl className="mt-5 grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
                <Detail label={t.common.email} icon={<Mail />}>
                  {booking.guest.email ? (
                    <a href={`mailto:${booking.guest.email}`} className="text-ink hover:underline">
                      {booking.guest.email}
                    </a>
                  ) : "—"}
                </Detail>
                <Detail label={t.common.phone} icon={<Phone />}>
                  {booking.guest.phone ? (
                    <a href={`tel:${booking.guest.phone}`} className="text-ink hover:underline">
                      {booking.guest.phone}
                    </a>
                  ) : "—"}
                </Detail>
                <Detail label={t.bookings.idDocument} icon={<User />}>
                  {booking.guest.id_type ?? "—"}
                  {booking.guest.id_number ? ` · ${booking.guest.id_number}` : ""}
                </Detail>
                <Detail label={t.bookings.idExpiry}>{formatDate(booking.guest.id_expiry)}</Detail>
                <Detail label={t.common.address}>
                  {[booking.guest.address, booking.guest.city, booking.guest.country]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </Detail>
                <Detail label={t.bookings.emergencyContact}>
                  {booking.guest.emergency_contact_name ?? "—"}
                  {booking.guest.emergency_contact_phone
                    ? ` · ${booking.guest.emergency_contact_phone}`
                    : ""}
                </Detail>
              </dl>
            </div>
          ) : null}

          {tab === "payments" ? (
            bookingPayments.length === 0 ? (
              <EmptyState
                compact
                icon={<CreditCard />}
                title={t.bookings.noPayments}
                description={t.bookings.recordDeposit}
                action={() => setPaymentOpen(true)}
                actionLabel={t.payments.recordPayment}
              />
            ) : (
              <ul className="divide-y divide-line">
                {bookingPayments.map((payment) => (
                  <li key={payment.id} className="flex items-center gap-3 py-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-3 text-ink-2">
                      <CreditCard className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium text-ink">
                        {money(payment.amount)}
                        <span className="ml-2 font-normal text-ink-2">
                          {PAYMENT_METHOD_LABELS[payment.method]}
                        </span>
                      </p>
                      <p className="text-[12px] text-ink-3">
                        {payment.receipt_number ? `${payment.receipt_number} · ` : ""}
                        {formatDate(payment.paid_at)}
                        {payment.reference ? ` · ${payment.reference}` : ""}
                        {payment.note ? ` · ${payment.note}` : ""}
                      </p>
                    </div>
                    <StatusBadge size="sm" meta={PAYMENT_STATUS_META[payment.status]} />
                    <IconButton
                      label={t.payments.removePayment}
                      icon={<Trash2 className="size-3.5" />}
                      disabled={deletePayment.isPending}
                      onClick={() => void removePayment(payment)}
                      className="text-ink-3 hover:text-critical"
                    />
                  </li>
                ))}
              </ul>
            )
          ) : null}

          {tab === "invoices" ? (
            bookingInvoices.length === 0 ? (
              <EmptyState
                compact
                icon={<FileText />}
                title={t.bookings.noInvoices}
                description={t.bookings.noInvoice}
              />
            ) : (
              <ul className="divide-y divide-line">
                {bookingInvoices.map((invoice) => (
                  <li key={invoice.id} className="flex items-center gap-3 py-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-3 text-ink-2">
                      <FileText className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/invoices?invoice=${invoice.id}`}
                        className="text-[13.5px] font-medium text-ink hover:underline"
                      >
                        {invoice.number}
                      </Link>
                      <p className="text-[12px] text-ink-3">
                        Issued {formatDate(invoice.issue_date)} · due {formatDate(invoice.due_date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-medium text-ink tnum">{money(invoice.total)}</p>
                      <StatusBadge size="sm" meta={INVOICE_STATUS_META[invoice.status]} />
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : null}

          {tab === "notes" ? (
            <div>
              <div className="flex items-start gap-2">
                <Textarea
                  rows={2}
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder={t.bookings.addNote}
                  aria-label={t.bookings.newNote}
                />
                <Button
                  variant="primary"
                  disabled={!noteDraft.trim()}
                  onClick={() => {
                    addNote.mutate({
                      entity_type: "booking",
                      entity_id: booking.id,
                      body: noteDraft.trim(),
                    });
                    setNoteDraft("");
                  }}
                >
                  Add
                </Button>
              </div>

              {notes.length === 0 ? (
                <EmptyState
                  compact
                  icon={<MessageSquare />}
                  title={t.bookings.noNotes}
                  description={t.bookings.notesTeamOnly}
                />
              ) : (
                <ul className="mt-4 space-y-3">
                  {notes.map((note) => (
                    <li key={note.id} className="rounded-xl border border-line p-3.5">
                      <p className="text-[13px] leading-relaxed text-ink">{note.body}</p>
                      <p className="mt-1.5 text-[11.5px] text-ink-3">
                        {note.author_name ?? t.bookings.team} · {relativeTime(note.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {tab === "timeline" ? (
            activity.length === 0 ? (
              <EmptyState compact title={t.bookings.noActivity} description={t.bookings.changesAppearHere} />
            ) : (
              <ol className="relative space-y-4 border-l border-line pl-5">
                {activity.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span
                      aria-hidden
                      className="absolute -left-[23px] top-1.5 size-2 rounded-full bg-ink-3 ring-4 ring-[var(--surface)]"
                    />
                    <p className="text-[13px] font-medium text-ink">{humanize(entry.action)}</p>
                    <p className="text-[12px] text-ink-3">
                      {entry.actor_name ?? t.bookings.system} ·{" "}
                      {dayjs(entry.created_at).format("MMM D, YYYY · HH:mm")}
                    </p>
                  </li>
                ))}
              </ol>
            )
          ) : null}
        </div>
      </Drawer>

      <PaymentDialog
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        booking={booking}
      />
      {dialog}
    </>
  );
}

/* ------------------------------------------------------------------ */

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "warning" | "muted";
}) {
  const tones = {
    default: "text-ink",
    good: "text-delta-up",
    warning: "text-serious",
    muted: "text-ink-2",
  } as const;
  return (
    <div>
      <p className="text-[11.5px] font-medium uppercase tracking-wide text-ink-3">{label}</p>
      <p className={cn("mt-0.5 text-[17px] font-semibold tracking-[-0.02em]", tones[tone])}>
        {value}
      </p>
    </div>
  );
}

function Detail({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-wide text-ink-3">
        {icon ? <span className="[&>svg]:size-3.5">{icon}</span> : null}
        {label}
      </dt>
      <dd className="mt-0.5 text-[13.5px] text-ink">{children}</dd>
    </div>
  );
}

function PriceRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={muted ? "text-ink-3" : "text-ink-2"}>{label}</dt>
      <dd className={cn("tnum", muted ? "text-ink-3" : "text-ink")}>{value}</dd>
    </div>
  );
}
