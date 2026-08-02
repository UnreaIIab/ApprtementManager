import { strings } from "@/i18n";
import type {
  ApartmentStatus,
  BookingSource,
  BookingStatus,
  ExpenseCategory,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  TaskStatus,
} from "@/types/domain";

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

/*
 * `key` indexes the `nav` section of the dictionary. The label itself is a
 * getter so a nav item read after a language change is already translated,
 * without every consumer having to reach for the provider.
 */
const NAV_DEFS = [
  { href: "/", key: "dashboard", icon: "LayoutDashboard", shortcut: "G D" },
  { href: "/calendar", key: "calendar", icon: "CalendarDays", shortcut: "G C" },
  { href: "/bookings", key: "bookings", icon: "BookOpen", shortcut: "G B" },
  { href: "/apartments", key: "apartments", icon: "Building2", shortcut: "G A" },
  { href: "/guests", key: "guests", icon: "Users", shortcut: "G G" },
  { href: "/invoices", key: "invoices", icon: "FileText", shortcut: "G I" },
  { href: "/payments", key: "payments", icon: "CreditCard", shortcut: "G P" },
  { href: "/expenses", key: "expenses", icon: "Receipt", shortcut: "G E" },
  { href: "/reports", key: "reports", icon: "BarChart3", shortcut: "G R" },
  { href: "/settings", key: "settings", icon: "Settings", shortcut: "G S" },
] as const;

export interface NavItem {
  href: string;
  key: (typeof NAV_DEFS)[number]["key"];
  icon: string;
  shortcut: string;
  label: string;
}

export const NAV_ITEMS: NavItem[] = NAV_DEFS.map((item) => ({
  ...item,
  get label() {
    return strings().nav[item.key];
  },
}));

/* ------------------------------------------------------------------ */
/* Status vocabulary                                                   */
/* ------------------------------------------------------------------ */

/**
 * Status colors are *reserved*: they never double as a categorical series
 * color. Each entry ships a token pair so a badge is never color-alone — the
 * label is always rendered beside the dot.
 */
export interface StatusMeta {
  label: string;
  /** CSS var for the dot / bar fill. */
  color: string;
  /** Tailwind classes for the badge chip. */
  chip: string;
  icon?: string;
}

export const BOOKING_STATUS_META: Record<BookingStatus, StatusMeta> = {
  pending: {
    get label() {
      return strings().status.booking.pending;
    },
    color: "var(--warning)",
    chip: "bg-warning-wash text-ink border-warning/30",
    icon: "Clock",
  },
  confirmed: {
    get label() {
      return strings().status.booking.confirmed;
    },
    color: "var(--info)",
    chip: "bg-info-wash text-ink border-info/30",
    icon: "CheckCircle2",
  },
  checked_in: {
    get label() {
      return strings().status.booking.checked_in;
    },
    color: "var(--good)",
    chip: "bg-good-wash text-ink border-good/30",
    icon: "LogIn",
  },
  checked_out: {
    get label() {
      return strings().status.booking.checked_out;
    },
    color: "var(--ink-3)",
    chip: "bg-neutral-wash text-ink-2 border-line",
    icon: "LogOut",
  },
  cancelled: {
    get label() {
      return strings().status.booking.cancelled;
    },
    color: "var(--critical)",
    chip: "bg-critical-wash text-ink border-critical/30",
    icon: "XCircle",
  },
  no_show: {
    get label() {
      return strings().status.booking.no_show;
    },
    color: "var(--serious)",
    chip: "bg-serious-wash text-ink border-serious/30",
    icon: "UserX",
  },
};

