import { paymentsByBooking, paymentsByInvoice } from "@/data/analytics";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type {
  ActivityEntry,
  Apartment,
  AppNotification,
  Booking,
  BookingWithRelations,
  CalendarBlock,
  DocumentRecord,
  Expense,
  ExpenseWithRelations,
  Guest,
  Invoice,
  InvoiceItem,
  InvoiceWithRelations,
  Note,
  Organization,
  Payment,
  PaymentWithRelations,
  Property,
  Task,
  TaskWithRelations,
} from "@/types/domain";

/**
 * Data access layer.
 *
 * Screens never touch Supabase directly — they go through `repository`, so the
 * transport stays swappable and every query is scoped to the signed-in user's
 * organisation in one place.
 */

export interface Snapshot {
  organization: Organization;
  properties: Property[];
  apartments: Apartment[];
  guests: Guest[];
  bookings: Booking[];
  blocks: CalendarBlock[];
  invoices: Invoice[];
  invoiceItems: InvoiceItem[];
  payments: Payment[];
  expenses: Expense[];
  tasks: Task[];
  notes: Note[];
  notifications: AppNotification[];
  activity: ActivityEntry[];
  documents: DocumentRecord[];
}

export interface Repository {
  readonly mode: "supabase";
  /**
   * One consolidated read of the working set.
   *
   * A property-management portfolio is small (tens of apartments, thousands of
   * bookings), so a single snapshot is both cheaper and more consistent than a
   * dozen endpoint round-trips: every KPI, chart and table on a screen is then
   * derived from the *same* data, and cross-entity filtering is instant. React
   * Query caches it; mutations invalidate it.
   */
  snapshot(): Promise<Snapshot>;

  createBooking(input: NewBooking): Promise<Booking>;
  updateBooking(id: string, patch: Partial<Booking>): Promise<Booking>;
  deleteBooking(id: string): Promise<void>;

  createGuest(input: NewGuest): Promise<Guest>;
  updateGuest(id: string, patch: Partial<Guest>): Promise<Guest>;
  deleteGuest(id: string): Promise<void>;

  createApartment(input: NewApartment): Promise<Apartment>;
  updateApartment(id: string, patch: Partial<Apartment>): Promise<Apartment>;
  deleteApartment(id: string): Promise<void>;

  createExpense(input: NewExpense): Promise<Expense>;
  updateExpense(id: string, patch: Partial<Expense>): Promise<Expense>;
  deleteExpense(id: string): Promise<void>;

  createPayment(input: NewPayment): Promise<Payment>;
  updatePayment(id: string, patch: Partial<Payment>): Promise<Payment>;
  deletePayment(id: string): Promise<void>;

  createInvoice(input: NewInvoice, items: NewInvoiceItem[]): Promise<Invoice>;
  updateInvoice(id: string, patch: Partial<Invoice>): Promise<Invoice>;
  deleteInvoice(id: string): Promise<void>;

  createTask(input: NewTask): Promise<Task>;
  updateTask(id: string, patch: Partial<Task>): Promise<Task>;
  deleteTask(id: string): Promise<void>;

  createBlock(input: NewBlock): Promise<CalendarBlock>;
  deleteBlock(id: string): Promise<void>;

  addNote(input: { entity_type: string; entity_id: string; body: string }): Promise<Note>;
  updateOrganization(patch: Partial<Organization>): Promise<Organization>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
}

/*
 * `reference`, `number` and `receipt_number` are omitted deliberately: a
 * database trigger allocates them inside the inserting transaction, which is
 * the only way to keep the series unique under concurrent use. Passing one is
 * still allowed — imports need it — but nothing in the UI should.
 */
export type NewBooking = Omit<
  Booking,
  "id" | "org_id" | "created_at" | "nights" | "reference"
> &
  Partial<Pick<Booking, "id" | "nights" | "reference">>;
export type NewGuest = Omit<Guest, "id" | "org_id" | "created_at">;
export type NewApartment = Omit<Apartment, "id" | "org_id" | "created_at">;
export type NewExpense = Omit<Expense, "id" | "org_id">;
export type NewPayment = Omit<Payment, "id" | "org_id" | "receipt_number"> &
  Partial<Pick<Payment, "receipt_number">>;
export type NewInvoice = Omit<Invoice, "id" | "org_id" | "created_at" | "number"> &
  Partial<Pick<Invoice, "number">>;
export type NewInvoiceItem = Omit<InvoiceItem, "id" | "invoice_id">;
export type NewTask = Omit<Task, "id" | "org_id">;
export type NewBlock = Omit<CalendarBlock, "id" | "org_id">;

/* ------------------------------------------------------------------ */
/* Derived-shape helpers, shared by both adapters                      */
/* ------------------------------------------------------------------ */

