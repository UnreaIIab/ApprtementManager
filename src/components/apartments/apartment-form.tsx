"use client";

import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apartmentSchema, type ApartmentFormValues } from "@/lib/schemas";
import { strings, useT } from "@/i18n";
import { AMENITIES, APARTMENT_STATUS_META } from "@/lib/constants";
import { APARTMENT_STATUSES } from "@/types/domain";
import { currencySymbol } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useApartments, useCreateApartment, useOrganization, useUpdateApartment,
} from "@/data/queries";
import { Drawer } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import type { Apartment } from "@/types/domain";

export function ApartmentFormDrawer({
  open,
  onClose,
  apartment,
}: {
  open: boolean;
  onClose: () => void;
  apartment?: Apartment | null;
}) {
  const t = useT();
  const { data: apartments } = useApartments();
  const organization = useOrganization();
  const createApartment = useCreateApartment();
  const updateApartment = useUpdateApartment();
  const symbol = currencySymbol(organization?.currency);
  const editing = Boolean(apartment);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ApartmentFormValues>({
    resolver: zodResolver(apartmentSchema),
    defaultValues: emptyApartment(apartments.length),
  });

  useEffect(() => {
    if (!open) return;
    reset(
      apartment
        ? {
            code: apartment.code,
            name: apartment.name,
            description: apartment.description ?? "",
            address: apartment.address ?? "",
            city: apartment.city ?? "",
            country: apartment.country ?? "",
            floor: apartment.floor ?? "",
            bedrooms: apartment.bedrooms,
            bathrooms: apartment.bathrooms,
            beds: apartment.beds,
            capacity: apartment.capacity,
            size_sqm: apartment.size_sqm ?? 0,
            status: apartment.status,
            nightly_rate: apartment.nightly_rate,
            cleaning_fee: apartment.cleaning_fee,
            weekly_discount: apartment.weekly_discount,
            monthly_discount: apartment.monthly_discount,
            min_nights: apartment.min_nights,
            amenities: apartment.amenities,
            is_active: apartment.is_active,
            latitude: apartment.latitude,
            longitude: apartment.longitude,
          }
        : emptyApartment(apartments.length),
    );
  }, [open, apartment, apartments.length, reset]);

  const amenities = useWatch({ control, name: "amenities" }) ?? [];


  const toggleAmenity = (amenity: string) => {
    const next = amenities.includes(amenity)
      ? amenities.filter((entry) => entry !== amenity)
      : [...amenities, amenity];
    setValue("amenities", next, { shouldDirty: true });
  };

  const onSubmit = handleSubmit(async (values) => {
    const payload = {
      ...values,
      description: values.description || null,
      address: values.address || null,
      city: values.city || null,
      country: values.country || null,
      floor: values.floor || null,
      size_sqm: values.size_sqm || null,
      max_nights: null,
      images: apartment?.images ?? [],
      cover_image: apartment?.cover_image ?? null,
      property_id: apartment?.property_id ?? null,
      // Sharing is opt-in and lives on the apartment profile, not here.
      is_public: apartment?.is_public ?? false,
      share_token: apartment?.share_token ?? "",
    };

    if (apartment) {
      await updateApartment.mutateAsync({ id: apartment.id, patch: payload });
    } else {
      await createApartment.mutateAsync(payload);
    }
    onClose();
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={editing ? t.apartments.editApartment(apartment!.name) : t.apartments.addApartment}
      subtitle={editing ? apartment!.code : t.apartments.setUpNewUnit}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSubmit} loading={isSubmitting}>
            {editing ? t.common.saveChanges : t.apartments.addApartment}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5 px-5 py-5 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.common.name} required error={errors.name?.message} htmlFor="apt-name">
            <Input id="apt-name" data-autofocus {...register("name")} />
          </Field>
          <Field label={t.apartments.code} required error={errors.code?.message} htmlFor="apt-code" hint={t.apartments.codeHint}>
            <Input id="apt-code" {...register("code")} />
          </Field>
          <Field label={t.common.address} className="sm:col-span-2" htmlFor="apt-address">
            <Input id="apt-address" {...register("address")} />
          </Field>
          <Field label={t.common.city} htmlFor="apt-city">
            <Input id="apt-city" {...register("city")} />
          </Field>
          <Field label={t.common.country} htmlFor="apt-country">
            <Input id="apt-country" {...register("country")} />
          </Field>
        </div>

        <fieldset className="rounded-xl border border-line p-4">
          <legend className="px-1.5 text-[12px] font-medium uppercase tracking-wide text-ink-3">
            Layout
          </legend>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label={t.apartments.bedrooms} error={errors.bedrooms?.message} htmlFor="apt-bed">
              <Input id="apt-bed" type="number" min={0} {...register("bedrooms", { valueAsNumber: true })} />
            </Field>
            <Field label={t.apartments.bathrooms} error={errors.bathrooms?.message} htmlFor="apt-bath">
              <Input id="apt-bath" type="number" min={0} {...register("bathrooms", { valueAsNumber: true })} />
            </Field>
            <Field label={t.apartments.beds} error={errors.beds?.message} htmlFor="apt-beds">
              <Input id="apt-beds" type="number" min={0} {...register("beds", { valueAsNumber: true })} />
            </Field>
            <Field label={t.apartments.sleeps} required error={errors.capacity?.message} htmlFor="apt-cap">
              <Input id="apt-cap" type="number" min={1} {...register("capacity", { valueAsNumber: true })} />
            </Field>
            <Field label={t.apartments.sizeM2} error={errors.size_sqm?.message} htmlFor="apt-size">
              <Input id="apt-size" type="number" min={0} {...register("size_sqm", { valueAsNumber: true })} />
            </Field>
            <Field label={t.apartments.floor} htmlFor="apt-floor">
              <Input id="apt-floor" {...register("floor")} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="rounded-xl border border-line p-4">
          <legend className="px-1.5 text-[12px] font-medium uppercase tracking-wide text-ink-3">
            Pricing &amp; rules
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.apartments.nightlyRate} error={errors.nightly_rate?.message}>
              <Controller
                control={control}
                name="nightly_rate"
                render={({ field }) => (
                  <MoneyInput symbol={symbol} value={field.value} onValueChange={field.onChange} />
                )}
              />
            </Field>
            <Field label={t.apartments.cleaningFee} error={errors.cleaning_fee?.message}>
              <Controller
                control={control}
                name="cleaning_fee"
                render={({ field }) => (
                  <MoneyInput symbol={symbol} value={field.value} onValueChange={field.onChange} />
                )}
              />
            </Field>
            <Field label={t.apartments.weeklyDiscountPct} htmlFor="apt-weekly">
              <Input id="apt-weekly" type="number" min={0} max={100} {...register("weekly_discount", { valueAsNumber: true })} />
            </Field>
            <Field label={t.apartments.monthlyDiscountPct} htmlFor="apt-monthly">
              <Input id="apt-monthly" type="number" min={0} max={100} {...register("monthly_discount", { valueAsNumber: true })} />
            </Field>
            <Field label={t.apartments.minimumNights} htmlFor="apt-min">
              <Input id="apt-min" type="number" min={1} {...register("min_nights", { valueAsNumber: true })} />
            </Field>
            <Field label={t.common.status} htmlFor="apt-status">
              <Select id="apt-status" {...register("status")}>
                {APARTMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {APARTMENT_STATUS_META[status].label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </fieldset>

        <Field label={t.apartments.amenities} hint={`${amenities.length} selected`}>
          <div className="flex flex-wrap gap-1.5">
            {AMENITIES.map((amenity) => {
              const active = amenities.includes(amenity);
              return (
                <button
                  key={amenity}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleAmenity(amenity)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[12.5px] transition-colors",
                    active
                      ? "border-ink bg-ink text-plane"
                      : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
                  )}
                >
                  {amenity}
                </button>
              );
            })}
          </div>
        </Field>

        <fieldset className="rounded-xl border border-line p-4">
          <legend className="px-1.5 text-[12px] font-medium uppercase tracking-wide text-ink-3">
            Map location
          </legend>
          <p className="mb-3 text-[12px] leading-relaxed text-ink-3">
            Optional. Adding coordinates puts a map on the shared listing page;
            without them it falls back to searching the address by name. In Google
            Maps, right-click the building and click the numbers to copy them.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.apartments.latitude} error={errors.latitude?.message} htmlFor="apt-lat">
              <Input
                id="apt-lat"
                type="number"
                step="any"
                placeholder="33.589886"
                {...register("latitude", { setValueAs: emptyToNull })}
              />
            </Field>
            <Field label={t.apartments.longitude} error={errors.longitude?.message} htmlFor="apt-lng">
              <Input
                id="apt-lng"
                type="number"
                step="any"
                placeholder="-7.603869"
                {...register("longitude", { setValueAs: emptyToNull })}
              />
            </Field>
          </div>
        </fieldset>

        <Field label={t.apartments.description2} htmlFor="apt-desc">
          <Textarea id="apt-desc" rows={4} {...register("description")} />
        </Field>

        <Checkbox
          label={t.apartments.active}
          description={t.apartments.inactiveExcluded}
          {...register("is_active")}
        />
      </form>
    </Drawer>
  );
}

/** An empty coordinate field means "unset", not NaN. */
function emptyToNull(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function emptyApartment(count: number): ApartmentFormValues {
  return {
    code: strings().apartments.nextCode(count + 1),
    name: "",
    description: "",
    address: "",
    city: "",
    country: "",
    floor: "",
    bedrooms: 1,
    bathrooms: 1,
    beds: 1,
    capacity: 2,
    size_sqm: 0,
    status: "available",
    nightly_rate: 9000,
    cleaning_fee: 3500,
    weekly_discount: 0,
    monthly_discount: 0,
    min_nights: 2,
    amenities: ["Wi-Fi", "Kitchen", "Air conditioning"],
    is_active: true,
    latitude: null,
    longitude: null,
  };
}