export const APARTMENT_STATUS_META: Record<ApartmentStatus, StatusMeta> = {
  available: {
    get label() {
      return strings().status.apartment.available;
    },
    color: "var(--good)",
    chip: "bg-good-wash text-ink border-good/30",
    icon: "DoorOpen",
  },
  occupied: {
    get label() {
      return strings().status.apartment.occupied;
    },
    color: "var(--info)",
    chip: "bg-info-wash text-ink border-info/30",
    icon: "BedDouble",
  },
  cleaning: {
    get label() {
      return strings().status.apartment.cleaning;
    },
    color: "var(--warning)",
    chip: "bg-warning-wash text-ink border-warning/30",
    icon: "Sparkles",
  },
  maintenance: {
    get label() {
      return strings().status.apartment.maintenance;
    },
    color: "var(--serious)",
    chip: "bg-serious-wash text-ink border-serious/30",
    icon: "Wrench",
  },
  blocked: {
    get label() {
      return strings().status.apartment.blocked;
    },
    color: "var(--critical)",
    chip: "bg-critical-wash text-ink border-critical/30",
    icon: "Ban",
  },
  reserved: {
    get label() {
      return strings().status.apartment.reserved;
    },
    color: "var(--ink-3)",
    chip: "bg-neutral-wash text-ink-2 border-line",
    icon: "CalendarCheck",
  },
};

export const INVOICE_STATUS_META: Record<InvoiceStatus, StatusMeta> = {
  draft: { get label() { return strings().status.invoice.draft; }, color: "var(--ink-3)", chip: "bg-neutral-wash text-ink-2 border-line", icon: "FilePen" },
  sent: { get label() { return strings().status.invoice.sent; }, color: "var(--info)", chip: "bg-info-wash text-ink border-info/30", icon: "Send" },
  paid: { get label() { return strings().status.invoice.paid; }, color: "var(--good)", chip: "bg-good-wash text-ink border-good/30", icon: "CheckCircle2" },
  partial: { get label() { return strings().status.invoice.partial; }, color: "var(--warning)", chip: "bg-warning-wash text-ink border-warning/30", icon: "CircleDashed" },
  overdue: { get label() { return strings().status.invoice.overdue; }, color: "var(--critical)", chip: "bg-critical-wash text-ink border-critical/30", icon: "AlertTriangle" },
  void: { get label() { return strings().status.invoice.void; }, color: "var(--ink-3)", chip: "bg-neutral-wash text-ink-3 border-line", icon: "Ban" },
};

export const PAYMENT_STATUS_META: Record<PaymentStatus, StatusMeta> = {
  pending: { get label() { return strings().status.payment.pending; }, color: "var(--warning)", chip: "bg-warning-wash text-ink border-warning/30", icon: "Clock" },
  paid: { get label() { return strings().status.payment.paid; }, color: "var(--good)", chip: "bg-good-wash text-ink border-good/30", icon: "CheckCircle2" },
  partial: { get label() { return strings().status.payment.partial; }, color: "var(--info)", chip: "bg-info-wash text-ink border-info/30", icon: "CircleDashed" },
  refunded: { get label() { return strings().status.payment.refunded; }, color: "var(--ink-3)", chip: "bg-neutral-wash text-ink-2 border-line", icon: "Undo2" },
  failed: { get label() { return strings().status.payment.failed; }, color: "var(--critical)", chip: "bg-critical-wash text-ink border-critical/30", icon: "XCircle" },
};

export const TASK_STATUS_META: Record<TaskStatus, StatusMeta> = {
  pending: { get label() { return strings().status.task.pending; }, color: "var(--warning)", chip: "bg-warning-wash text-ink border-warning/30", icon: "Clock" },
  in_progress: { get label() { return strings().status.task.in_progress; }, color: "var(--info)", chip: "bg-info-wash text-ink border-info/30", icon: "Loader" },
  done: { get label() { return strings().status.task.done; }, color: "var(--good)", chip: "bg-good-wash text-ink border-good/30", icon: "CheckCircle2" },
  cancelled: { get label() { return strings().status.task.cancelled; }, color: "var(--ink-3)", chip: "bg-neutral-wash text-ink-2 border-line", icon: "XCircle" },
};

