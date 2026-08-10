import { z } from "zod";
import { LOCALES, strings } from "@/i18n";

/**
 * Validation copy, resolved when the message is produced rather than when the
 * schema is built.
 *
 * These schemas are constructed as the module loads — long before a company's
 * language is known — so a plain string would freeze whichever locale happened
 * to be active at import, and an English user would get French errors. Zod's
 * `error` accepts a callback, which defers the lookup to validation time.
 */
const v = (key: keyof ReturnType<typeof strings>["validation"]) => ({
  error: () => strings().validation[key],
});
import {
  APARTMENT_STATUSES,
  BOOKING_SOURCES,
  BOOKING_STATUSES,
  BILL_TYPES,
  EXPENSE_CATEGORIES,
  INVOICE_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  TASK_STATUSES,
  TASK_TYPES,
} from "@/types/domain";

/**
 * Validation schemas.
 *
 * Numeric fields are plain `z.number()` and the inputs that feed them register
 * with `{ valueAsNumber: true }` — `z.coerce` would widen the resolver's input
 * type to `unknown` and break form typing.
 *
 * These mirror the database constraints so a user sees the problem in the form
 * rather than as a Postgres error after submitting. The DB remains the
 * authority — the booking overlap constraint in particular can only be settled
 * server-side — but everything cheap to check is checked here first.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, v("useDatePicker"));

const money = z
  .number(v("enterAmount"))
  .int(v("amountsInCents"))
  .min(0, v("cannotBeNegative"));

export const bookingSchema = z
  .object({
    apartment_id: z.string().min(1, v("chooseApartment")),
    guest_id: z.string().min(1, v("chooseGuest")),
    check_in: isoDate,
    check_out: isoDate,
    check_in_time: z.string().optional().nullable(),
    check_out_time: z.string().optional().nullable(),
    adults: z.number().int().min(1, v("atLeastOneAdult")),
    children: z.number().int().min(0),
    status: z.enum(BOOKING_STATUSES),
    source: z.enum(BOOKING_SOURCES),
    nightly_rate: money,
    cleaning_fee: money,
    extra_fees: money,
    discount: money,
    notes: z.string().max(2000).optional().nullable(),
    internal_notes: z.string().max(2000).optional().nullable(),
  })
  .refine((value) => value.check_out > value.check_in, {
    ...v("checkOutAfterCheckIn"),
    path: ["check_out"],
  });

export type BookingFormValues = z.infer<typeof bookingSchema>;

export const guestSchema = z.object({
  first_name: z.string().min(1, v("firstNameRequired")),
  last_name: z.string().min(1, v("lastNameRequired")),
  email: z.union([z.literal(""), z.email(v("validEmail"))]).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  nationality: z.string().max(80).optional().nullable(),
  id_type: z.string().max(40).optional().nullable(),
  id_number: z.string().max(60).optional().nullable(),
  id_expiry: z.union([z.literal(""), isoDate]).optional().nullable(),
  date_of_birth: z.union([z.literal(""), isoDate]).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  country: z.string().max(80).optional().nullable(),
  emergency_contact_name: z.string().max(120).optional().nullable(),
  emergency_contact_phone: z.string().max(40).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  is_vip: z.boolean(),
  is_blacklisted: z.boolean(),
});

export type GuestFormValues = z.infer<typeof guestSchema>;

export const apartmentSchema = z.object({
  code: z.string().min(1, v("codeRequired")).max(24),
  name: z.string().min(1, v("nameRequired")).max(120),
  description: z.string().max(4000).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  country: z.string().max(80).optional().nullable(),
  floor: z.string().max(20).optional().nullable(),
  bedrooms: z.number().int().min(0).max(20),
  bathrooms: z.number().int().min(0).max(20),
  beds: z.number().int().min(0).max(40),
  capacity: z.number().int().min(1, v("atLeastOneGuest")).max(40),
  size_sqm: z.number().min(0).max(2000),
  status: z.enum(APARTMENT_STATUSES),
  nightly_rate: money,
  cleaning_fee: money,
  weekly_discount: z.number().min(0).max(100),
  monthly_discount: z.number().min(0).max(100),
  min_nights: z.number().int().min(1).max(365),
  amenities: z.array(z.string()),
  is_active: z.boolean(),
  // Optional: the listing page falls back to searching the address by text.
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
});

export type ApartmentFormValues = z.infer<typeof apartmentSchema>;

export const expenseSchema = z
  .object({
  apartment_id: z.string().optional().nullable(),
  category: z.enum(EXPENSE_CATEGORIES),
  bill_type: z.enum(BILL_TYPES).optional().nullable(),
  vendor: z.string().max(120).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  amount: money.refine((value) => value > 0, v("amountAboveZero")),
  expense_date: isoDate,
  method: z.enum(PAYMENT_METHODS),
  status: z.enum(PAYMENT_STATUSES),
  invoice_ref: z.string().max(80).optional().nullable(),
  is_recurring: z.boolean(),
  recurrence: z.string().max(40).optional().nullable(),
  })
  /*
   * A bill without a type is the whole reason this category exists — the point
   * is to know whether it was the electricity or the syndic. Mirrors the check
   * constraint on the table.
   */
  .refine((value) => value.category !== "bills" || Boolean(value.bill_type), {
    ...v("billTypeRequired"),
    path: ["bill_type"],
  });

