"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { guestSchema, type GuestFormValues } from "@/lib/schemas";
import { useT } from "@/i18n";
import { useCreateGuest } from "@/data/queries";
import { Dialog } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import type { Guest } from "@/types/domain";

const EMPTY: GuestFormValues = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  nationality: "",
  id_type: "Passport",
  id_number: "",
  id_expiry: "",
  date_of_birth: "",
  address: "",
  city: "",
  country: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  notes: "",
  is_vip: false,
  is_blacklisted: false,
};

/**
 * Minimal guest capture, opened from inside the booking form so a walk-in never
 * forces the user to abandon a half-filled reservation.
 */
export function GuestQuickAdd({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (guest: Guest) => void;
}) {
  const t = useT();
  const createGuest = useCreateGuest();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<GuestFormValues>({
    resolver: zodResolver(guestSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (open) reset(EMPTY);
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    const guest = await createGuest.mutateAsync({
      ...values,
      email: values.email || null,
      phone: values.phone || null,
      nationality: values.nationality || null,
      id_type: values.id_type || null,
      id_number: values.id_number || null,
      id_expiry: values.id_expiry || null,
      date_of_birth: values.date_of_birth || null,
      address: values.address || null,
      city: values.city || null,
      country: values.country || null,
      emergency_contact_name: values.emergency_contact_name || null,
      emergency_contact_phone: values.emergency_contact_phone || null,
      notes: values.notes || null,
      tags: [],
      avatar_url: null,
    });
    onCreated?.(guest);
    onClose();
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.guests.addGuest}
      description={t.guests.captureEssentials}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" onClick={onSubmit} loading={isSubmitting}>
            Add guest
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label={t.guests.firstName} required error={errors.first_name?.message} htmlFor="qa-first">
          <Input id="qa-first" data-autofocus {...register("first_name")} />
        </Field>
        <Field label={t.guests.lastName} required error={errors.last_name?.message} htmlFor="qa-last">
          <Input id="qa-last" {...register("last_name")} />
        </Field>
        <Field label={t.common.email} error={errors.email?.message} htmlFor="qa-email">
          <Input id="qa-email" type="email" {...register("email")} />
        </Field>
        <Field label={t.common.phone} htmlFor="qa-phone">
          <Input id="qa-phone" type="tel" {...register("phone")} />
        </Field>
        <Field label={t.guests.nationality} htmlFor="qa-nat">
          <Input id="qa-nat" {...register("nationality")} />
        </Field>
        <Field label={t.guests.idPassportNumber} htmlFor="qa-id">
          <Input id="qa-id" {...register("id_number")} />
        </Field>
        <div className="sm:col-span-2">
          <Checkbox
            label={t.guests.markAsVip}
            description={t.guests.highlightsGuest}
            {...register("is_vip")}
          />
        </div>
      </form>
    </Dialog>
  );
}