export function joinBookings(snapshot: Snapshot): BookingWithRelations[] {
  const guests = new Map(snapshot.guests.map((g) => [g.id, g]));
  const apartments = new Map(snapshot.apartments.map((a) => [a.id, a]));
  const paid = paymentsByBooking(snapshot.payments);

  return snapshot.bookings.flatMap((booking) => {
    const guest = guests.get(booking.guest_id);
    const apartment = apartments.get(booking.apartment_id);
    // A booking without its guest or apartment is unrenderable; skip rather
    // than crash a table on a partially-loaded snapshot.
    if (!guest || !apartment) return [];
    const paidAmount = paid.get(booking.id) ?? 0;
    return [{ ...booking, guest, apartment, paid: paidAmount, balance: booking.total - paidAmount }];
  });
}

export function joinInvoices(snapshot: Snapshot): InvoiceWithRelations[] {
  const guests = new Map(snapshot.guests.map((g) => [g.id, g]));
  const apartments = new Map(snapshot.apartments.map((a) => [a.id, a]));
  const bookings = new Map(snapshot.bookings.map((b) => [b.id, b]));
  const paid = paymentsByInvoice(snapshot.payments);
  const itemsByInvoice = new Map<string, InvoiceItem[]>();
  for (const item of snapshot.invoiceItems) {
    const list = itemsByInvoice.get(item.invoice_id) ?? [];
    list.push(item);
    itemsByInvoice.set(item.invoice_id, list);
  }

  return snapshot.invoices.map((invoice) => {
    const paidAmount = paid.get(invoice.id) ?? 0;
    return {
      ...invoice,
      guest: invoice.guest_id ? (guests.get(invoice.guest_id) ?? null) : null,
      apartment: invoice.apartment_id ? (apartments.get(invoice.apartment_id) ?? null) : null,
      booking: invoice.booking_id ? (bookings.get(invoice.booking_id) ?? null) : null,
      items: (itemsByInvoice.get(invoice.id) ?? []).sort((a, b) => a.position - b.position),
      paid: paidAmount,
      balance: invoice.total - paidAmount,
    };
  });
}

export function joinPayments(snapshot: Snapshot): PaymentWithRelations[] {
  const guests = new Map(snapshot.guests.map((g) => [g.id, g]));
  const apartments = new Map(snapshot.apartments.map((a) => [a.id, a]));
  const bookings = new Map(snapshot.bookings.map((b) => [b.id, b]));

  return snapshot.payments.map((payment) => {
    const booking = payment.booking_id ? (bookings.get(payment.booking_id) ?? null) : null;
    const guestId = payment.guest_id ?? booking?.guest_id ?? null;
    return {
      ...payment,
      booking,
      guest: guestId ? (guests.get(guestId) ?? null) : null,
      apartment: booking ? (apartments.get(booking.apartment_id) ?? null) : null,
    };
  });
}

export function joinExpenses(snapshot: Snapshot): ExpenseWithRelations[] {
  const apartments = new Map(snapshot.apartments.map((a) => [a.id, a]));
  return snapshot.expenses.map((expense) => ({
    ...expense,
    apartment: expense.apartment_id ? (apartments.get(expense.apartment_id) ?? null) : null,
  }));
}

export function joinTasks(snapshot: Snapshot): TaskWithRelations[] {
  const apartments = new Map(snapshot.apartments.map((a) => [a.id, a]));
  return snapshot.tasks.map((task) => ({
    ...task,
    apartment: apartments.get(task.apartment_id) ?? null,
  }));
}

/* ------------------------------------------------------------------ */
/* Supabase adapter                                                    */
/* ------------------------------------------------------------------ */

/**
 * Untyped view of the Supabase client.
 *
 * `supabase-js` resolves a row type from a *literal* table name; the helpers
 * below address tables generically (`insertRow("guests", …)`), which collapses
 * the inferred row to `never`. Reaching for the untyped client here and
 * re-asserting the domain type on the way out keeps the generic helpers while
 * leaving `Database` as the schema's source of truth for typed call sites.
 */
function db(): SupabaseClient {
  return getBrowserSupabase() as unknown as SupabaseClient;
}

/** How far back the working set reaches. Older rows stay queryable on demand. */
const SNAPSHOT_HISTORY_MONTHS = 18;

function historyCutoff(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - SNAPSHOT_HISTORY_MONTHS);
  return date.toISOString().slice(0, 10);
}

/**
 * A company the signed-in user belongs to.
 *
 * `memberships` is unique on (org_id, user_id), so one user can hold several of
 * these — the schema has always been multi-company. This is the app's view of
 * that list.
 */
export interface Workspace {
  orgId: string;
  name: string;
  role: string;
  currency: string;
}

/**
 * The company every query and mutation is scoped to.
 *
 * Held here rather than resolved per call so a switch takes effect atomically
 * across reads and writes. `WorkspaceProvider` owns the value; nothing else
 * should set it.
 */
