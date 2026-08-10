"use client";

import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Plus } from "lucide-react";
import { bookingSchema, type BookingFormValues } from "@/lib/schemas";
import { lengthOfStayDiscount, quoteStay } from "@/lib/pricing";
import { dayjs, staysOverlap, toISODate } from "@/lib/date-range";
import { fullName, money } from "@/lib/format";
import { useT } from "@/i18n";
import {
  BOOKING_SOURCE_LABELS,
  BOOKING_STATUS_META,
} from "@/lib/constants";
import { BOOKING_SOURCES, BOOKING_STATUSES } from "@/types/domain";
import {
  useApartments,
  useBlocks,
  useBookings,
  useCreateBooking,
  useGuests,
  useOrganization,
  useUpdateBooking,
} from "@/data/queries";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import { Drawer } from "@/components/ui/overlay";
import { GuestQuickAdd } from "@/components/guests/guest-quick-add";
import { currencySymbol } from "@/lib/format";
import type { BookingWithRelations } from "@/types/domain";

/**
 * Create / edit a reservation.
 *
 * Pricing is derived live from the apartment's rate card and the stay length —
 * the same rules the seeded data follows — and availability is checked against
 * both existing stays and calendar blocks before submit, so an overbooking is
 * caught in the form rather than bouncing off the database constraint.
 */
