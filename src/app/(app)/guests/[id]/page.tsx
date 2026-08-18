"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, CreditCard, FileText, Mail, MessageSquare, Phone, Plus,
  ShieldAlert, Star, Users,
} from "lucide-react";
import { formatDate, fullName, money, number, relativeTime } from "@/lib/format";
import { useT } from "@/i18n";
import {
  BOOKING_STATUS_META, INVOICE_STATUS_META, PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_META,
} from "@/lib/constants";
import {
  useAddNote, useBookings, useDocuments, useGuests, useInvoices, useNotes,
  usePayments, useUpdateGuest,
} from "@/data/queries";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar, EmptyState } from "@/components/ui/feedback";
import { Textarea } from "@/components/ui/field";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { fileSize } from "@/lib/format";
import type { BookingWithRelations } from "@/types/domain";

type Tab = "overview" | "bookings" | "invoices" | "payments" | "documents" | "notes";

export default function GuestProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const t = useT();
  const { id } = use(params);
  const router = useRouter();

  const { data: guests } = useGuests();
  const { data: bookings } = useBookings();
  const { data: invoices } = useInvoices();
  const { data: payments } = usePayments();
  const notes = useNotes("guest", id);
  const documents = useDocuments("guest", id);
  const updateGuest = useUpdateGuest();
  const addNote = useAddNote();

  const [tab, setTab] = useState<Tab>("overview");
  const [noteDraft, setNoteDraft] = useState("");

  const guest = guests.find((entry) => entry.id === id);

  const guestBookings = useMemo(
    () =>
      bookings
        .filter((booking) => booking.guest_id === id)
        .sort((a, b) => b.check_in.localeCompare(a.check_in)),
    [bookings, id],
  );

  const guestInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.guest_id === id),
    [invoices, id],
  );

  const guestPayments = useMemo(
    () => payments.filter((payment) => payment.guest_id === id),
    [payments, id],
  );

  const summary = useMemo(() => {
    const live = guestBookings.filter(
      (booking) => booking.status !== "cancelled" && booking.status !== "no_show",
    );
    return {
      stays: live.length,
      nights: live.reduce((acc, booking) => acc + booking.nights, 0),
      spend: live.reduce((acc, booking) => acc + booking.total, 0),
      balance: live.reduce((acc, booking) => acc + booking.balance, 0),
      cancellations: guestBookings.length - live.length,
      firstStay: live.length ? live[live.length - 1].check_in : null,
    };
  }, [guestBookings]);

  if (!guest) {
    return (
      <EmptyState
        icon={<Users />}
        title={t.guests.notFound}
        description={t.guests.profileDeleted}
        action={() => router.push("/guests")}
        actionLabel={t.guests.backToGuests}
      />
    );
  }

  const bookingColumns: Column<BookingWithRelations>[] = [
    {
      key: "reference",
      header: t.bookings.colBooking,
      sortValue: (row) => row.reference,
      cell: (row) => (
        <Link href={`/bookings?booking=${row.id}`} className="font-medium text-ink hover:underline">
          {row.reference}
        </Link>
      ),
    },
    {
      key: "apartment",
      header: t.change.apartment,
      sortValue: (row) => row.apartment.name,
      cell: (row) => <span className="text-ink">{row.apartment.name}</span>,
    },
    {
      key: "stay",
      header: t.bookings.colStay,
      sortValue: (row) => row.check_in,
      cell: (row) => (
        <span className="whitespace-nowrap text-ink tnum">
          {formatDate(row.check_in, "MMM D")} → {formatDate(row.check_out, "MMM D, YYYY")}
        </span>
      ),
    },
    {
      key: "nights",
      header: t.printReport.colNights,
      align: "right",
      sortValue: (row) => row.nights,
      cell: (row) => <span className="text-ink-2 tnum">{row.nights}</span>,
    },
    {
      key: "status",
      header: t.common.status,
      sortValue: (row) => row.status,
      cell: (row) => <StatusBadge size="sm" meta={BOOKING_STATUS_META[row.status]} />,
    },
    {
      key: "total",
      header: t.common.total,
      align: "right",
      sortValue: (row) => row.total,
      cell: (row) => <span className="font-medium text-ink tnum">{money(row.total)}</span>,
    },
    {
      key: "balance",
      header: t.bookings.colBalance,
      align: "right",
      sortValue: (row) => row.balance,
      cell: (row) => (
        <span className={row.balance > 0 ? "font-medium text-serious tnum" : "text-ink-3 tnum"}>
          {money(row.balance)}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={fullName(guest)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {guest.is_vip ? <Badge tone="brand">VIP</Badge> : null}
            {guest.is_blacklisted ? <Badge tone="critical">{t.guests.blacklisted}</Badge> : null}
            {guest.tags.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
            <span>{guest.nationality ?? "—"}</span>
          </span>
        }
        actions={
          <>
            <Button
              variant="ghost"
              icon={<ArrowLeft className="size-4" />}
              onClick={() => router.push("/guests")}
            >
              All guests
            </Button>
            <Button
              variant="outline"
              icon={<Star className="size-4" />}
              onClick={() =>
                updateGuest.mutate({ id: guest.id, patch: { is_vip: !guest.is_vip } })
              }
            >
              {guest.is_vip ? "Remove VIP" : "Mark VIP"}
            </Button>
            <Button
              variant="outline"
              icon={<ShieldAlert className="size-4" />}
              onClick={() =>
                updateGuest.mutate({
                  id: guest.id,
                  patch: { is_blacklisted: !guest.is_blacklisted },
                })
              }
            >
              {guest.is_blacklisted ? "Unblock" : "Blacklist"}
            </Button>
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={() => router.push("/bookings?new=1")}
            >
              {t.calendar.newBooking}
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card>
          <CardBody className="pt-6">
            <div className="flex items-center gap-3">
              <Avatar name={fullName(guest)} src={guest.avatar_url} size={56} />
              <div className="min-w-0">
                <p className="truncate text-[16px] font-semibold text-ink">{fullName(guest)}</p>
                <p className="text-[12.5px] text-ink-3">
                  Guest since {formatDate(guest.created_at, "MMM YYYY")}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-2.5">
              {guest.email ? (
                <a
                  href={`mailto:${guest.email}`}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] text-ink transition-colors hover:bg-surface-2"
                >
                  <Mail className="size-4 shrink-0 text-ink-3" aria-hidden />
                  <span className="truncate">{guest.email}</span>
                </a>
              ) : null}
              {guest.phone ? (
                <a
                  href={`tel:${guest.phone}`}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] text-ink transition-colors hover:bg-surface-2"
                >
                  <Phone className="size-4 shrink-0 text-ink-3" aria-hidden />
                  <span className="truncate tnum">{guest.phone}</span>
                </a>
              ) : null}
            </div>

            <dl className="mt-5 space-y-3 border-t border-line pt-4 text-[13px]">
              <Row label={t.guests.dateOfBirth} value={formatDate(guest.date_of_birth)} />
              <Row label={t.guests.idType} value={guest.id_type ?? "—"} />
              <Row label={t.guests.idNumber} value={guest.id_number ?? "—"} />
              <Row label={t.guests.idExpiry} value={formatDate(guest.id_expiry)} />
              <Row
                label={t.common.address}
                value={
                  [guest.address, guest.city, guest.country].filter(Boolean).join(", ") || "—"
                }
              />
              <Row label={t.guests.emergencyContact} value={guest.emergency_contact_name ?? "—"} />
              <Row label={t.guests.emergencyPhone} value={guest.emergency_contact_phone ?? "—"} />
            </dl>
          </CardBody>
        </Card>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <KpiCard label={t.guests.totalStays} value={number(summary.stays)} hint={t.guests.completedAndUpcoming} />
          <KpiCard label={t.apartments.nightsBooked} value={number(summary.nights)} />
          <KpiCard label={t.guests.lifetimeValue} value={money(summary.spend, { cents: false })} />
          <KpiCard label={t.invoices.outstanding} value={money(summary.balance, { cents: false })} hint={t.guests.acrossAllBookings} />
          <KpiCard label={t.guests.cancellations} value={number(summary.cancellations)} />
          <KpiCard
            label={t.guests.firstStay}
            value={summary.firstStay ? formatDate(summary.firstStay, "MMM YYYY") : "—"}
          />
        </div>
      </div>

      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "overview", label: t.common.overview },
          { value: "bookings", label: "Bookings", count: guestBookings.length },
          { value: "invoices", label: "Invoices", count: guestInvoices.length },
          { value: "payments", label: "Payments", count: guestPayments.length },
          { value: "documents", label: t.guests.documents, count: documents.length },
          { value: "notes", label: "Notes", count: notes.length },
        ]}
      />

      {tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title={t.guests.communicationTimeline} description={t.guests.bookingsPaymentsNotes} />
            <CardBody>
              <Timeline
                entries={[
                  ...guestBookings.map((booking) => ({
                    id: `b-${booking.id}`,
                    at: booking.created_at,
                    title: t.guests.bookingRef(booking.reference),
                    detail: `${booking.apartment.name} · ${formatDate(booking.check_in, "MMM D")} → ${formatDate(booking.check_out, "MMM D")}`,
                  })),
                  ...guestPayments.map((payment) => ({
                    id: `p-${payment.id}`,
                    at: payment.paid_at,
                    title: `Payment ${money(payment.amount)}`,
                    detail: PAYMENT_METHOD_LABELS[payment.method],
                  })),
                  ...notes.map((note) => ({
                    id: `n-${note.id}`,
                    at: note.created_at,
                    title: t.guests.noteAdded,
                    detail: note.body,
                  })),
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t.guests.preferencesAndNotes} />
            <CardBody>
              <p className="text-[13.5px] leading-relaxed text-ink-2">
                {guest.notes ?? t.ui.noPreferencesRecorded}
              </p>
              {guest.tags.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-4">
                  {guest.tags.map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </div>
              ) : null}
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === "bookings" ? (
        <DataTable
          rows={guestBookings}
          columns={bookingColumns}
          rowKey={(row) => row.id}
          onRowClick={(row) => router.push(`/bookings?booking=${row.id}`)}
          emptyTitle={t.apartments.noBookingsYet}
        />
      ) : null}

      {tab === "invoices" ? (
        guestInvoices.length === 0 ? (
          <EmptyState icon={<FileText />} title={t.bookings.noInvoices} description={t.guests.invoicesAppearHere} />
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {guestInvoices.map((invoice) => (
                <li key={invoice.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                  <FileText className="size-4 shrink-0 text-ink-3" aria-hidden />
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
                  <span className="text-[13px] font-medium text-ink tnum">{money(invoice.total)}</span>
                  <StatusBadge size="sm" meta={INVOICE_STATUS_META[invoice.status]} />
                </li>
              ))}
            </ul>
          </Card>
        )
      ) : null}

      {tab === "payments" ? (
        guestPayments.length === 0 ? (
          <EmptyState icon={<CreditCard />} title={t.guests.noPayments} description={t.guests.paymentsAppearHere} />
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {guestPayments.map((payment) => (
                <li key={payment.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                  <CreditCard className="size-4 shrink-0 text-ink-3" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-ink">{money(payment.amount)}</p>
                    <p className="text-[12px] text-ink-3">
                      {PAYMENT_METHOD_LABELS[payment.method]} · {formatDate(payment.paid_at)}
                      {payment.reference ? ` · ${payment.reference}` : ""}
                    </p>
                  </div>
                  <StatusBadge size="sm" meta={PAYMENT_STATUS_META[payment.status]} />
                </li>
              ))}
            </ul>
          </Card>
        )
      ) : null}

      {tab === "documents" ? (
        documents.length === 0 ? (
          <EmptyState
            icon={<FileText />}
            title={t.guests.noDocuments}
            description={t.guests.documentsStored}
          />
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {documents.map((document) => (
                <li key={document.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                  <FileText className="size-4 shrink-0 text-ink-3" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-ink">{document.name}</p>
                    <p className="text-[12px] text-ink-3">
                      {fileSize(document.size_bytes)} · uploaded {formatDate(document.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )
      ) : null}

      {tab === "notes" ? (
        <Card>
          <CardBody className="pt-6">
            <div className="flex items-start gap-2">
              <Textarea
                rows={2}
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                placeholder={t.guests.addNoteAboutGuest}
                aria-label={t.bookings.newNote}
              />
              <Button
                variant="primary"
                disabled={!noteDraft.trim()}
                onClick={() => {
                  addNote.mutate({ entity_type: "guest", entity_id: guest.id, body: noteDraft.trim() });
                  setNoteDraft("");
                }}
              >
                Add
              </Button>
            </div>

            {notes.length === 0 ? (
              <EmptyState compact icon={<MessageSquare />} title={t.guests.noNotesYet} />
            ) : (
              <ul className="mt-5 space-y-3">
                {notes.map((note) => (
                  <li key={note.id} className="rounded-xl border border-line p-3.5">
                    <p className="text-[13px] leading-relaxed text-ink">{note.body}</p>
                    <p className="mt-1.5 text-[11.5px] text-ink-3">
                      {note.author_name ?? "Team"} · {relativeTime(note.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-ink-3">{label}</dt>
      <dd className="min-w-0 text-right text-ink">{value}</dd>
    </div>
  );
}

function Timeline({
  entries,
}: {
  entries: { id: string; at: string; title: string; detail: string }[];
}) {
  const t = useT();
  const sorted = [...entries].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 30);

  if (sorted.length === 0) {
    return <EmptyState compact title={t.guests.nothingYet} description={t.guests.activityAppearHere} />;
  }

  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {sorted.map((entry) => (
        <li key={entry.id} className="relative">
          <span
            aria-hidden
            className="absolute -left-[23px] top-1.5 size-2 rounded-full bg-ink-3 ring-4 ring-[var(--surface)]"
          />
          <p className="text-[13px] font-medium text-ink">{entry.title}</p>
          <p className="text-[12.5px] text-ink-2">{entry.detail}</p>
          <p className="mt-0.5 text-[11.5px] text-ink-3">{relativeTime(entry.at)}</p>
        </li>
      ))}
    </ol>
  );
}
