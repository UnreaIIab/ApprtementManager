/**
 * Domain model shared by every layer of the app.
 *
 * Money is carried as **minor units** (integer cents) end to end — the database
 * stores integers, the repositories return integers, and only the formatting
 * helpers in `lib/format.ts` turn them into a display string. Nothing in the app
 * does float arithmetic on money.
 *
 * Dates that describe a calendar day (check-in, expense date) are `YYYY-MM-DD`
 * strings so they never shift under a timezone conversion. Instants (created_at,
 * paid_at) are ISO timestamps.
 */

export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string;
export type UUID = string;

export const APARTMENT_STATUSES = [
  "available",
  "occupied",
  "cleaning",
  "maintenance",
  "blocked",
  "reserved",
] as const;
export type ApartmentStatus = (typeof APARTMENT_STATUSES)[number];

export const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_SOURCES = [
  "airbnb",
  "booking_com",
  "direct",
  "expedia",
  "vrbo",
  "other",
] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

export const PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
  "credit_card",
  "stripe",
  "paypal",
  "online",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = [
  "pending",
  "paid",
  "partial",
  "refunded",
  "failed",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "paid",
  "partial",
  "overdue",
  "void",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const EXPENSE_CATEGORIES = [
  "bills",
  "cleaning",
  "maintenance",
  "repairs",
  "furniture",
  "supplies",
  "taxes",
  "insurance",
  "marketing",
  "commission",
  "staff",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/**
 * What a bill is for. Only meaningful when the category is `bills`, which the
 * database enforces with a check constraint.
 */
export const BILL_TYPES = [
  "electricity",
  "water",
  "internet",
  "syndic",
  "tax",
] as const;

export type BillType = (typeof BILL_TYPES)[number];

export const TASK_TYPES = ["cleaning", "maintenance"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_STATUSES = [
  "pending",
  "in_progress",
  "done",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export type MemberRole = "owner" | "admin" | "manager" | "staff" | "viewer";

/* ------------------------------------------------------------------ */

export interface Organization {
  id: UUID;
  name: string;
  legal_name: string | null;
  logo_url: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  tax_id: string | null;
  currency: string;
  tax_rate: number;
  timezone: string;
  locale: string;
  invoice_prefix: string;
  booking_prefix: string;
  settings: Record<string, unknown>;
}

export interface Property {
  id: UUID;
  org_id: UUID;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
}

export interface Apartment {
  id: UUID;
  org_id: UUID;
  property_id: UUID | null;
  code: string;
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  floor: string | null;
  bedrooms: number;
  bathrooms: number;
  beds: number;
  capacity: number;
  size_sqm: number | null;
  status: ApartmentStatus;
  nightly_rate: number;
  cleaning_fee: number;
  weekly_discount: number;
  monthly_discount: number;
  min_nights: number;
  max_nights: number | null;
  amenities: string[];
  images: string[];
  cover_image: string | null;
  is_active: boolean;
  /** Whether the shared listing page resolves for this apartment. */
  is_public: boolean;
  /** Unguessable id used in the public URL. Rotating it revokes sent links. */
  share_token: string;
  latitude: number | null;
  longitude: number | null;
  created_at: ISODateTime;
}

export interface Guest {
  id: UUID;
  org_id: UUID;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  id_type: string | null;
  id_number: string | null;
  id_expiry: ISODate | null;
  date_of_birth: ISODate | null;
  address: string | null;
  city: string | null;
  country: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
  tags: string[];
  is_vip: boolean;
  is_blacklisted: boolean;
  avatar_url: string | null;
  created_at: ISODateTime;
}

export interface Booking {
  id: UUID;
  org_id: UUID;
  reference: string;
  apartment_id: UUID;
  guest_id: UUID;
  check_in: ISODate;
  check_out: ISODate;
  check_in_time: string | null;
  check_out_time: string | null;
  actual_check_in: ISODateTime | null;
  actual_check_out: ISODateTime | null;
  adults: number;
  children: number;
  status: BookingStatus;
  source: BookingSource;
  nightly_rate: number;
  nights: number;
  subtotal: number;
  cleaning_fee: number;
  extra_fees: number;
  discount: number;
  tax: number;
  total: number;
  commission: number;
  notes: string | null;
  internal_notes: string | null;
  cancelled_at: ISODateTime | null;
  cancellation_reason: string | null;
  created_at: ISODateTime;
}

/** A booking joined with the two entities every list view needs to show. */
export interface BookingWithRelations extends Booking {
  guest: Guest;
  apartment: Apartment;
  paid: number;
  balance: number;
}

export interface CalendarBlock {
  id: UUID;
  org_id: UUID;
  apartment_id: UUID;
  start_date: ISODate;
  end_date: ISODate;
  reason: string;
  note: string | null;
}

export interface InvoiceItem {
  id: UUID;
  invoice_id: UUID;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  position: number;
}

export interface Invoice {
  id: UUID;
  org_id: UUID;
  number: string;
  booking_id: UUID | null;
  guest_id: UUID | null;
  apartment_id: UUID | null;
  issue_date: ISODate;
  due_date: ISODate | null;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  status: InvoiceStatus;
  notes: string | null;
  terms: string | null;
  created_at: ISODateTime;
}

export interface InvoiceWithRelations extends Invoice {
  guest: Guest | null;
  apartment: Apartment | null;
  booking: Booking | null;
  items: InvoiceItem[];
  paid: number;
  balance: number;
}

export interface Payment {
  id: UUID;
  org_id: UUID;
  /** Sequential, allocated by the database. Distinct from `reference`. */
  receipt_number: string | null;
  booking_id: UUID | null;
  invoice_id: UUID | null;
  guest_id: UUID | null;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  paid_at: ISODateTime;
  reference: string | null;
  note: string | null;
}

export interface PaymentWithRelations extends Payment {
  guest: Guest | null;
  booking: Booking | null;
  apartment: Apartment | null;
}

export interface Expense {
  id: UUID;
  org_id: UUID;
  apartment_id: UUID | null;
  booking_id: UUID | null;
  category: ExpenseCategory;
  /** Set only for `bills`; null for every other category. */
  bill_type: BillType | null;
  vendor: string | null;
  description: string | null;
  amount: number;
  expense_date: ISODate;
  method: PaymentMethod;
  status: PaymentStatus;
  invoice_ref: string | null;
  attachment_url: string | null;
  is_recurring: boolean;
  recurrence: string | null;
}

export interface ExpenseWithRelations extends Expense {
  apartment: Apartment | null;
}

export interface Task {
  id: UUID;
  org_id: UUID;
  apartment_id: UUID;
  booking_id: UUID | null;
  type: TaskType;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  due_date: ISODate | null;
  assignee: string | null;
  cost: number;
  completed_at: ISODateTime | null;
}

export interface TaskWithRelations extends Task {
  apartment: Apartment | null;
}

export interface Note {
  id: UUID;
  org_id: UUID;
  entity_type: string;
  entity_id: UUID;
  body: string;
  author_name: string | null;
  created_at: ISODateTime;
}

export interface ActivityEntry {
  id: UUID;
  org_id: UUID;
  entity_type: string;
  entity_id: UUID;
  action: string;
  detail: Record<string, unknown>;
  actor_name: string | null;
  created_at: ISODateTime;
}

export interface AppNotification {
  id: UUID;
  org_id: UUID;
  /**
   * Names the *condition*, not the occurrence — `checkout:<booking id>`. The
   * scheduled job uses it to avoid inserting the same alert every hour, and the
   * bell uses it to recognise a stored row as something it is already showing
   * from live data.
   */
  dedupe_key: string | null;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  severity: "info" | "success" | "warning" | "critical";
  read_at: ISODateTime | null;
  created_at: ISODateTime;
}

export interface DocumentRecord {
  id: UUID;
  org_id: UUID;
  entity_type: string;
  entity_id: UUID;
  name: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Analytics shapes                                                    */
/* ------------------------------------------------------------------ */

export interface DateRange {
  start: ISODate;
  end: ISODate; // inclusive
}

export interface KpiSet {
  revenue: number;
  expenses: number;
  netProfit: number;
  bookings: number;
  nightsSold: number;
  nightsAvailable: number;
  occupancyRate: number; // 0..1
  adr: number;
  revpar: number;
  avgLengthOfStay: number;
  availableApartments: number;
  totalApartments: number;
  activeGuests: number;
  cancellationRate: number;
  collected: number;
  outstanding: number;
}

export interface TrendPoint {
  /** Bucket key, `YYYY-MM-DD` for days, `YYYY-MM` for months. */
  key: string;
  label: string;
  revenue: number;
  expenses: number;
  profit: number;
  bookings: number;
  nightsSold: number;
  nightsAvailable: number;
  occupancy: number;
}

export interface BreakdownSlice {
  key: string;
  label: string;
  value: number;
  share: number;
}

export interface ApartmentPerformance {
  apartment: Apartment;
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
  nightsSold: number;
  nightsAvailable: number;
  occupancy: number;
  adr: number;
  revpar: number;
  bookings: number;
  avgStay: number;
  cancellationRate: number;
}

export interface SearchHit {
  id: string;
  type: "booking" | "guest" | "apartment" | "invoice" | "payment" | "expense";
  title: string;
  subtitle: string;
  meta?: string;
  href: string;
}