export type ExpenseFormValues = z.infer<typeof expenseSchema>;

export const paymentSchema = z.object({
  booking_id: z.string().optional().nullable(),
  invoice_id: z.string().optional().nullable(),
  amount: money.refine((value) => value > 0, v("amountAboveZero")),
  method: z.enum(PAYMENT_METHODS),
  status: z.enum(PAYMENT_STATUSES),
  paid_at: isoDate,
  reference: z.string().max(80).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export type PaymentFormValues = z.infer<typeof paymentSchema>;

export const invoiceSchema = z.object({
  booking_id: z.string().optional().nullable(),
  guest_id: z.string().optional().nullable(),
  apartment_id: z.string().optional().nullable(),
  issue_date: isoDate,
  due_date: isoDate,
  status: z.enum(INVOICE_STATUSES),
  discount: money,
  notes: z.string().max(2000).optional().nullable(),
  terms: z.string().max(2000).optional().nullable(),
  items: z
    .array(
      z.object({
        description: z.string().min(1, v("describeLine")),
        quantity: z.number().min(0.01, v("quantityAboveZero")),
        unit_price: money,
      }),
    )
    .min(1, v("atLeastOneLine")),
});

export type InvoiceFormValues = z.infer<typeof invoiceSchema>;

export const taskSchema = z.object({
  apartment_id: z.string().min(1, v("chooseApartment")),
  type: z.enum(TASK_TYPES),
  title: z.string().min(1, v("taskTitleRequired")).max(160),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(TASK_STATUSES),
  priority: z.number().int().min(1).max(3),
  due_date: z.union([z.literal(""), isoDate]).optional().nullable(),
  assignee: z.string().max(120).optional().nullable(),
  cost: money,
});

export type TaskFormValues = z.infer<typeof taskSchema>;

export const organizationSchema = z.object({
  name: z.string().min(1, v("companyNameRequired")).max(160),
  legal_name: z.string().max(200).optional().nullable(),
  email: z.union([z.literal(""), z.email(v("validEmail"))]).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  tax_id: z.string().max(60).optional().nullable(),
  currency: z.string().length(3, v("currencyCode3")),
  tax_rate: z.number().min(0).max(100),
  timezone: z.string().min(1),
  locale: z.enum(LOCALES),
  invoice_prefix: z.string().min(1).max(10),
  booking_prefix: z.string().min(1).max(10),
});

export type OrganizationFormValues = z.infer<typeof organizationSchema>;

export const passwordSchema = z
  .object({
    password: z.string().min(8, v("atLeast8Chars")),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    ...v("passwordsMismatch"),
    path: ["confirm"],
  });

export const loginSchema = z.object({
  email: z.email(v("validEmail")),
  password: z.string().min(1, v("enterPassword")),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