export const BOOKING_SOURCE_LABELS: Record<BookingSource, string> = {
  get airbnb() {
    return strings().source.airbnb;
  },
  get booking_com() {
    return strings().source.booking_com;
  },
  get direct() {
    return strings().source.direct;
  },
  get expedia() {
    return strings().source.expedia;
  },
  get vrbo() {
    return strings().source.vrbo;
  },
  get other() {
    return strings().source.other;
  },
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  get cash() {
    return strings().method.cash;
  },
  get bank_transfer() {
    return strings().method.bank_transfer;
  },
  get credit_card() {
    return strings().method.credit_card;
  },
  get stripe() {
    return strings().method.stripe;
  },
  get paypal() {
    return strings().method.paypal;
  },
  get online() {
    return strings().method.online;
  },
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  get utilities() {
    return strings().category.utilities;
  },
  get cleaning() {
    return strings().category.cleaning;
  },
  get maintenance() {
    return strings().category.maintenance;
  },
  get repairs() {
    return strings().category.repairs;
  },
  get furniture() {
    return strings().category.furniture;
  },
  get supplies() {
    return strings().category.supplies;
  },
  get taxes() {
    return strings().category.taxes;
  },
  get insurance() {
    return strings().category.insurance;
  },
  get marketing() {
    return strings().category.marketing;
  },
  get commission() {
    return strings().category.commission;
  },
  get staff() {
    return strings().category.staff;
  },
  get other() {
    return strings().category.other;
  },
};

/* ------------------------------------------------------------------ */
/* Chart colors                                                        */
/* ------------------------------------------------------------------ */

/**
 * Categorical slots in fixed order. Hues are *assigned by entity*, never by
 * rank — `seriesColor(key, order)` keeps a booking source the same color no
 * matter how the chart is filtered or sorted.
 *
 * Both light and dark steps are validated against this app's own surfaces
 * (`#ffffff` / `#17181a`) — see docs/design.md.
 */
export const SERIES_VARS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
] as const;

export const MAX_SERIES = SERIES_VARS.length;

/** Stable slot per booking source so the color survives any filter change. */
export const SOURCE_ORDER: BookingSource[] = [
  "airbnb",
  "booking_com",
  "direct",
  "expedia",
  "vrbo",
  "other",
];

export function sourceColor(source: BookingSource): string {
  const index = SOURCE_ORDER.indexOf(source);
  return SERIES_VARS[(index < 0 ? SOURCE_ORDER.length - 1 : index) % MAX_SERIES];
}

/**
 * Expense categories outnumber the palette, so charts show the top 7 by value
 * and fold the rest into "Other" rather than inventing a ninth hue.
 */
export const CATEGORY_ORDER: ExpenseCategory[] = [
  "cleaning",
  "maintenance",
  "utilities",
  "repairs",
  "commission",
  "supplies",
  "taxes",
  "insurance",
  "marketing",
  "furniture",
  "staff",
  "other",
];

export function categoryColor(category: ExpenseCategory): string {
  const index = CATEGORY_ORDER.indexOf(category);
  return SERIES_VARS[(index < 0 ? MAX_SERIES - 1 : index) % MAX_SERIES];
}

/** The single hue used for magnitude ramps (occupancy heatmaps). */
export const SEQUENTIAL_STEPS = [
  "var(--seq-1)",
  "var(--seq-2)",
  "var(--seq-3)",
  "var(--seq-4)",
  "var(--seq-5)",
  "var(--seq-6)",
] as const;

export const AMENITIES = [
  "Wi-Fi",
  "Air conditioning",
  "Heating",
  "Kitchen",
  "Washer",
  "Dryer",
  "Free parking",
  "Elevator",
  "Balcony",
  "Sea view",
  "City view",
  "TV",
  "Dishwasher",
  "Workspace",
  "Pool",
  "Gym",
  "Pets allowed",
  "Smoke alarm",
  "First aid kit",
  "Self check-in",
] as const;

/**
 * The amenity a guest sees. `AMENITIES` holds what is written to the database;
 * this translates it for display and passes anything unrecognised straight
 * through, so a custom amenity is never swallowed.
 */
export function amenityLabel(amenity: string): string {
  const table = strings().amenity as Record<string, string | undefined>;
  return table[amenity] ?? amenity;
}

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