let activeOrgId: string | null = null;

/**
 * Marker for "signed in, but not a member of any organisation".
 *
 * This is a normal state, not a fault: memberships are granted server-side, so
 * someone can authenticate before they have been given access. RLS then hides
 * every row from them. It is distinguished from a real failure so the UI can
 * explain the situation instead of showing a database error.
 */
export const NO_WORKSPACE = "NO_WORKSPACE";

export function setActiveOrg(orgId: string | null) {
  activeOrgId = orgId;
}

export function getActiveOrg(): string | null {
  return activeOrgId;
}

export function clearOrgCache() {
  activeOrgId = null;
}

/** Every company the caller belongs to, oldest membership first. */
export async function listWorkspaces(): Promise<Workspace[]> {
  const { data, error } = await db()
    .from("memberships")
    // Ordered so the "default" company is stable across sessions. The previous
    // `limit(1)` had no ORDER BY, which Postgres is free to answer differently
    // each time — invisible with one company, a lottery with two.
    .select("role, created_at, org_id, organizations(id, name, currency)")
    .order("created_at", { ascending: true })
    .order("org_id", { ascending: true });

  if (error) throw new Error(`Could not load your companies: ${error.message}`);

  return (data ?? []).flatMap((row) => {
    // PostgREST types an embedded row as possibly-array; normalise it.
    const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    if (!org) return [];
    return [{
      orgId: org.id as string,
      name: (org.name as string) ?? "Untitled company",
      role: row.role as string,
      currency: (org.currency as string) ?? "EUR",
    }];
  });
}

