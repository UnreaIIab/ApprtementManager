"use client";

import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { paymentSchema, type PaymentFormValues } from "@/lib/schemas";
import { useT } from "@/i18n";
import { PAYMENT_METHODS, PAYMENT_STATUSES } from "@/types/domain";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_META } from "@/lib/constants";
import { currencySymbol, fullName, money } from "@/lib/format";
import { toISODate, dayjs } from "@/lib/date-range";
import { useBookings, useCreatePayment, useInvoices, useOrganization } from "@/data/queries";
import { Dialog } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import type { BookingWithRelations } from "@/types/domain";

/**
 * Record a payment.
 *
 * Defaults to the outstanding balance of whatever it was opened from, which is
 * the amount being collected the overwhelming majority of the time.
 */
export function PaymentDialog({
  open,
  onClose,
  booking,
  invoiceId,
}: {
  open: boolean;
  onClose: () => void;
  booking?: BookingWithRelations | null;
  invoiceId?: string;
}) {
  const t = useT();
  const { data: bookings } = useBookings();
  const { data: invoices } = useInvoices();
  const organization = useOrganization();
  const createPayment = useCreatePayment();

  const symbol = currencySymbol(organization?.currency);
  const invoice = invoiceId ? invoices.find((entry) => entry.id === invoiceId) : undefined;
  const target = booking ?? (invoice?.booking_id ? bookings.find((b) => b.id === invoice.booking_id) : undefined);

  const defaults = useMemo<PaymentFormValues>(
    () => ({
      booking_id: target?.id ?? "",
      invoice_id: invoice?.id ?? "",
      amount: Math.max(0, invoice?.balance ?? target?.balance ?? 0),
      method: "credit_card",
      status: "paid",
      paid_at: toISODate(dayjs()),
      reference: "",
      note: "",
    }),
    [target, invoice],
  );

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (open) reset(defaults);
  }, [open, defaults, reset]);

  const onSubmit = handleSubmit(async (values) => {
    await createPayment.mutateAsync({
      booking_id: values.booking_id || null,
      invoice_id: values.invoice_id || null,
      guest_id: target?.guest_id ?? null,
      amount: values.amount,
      method: values.method,
      status: values.status,
      paid_at: new Date(values.paid_at).toISOString(),
      reference: values.reference || null,
      note: values.note || null,
    });
    onClose();
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.payments.recordPayment}
      description={
        target
          ? `${target.reference} · ${fullName(target.guest)} · ${money(target.balance)} outstanding`
          : t.payments.logAgainst
      }
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSubmit} loading={isSubmitting}>
            Record payment
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        {!booking ? (
          <Field label={t.bookings.colBooking} className="sm:col-span-2" htmlFor="pay-booking">
            <Select id="pay-booking" {...register("booking_id")}>
              <option value="">{t.payments.noLinkedBooking}</option>
              {bookings
                .filter((entry) => entry.balance > 0 || entry.id === target?.id)
                .slice(0, 200)
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.reference} · {fullName(entry.guest)} · {money(entry.balance)} due
                  </option>
                ))}
            </Select>
          </Field>
        ) : null}

        <Field label={t.common.amount} required error={errors.amount?.message}>
          <Controller
            control={control}
            name="amount"
            render={({ field }) => (
              <MoneyInput
                data-autofocus
                symbol={symbol}
                value={field.value}
                onValueChange={field.onChange}
              />
            )}
          />
        </Field>

        <Field label={t.payments.dateReceived} required error={errors.paid_at?.message} htmlFor="pay-date">
          <Input id="pay-date" type="date" {...register("paid_at")} />
        </Field>

        <Field label={t.payments.method} htmlFor="pay-method">
          <Select id="pay-method" {...register("method")}>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {PAYMENT_METHOD_LABELS[method]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t.common.status} htmlFor="pay-status">
          <Select id="pay-status" {...register("status")}>
            {PAYMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PAYMENT_STATUS_META[status].label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label={t.payments.transactionReference}
          hint="From the bank or card terminal. A receipt number is assigned automatically."
          htmlFor="pay-ref"
        >
          <Input id="pay-ref" placeholder="TXN-123456" {...register("reference")} />
        </Field>

        <Field label={t.common.note} className="sm:col-span-2" htmlFor="pay-note">
          <Textarea id="pay-note" rows={2} placeholder={t.payments.depositPlaceholder} {...register("note")} />
        </Field>
      </form>
    </Dialog>
  );
}