export function BookingFormDrawer({
  open,
  onClose,
  booking,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  /** Present when editing; omitted when creating. */
  booking?: BookingWithRelations | null;
  defaults?: { apartment_id?: string; check_in?: string; check_out?: string };
}) {
  const t = useT();
  const { data: apartments } = useApartments();
  const { data: guests } = useGuests();
  const { data: bookings } = useBookings();
  const { data: blocks } = useBlocks();
  const organization = useOrganization();
  const createBooking = useCreateBooking();
  const updateBooking = useUpdateBooking();
  const [guestAddOpen, setGuestAddOpen] = useState(false);

  const symbol = currencySymbol(organization?.currency);
  const editing = Boolean(booking);

  const emptyValues = useMemo<BookingFormValues>(() => {
    const apartment =
      apartments.find((a) => a.id === defaults?.apartment_id) ?? apartments[0];
    const checkIn = defaults?.check_in ?? toISODate(dayjs());
    const checkOut =
      defaults?.check_out ?? toISODate(dayjs(checkIn).add(apartment?.min_nights ?? 2, "day"));
    return {
      apartment_id: apartment?.id ?? "",
      guest_id: guests[0]?.id ?? "",
      check_in: checkIn,
      check_out: checkOut,
      check_in_time: "15:00",
      check_out_time: "11:00",
      adults: 2,
      children: 0,
      status: "confirmed",
      source: "direct",
      nightly_rate: apartment?.nightly_rate ?? 0,
      cleaning_fee: apartment?.cleaning_fee ?? 0,
      extra_fees: 0,
      discount: 0,
      notes: "",
      internal_notes: "",
    };
  }, [apartments, guests, defaults]);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: emptyValues,
  });

  // Re-seed whenever the drawer opens for a different record.
  useEffect(() => {
    if (!open) return;
    reset(
      booking
        ? {
            apartment_id: booking.apartment_id,
            guest_id: booking.guest_id,
            check_in: booking.check_in,
            check_out: booking.check_out,
            check_in_time: booking.check_in_time ?? "15:00",
            check_out_time: booking.check_out_time ?? "11:00",
            adults: booking.adults,
            children: booking.children,
            status: booking.status,
            source: booking.source,
            nightly_rate: booking.nightly_rate,
            cleaning_fee: booking.cleaning_fee,
            extra_fees: booking.extra_fees,
            discount: booking.discount,
            notes: booking.notes ?? "",
            internal_notes: booking.internal_notes ?? "",
          }
        : emptyValues,
    );
  }, [open, booking, emptyValues, reset]);

  // `useWatch` subscribes to the field store instead of reading it during
  // render, which keeps the component compilable by the React Compiler. It
  // returns a deep-partial, so the fields the pricing and conflict checks need
  // are normalised once here.
  const watched = useWatch({ control });
  const values = {
    apartment_id: watched.apartment_id ?? "",
    check_in: watched.check_in ?? "",
    check_out: watched.check_out ?? "",
    adults: watched.adults ?? 0,
    children: watched.children ?? 0,
    nightly_rate: watched.nightly_rate ?? 0,
    cleaning_fee: watched.cleaning_fee ?? 0,
    extra_fees: watched.extra_fees ?? 0,
    discount: watched.discount ?? 0,
  };
  const apartment = apartments.find((a) => a.id === values.apartment_id);

  const nights = Math.max(
    0,
    dayjs(values.check_out).diff(dayjs(values.check_in), "day"),
  );

  // Switching apartment adopts its rate card unless the user is editing an
  // existing booking, where the agreed price should stand.
  useEffect(() => {
    if (editing || !apartment) return;
    setValue("nightly_rate", apartment.nightly_rate);
    setValue("cleaning_fee", apartment.cleaning_fee);
  }, [apartment, editing, setValue]);

  // Apply the length-of-stay discount automatically on new bookings; the field
  // stays editable so a negotiated rate can override it.
  useEffect(() => {
    if (editing || !apartment || nights <= 0) return;
    const pct = lengthOfStayDiscount(apartment, nights);
    const subtotal = (apartment.nightly_rate || 0) * nights;
    setValue("discount", Math.round((subtotal * pct) / 100));
  }, [apartment, editing, nights, setValue]);

  // Priced through the shared rate card so a stay booked from a calendar
  // opening costs exactly what the availability search quoted for it.
  const totals = useMemo(() => {
    if (!apartment) {
      return { subtotal: 0, tax: 0, total: 0, discountPct: 0 };
    }
    const quote = quoteStay(apartment, nights, organization?.tax_rate ?? 0, {
      nightlyRate: values.nightly_rate || 0,
      extraFees: values.extra_fees || 0,
      discountOverride: values.discount || 0,
    });
    return {
      subtotal: quote.subtotal,
      tax: quote.tax,
      total: quote.total,
      discountPct: lengthOfStayDiscount(apartment, nights),
    };
  }, [apartment, nights, organization, values.nightly_rate, values.extra_fees, values.discount]);

  /** Availability check mirroring the DB exclusion constraint. */
  const conflict = useMemo(() => {
    const { apartment_id: apartmentId, check_in: checkIn, check_out: checkOut } = values;
    if (!apartmentId || !checkIn || !checkOut) return null;
    if (checkOut <= checkIn) return null;

    const clash = bookings.find(
      (other) =>
        other.apartment_id === apartmentId &&
        other.id !== booking?.id &&
        other.status !== "cancelled" &&
        other.status !== "no_show" &&
        staysOverlap(checkIn, checkOut, other.check_in, other.check_out),
    );
    if (clash) {
      return `Overlaps ${clash.reference} — ${fullName(clash.guest)}, ${clash.check_in} to ${clash.check_out}.`;
    }

    const blocked = blocks.find(
      (block) =>
        block.apartment_id === apartmentId &&
        staysOverlap(checkIn, checkOut, block.start_date, block.end_date),
    );
    if (blocked) {
      return t.bookings.datesBlocked(blocked.reason.replace(/_/g, " "));
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.apartment_id, values.check_in, values.check_out, bookings, blocks, booking?.id]);

  const capacityExceeded =
    apartment && values.adults + values.children > apartment.capacity;

  const onSubmit = handleSubmit(async (formValues) => {
    if (conflict) return;

    const commission =
      formValues.source === "airbnb"
        ? 0.15
        : formValues.source === "booking_com"
          ? 0.17
          : formValues.source === "expedia"
            ? 0.18
            : formValues.source === "vrbo"
              ? 0.14
              : 0;

    // Optional form fields arrive as `undefined`; the domain model uses `null`.
    const payload = {
      ...formValues,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      commission: Math.round(totals.total * commission),
      check_in_time: formValues.check_in_time || null,
      check_out_time: formValues.check_out_time || null,
      notes: formValues.notes || null,
      internal_notes: formValues.internal_notes || null,
    };

    if (booking) {
      await updateBooking.mutateAsync({ id: booking.id, patch: payload });
    } else {
      // No reference here: the database assigns it on insert. Deriving one
      // from the loaded list produced duplicates, because that list is only an
      // 18-month window and two people can compute the same number at once.
      await createBooking.mutateAsync({
        ...payload,
        actual_check_in: null,
        actual_check_out: null,
        cancelled_at: null,
        cancellation_reason: null,
      });
    }
    onClose();
  });

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width="lg"
        title={editing ? t.bookings.edit(booking!.reference) : t.bookings.newBooking}
        subtitle={
          nights > 0
            ? `${nights} ${nights === 1 ? "night" : "nights"} · ${money(totals.total)} total`
            : t.bookings.chooseDates
        }
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button
              variant="primary"
              onClick={onSubmit}
              loading={isSubmitting}
              disabled={Boolean(conflict) || nights <= 0}
            >
              {editing ? t.common.saveChanges : t.bookings.createBooking}
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-5 px-5 py-5 sm:px-6">
          {conflict ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-critical/30 bg-critical-wash px-3.5 py-3"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden />
              <div>
                <p className="text-[13px] font-medium text-ink">{t.bookings.datesUnavailable}</p>
                <p className="mt-0.5 text-[12.5px] text-ink-2">{conflict}</p>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.change.apartment} required error={errors.apartment_id?.message} htmlFor="apartment_id">
              <Select id="apartment_id" {...register("apartment_id")}>
                {apartments.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} · {option.code}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label={t.bookings.colGuest}
              required
              error={errors.guest_id?.message}
              htmlFor="guest_id"
              hint={
                <button
                  type="button"
                  onClick={() => setGuestAddOpen(true)}
                  className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                >
                  <Plus className="size-3" aria-hidden /> Add a new guest
                </button>
              }
            >
              <Select id="guest_id" {...register("guest_id")}>
                {guests.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.first_name} {option.last_name}
                    {option.email ? ` · ${option.email}` : ""}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={t.change.checkIn} required error={errors.check_in?.message} htmlFor="check_in">
              <Input id="check_in" type="date" {...register("check_in")} />
            </Field>

            <Field label={t.change.checkOut} required error={errors.check_out?.message} htmlFor="check_out">
              <Input id="check_out" type="date" {...register("check_out")} />
            </Field>

            <Field label={t.bookings.arrivalTime} htmlFor="check_in_time">
              <Input id="check_in_time" type="time" {...register("check_in_time")} />
            </Field>

            <Field label={t.bookings.departureTime} htmlFor="check_out_time">
              <Input id="check_out_time" type="time" {...register("check_out_time")} />
            </Field>

            <Field
              label={t.bookings.adults}
              required
              error={errors.adults?.message}
              htmlFor="adults"
              hint={apartment ? t.bookings.sleepsUpTo(apartment.capacity) : undefined}
            >
              <Input id="adults" type="number" min={1} {...register("adults", { valueAsNumber: true })} />
            </Field>

            <Field
              label={t.bookings.children}
              error={errors.children?.message}
              htmlFor="children"
              hint={capacityExceeded ? undefined : " "}
            >
              <Input id="children" type="number" min={0} {...register("children", { valueAsNumber: true })} />
            </Field>
          </div>

          {capacityExceeded ? (
            <p role="alert" className="-mt-2 text-[12.5px] font-medium text-serious">
              {values.adults + values.children} guests exceeds this apartment&apos;s capacity of{" "}
              {apartment!.capacity}.
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.common.status} htmlFor="status">
              <Select id="status" {...register("status")}>
                {BOOKING_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {BOOKING_STATUS_META[option].label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={t.bookings.colSource} htmlFor="source">
              <Select id="source" {...register("source")}>
                {BOOKING_SOURCES.map((option) => (
                  <option key={option} value={option}>
                    {BOOKING_SOURCE_LABELS[option]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {/* --- Pricing ------------------------------------------------ */}
          <fieldset className="rounded-xl border border-line p-4">
            <legend className="px-1.5 text-[12px] font-medium uppercase tracking-wide text-ink-3">
              Pricing
            </legend>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.bookings.nightlyRate} error={errors.nightly_rate?.message}>
                <Controller
                  control={control}
                  name="nightly_rate"
                  render={({ field }) => (
                    <MoneyInput
                      symbol={symbol}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
              </Field>

              <Field label={t.bookings.cleaningFee} error={errors.cleaning_fee?.message}>
                <Controller
                  control={control}
                  name="cleaning_fee"
                  render={({ field }) => (
                    <MoneyInput
                      symbol={symbol}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
              </Field>

              <Field label={t.bookings.extraFees} error={errors.extra_fees?.message}>
                <Controller
                  control={control}
                  name="extra_fees"
                  render={({ field }) => (
                    <MoneyInput
                      symbol={symbol}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
              </Field>

              <Field label={t.bookings.discount} error={errors.discount?.message}>
                <Controller
                  control={control}
                  name="discount"
                  render={({ field }) => (
                    <MoneyInput
                      symbol={symbol}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
              </Field>
            </div>

            <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-[13px]">
              <Row label={`${nights} × ${money(values.nightly_rate || 0)}`} value={money(totals.subtotal)} />
              {values.discount ? (
                <Row
                  label={
                    totals.discountPct > 0
                      ? t.bookings.discountLos(totals.discountPct)
                      : "Discount"
                  }
                  value={`− ${money(values.discount)}`}
                />
              ) : null}
              <Row label={t.bookings.cleaningFee} value={money(values.cleaning_fee || 0)} />
              {values.extra_fees ? (
                <Row label={t.bookings.extraFees} value={money(values.extra_fees)} />
              ) : null}
              <Row label={t.bookings.taxAt(organization?.tax_rate ?? 0)} value={money(totals.tax)} />
              <div className="flex items-center justify-between border-t border-line pt-2 text-[15px] font-semibold">
                <dt className="text-ink">{t.common.total}</dt>
                <dd className="text-ink tnum">{money(totals.total)}</dd>
              </div>
            </dl>
          </fieldset>

          <Field label={t.bookings.guestNotes} htmlFor="notes">
            <Textarea id="notes" placeholder={t.bookings.requestsArrival} {...register("notes")} />
          </Field>

          <Field label={t.bookings.internalNotes} hint={t.bookings.onlyYourTeam} htmlFor="internal_notes">
            <Textarea id="internal_notes" rows={2} {...register("internal_notes")} />
          </Field>
        </form>
      </Drawer>

      <GuestQuickAdd
        open={guestAddOpen}
        onClose={() => setGuestAddOpen(false)}
        onCreated={(guest) => setValue("guest_id", guest.id)}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-2">{label}</dt>
      <dd className="text-ink tnum">{value}</dd>
    </div>
  );
}