/** Creates a company and makes the caller its owner. Returns the new org id. */
export async function createWorkspace(input: {
  name: string;
  currency: string;
  timezone: string;
}): Promise<string> {
  const { data, error } = await db().rpc("create_organization", {
    org_name: input.name,
    org_currency: input.currency,
    org_timezone: input.timezone,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function leaveWorkspace(orgId: string): Promise<void> {
  const { error } = await db().rpc("leave_organization", { target_org: orgId });
  if (error) throw new Error(error.message);
}

async function currentOrgId(): Promise<string> {
  if (activeOrgId) return activeOrgId;

  // No explicit selection yet (first load, or a stored choice that no longer
  // matches a membership): fall back to the oldest company deterministically.
  const workspaces = await listWorkspaces();
  if (!workspaces.length) throw new Error(NO_WORKSPACE);
  activeOrgId = workspaces[0].orgId;
  return activeOrgId;
}

const supabaseRepository: Repository = {
  mode: "supabase",

  async snapshot() {
    const supabase = db();
    const orgId = await currentOrgId();
    const since = historyCutoff();

    const [
      organization,
      properties,
      apartments,
      guests,
      bookings,
      blocks,
      invoices,
      invoiceItems,
      payments,
      expenses,
      tasks,
      notes,
      notifications,
      activity,
      documents,
    ] = await Promise.all([
      supabase.from("organizations").select("*").eq("id", orgId).single(),
      supabase.from("properties").select("*").eq("org_id", orgId),
      supabase.from("apartments").select("*").eq("org_id", orgId).order("code"),
      supabase.from("guests").select("*").eq("org_id", orgId),
      supabase.from("bookings").select("*").eq("org_id", orgId).gte("check_out", since),
      supabase.from("calendar_blocks").select("*").eq("org_id", orgId).gte("end_date", since),
      supabase.from("invoices").select("*").eq("org_id", orgId).gte("issue_date", since),
      supabase.from("invoice_items").select("*").eq("org_id", orgId),
      supabase.from("payments").select("*").eq("org_id", orgId).gte("paid_at", since),
      supabase.from("expenses").select("*").eq("org_id", orgId).gte("expense_date", since),
      supabase.from("tasks").select("*").eq("org_id", orgId),
      supabase.from("notes").select("*").eq("org_id", orgId),
      supabase
        .from("notifications")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("activity_log")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("documents").select("*").eq("org_id", orgId),
    ]);

    const failure = [
      organization, properties, apartments, guests, bookings, blocks, invoices,
      invoiceItems, payments, expenses, tasks, notes, notifications, activity, documents,
    ].find((result) => result.error);
    if (failure?.error) throw new Error(failure.error.message);

    return {
      organization: organization.data as Organization,
      properties: (properties.data ?? []) as Property[],
      apartments: (apartments.data ?? []) as Apartment[],
      guests: (guests.data ?? []) as Guest[],
      bookings: (bookings.data ?? []) as Booking[],
      blocks: (blocks.data ?? []) as CalendarBlock[],
      invoices: (invoices.data ?? []) as Invoice[],
      invoiceItems: (invoiceItems.data ?? []) as InvoiceItem[],
      payments: (payments.data ?? []) as Payment[],
      expenses: (expenses.data ?? []) as Expense[],
      tasks: (tasks.data ?? []) as Task[],
      notes: (notes.data ?? []).map((row) => ({ ...row, author_name: null })) as Note[],
      notifications: (notifications.data ?? []) as unknown as AppNotification[],
      activity: (activity.data ?? []).map((row) => ({ ...row, actor_name: null })) as ActivityEntry[],
      documents: (documents.data ?? []) as DocumentRecord[],
    };
  },

  async createBooking(input) {
    const orgId = await currentOrgId();
    // `nights` is a generated column in Postgres; never send it.
    const { nights, ...rest } = input;
    void nights;
    const { data, error } = await db()
      .from("bookings")
      .insert({ ...rest, org_id: orgId })
      .select()
      .single();
    // The DB's exclusion constraint is the real overbooking guard; surface it
    // as a message the booking form can show inline.
    if (error) throw new Error(translateConflict(error.message));
    return data as Booking;
  },

  async updateBooking(id, changes) {
    const { nights, ...rest } = changes;
    void nights;
    const { data, error } = await db()
      .from("bookings")
      .update(rest)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(translateConflict(error.message));
    return data as Booking;
  },

  async deleteBooking(id) {
    const { error } = await db().from("bookings").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  createGuest: (input) => insertRow("guests", input),
  updateGuest: (id, changes) => updateRow("guests", id, changes),
  deleteGuest: (id) => deleteRow("guests", id),

  createApartment: (input) => insertRow("apartments", input),
  updateApartment: (id, changes) => updateRow("apartments", id, changes),
  deleteApartment: (id) => deleteRow("apartments", id),

  createExpense: (input) => insertRow("expenses", input),
  updateExpense: (id, changes) => updateRow("expenses", id, changes),
  deleteExpense: (id) => deleteRow("expenses", id),

  createPayment: (input) => insertRow("payments", input),
  updatePayment: (id, changes) => updateRow("payments", id, changes),
  deletePayment: (id) => deleteRow("payments", id),

  async createInvoice(input, items) {
    const orgId = await currentOrgId();
    const supabase = db();
    const { data, error } = await supabase
      .from("invoices")
      .insert({ ...input, org_id: orgId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    if (items.length) {
      const { error: itemError } = await supabase.from("invoice_items").insert(
        items.map((item, index) => ({
          ...item,
          org_id: orgId,
          invoice_id: data.id,
          position: index,
        })),
      );
      if (itemError) throw new Error(itemError.message);
    }
    return data as Invoice;
  },
  updateInvoice: (id, changes) => updateRow("invoices", id, changes),
  deleteInvoice: (id) => deleteRow("invoices", id),

  createTask: (input) => insertRow("tasks", input),
  updateTask: (id, changes) => updateRow("tasks", id, changes),
  deleteTask: (id) => deleteRow("tasks", id),

  createBlock: (input) => insertRow("calendar_blocks", input),
  deleteBlock: (id) => deleteRow("calendar_blocks", id),

  async addNote(input) {
    const orgId = await currentOrgId();
    const { data, error } = await db()
      .from("notes")
      .insert({ ...input, org_id: orgId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { ...data, author_name: null } as Note;
  },

  async updateOrganization(changes) {
    const orgId = await currentOrgId();
    const { data, error } = await db()
      .from("organizations")
      .update(changes)
      .eq("id", orgId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Organization;
  },

  async markNotificationRead(id) {
    const { error } = await db()
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
  },

  async markAllNotificationsRead() {
    const orgId = await currentOrgId();
    const { error } = await db()
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
  },
};

type WritableTable =
  | "guests" | "apartments" | "expenses" | "payments" | "tasks"
  | "calendar_blocks" | "invoices";

async function insertRow<T>(table: WritableTable, values: object): Promise<T> {
  const orgId = await currentOrgId();
  const { data, error } = await db()
    .from(table)
    .insert({ ...values, org_id: orgId })
    .select()
    .single();
  if (error) throw new Error(translateConflict(error.message));
  return data as T;
}

async function updateRow<T>(table: WritableTable, id: string, values: object): Promise<T> {
  const { data, error } = await db()
    .from(table)
    .update(values)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(translateConflict(error.message));
  return data as T;
}

async function deleteRow(table: WritableTable, id: string): Promise<void> {
  const { error } = await db().from(table).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Turns Postgres constraint noise into something a user can act on. */
function translateConflict(message: string): string {
  if (message.includes("bookings_no_overlap")) {
    return "Those dates overlap an existing booking for this apartment.";
  }
  if (message.includes("bookings_dates_valid")) {
    return "Check-out must be after check-in.";
  }
  if (message.includes("duplicate key")) {
    return "A record with that reference already exists.";
  }
  return message;
}

/* ------------------------------------------------------------------ */

export const repository: Repository = supabaseRepository;
