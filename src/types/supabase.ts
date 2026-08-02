import type {
  ActivityEntry,
  Apartment,
  AppNotification,
  Booking,
  CalendarBlock,
  DocumentRecord,
  Expense,
  Guest,
  Invoice,
  InvoiceItem,
  Note,
  Organization,
  Payment,
  Property,
  Task,
} from "@/types/domain";

/**
 * Typed surface for `supabase-js`.
 *
 * The domain types in `types/domain.ts` are deliberately shaped to match the
 * table columns, so this file composes them rather than restating every column.
 * Regenerate with `supabase gen types typescript` if the schema drifts.
 */

type Timestamps = { created_at: string; updated_at: string };

type TableDef<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

type ViewDef<Row> = { Row: Row; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      organizations: TableDef<Organization & Timestamps>;
      profiles: TableDef<{
        id: string;
        full_name: string | null;
        avatar_url: string | null;
        phone: string | null;
      } & Timestamps>;
      memberships: TableDef<{
        id: string;
        org_id: string;
        user_id: string;
        role: string;
        created_at: string;
      }>;
      properties: TableDef<Property & Timestamps>;
      apartments: TableDef<Apartment & { updated_at: string }>;
      apartment_rates: TableDef<{
        id: string;
        org_id: string;
        apartment_id: string;
        label: string | null;
        start_date: string;
        end_date: string;
        nightly_rate: number;
        min_nights: number | null;
        created_at: string;
      }>;
      guests: TableDef<Guest & { updated_at: string }>;
      bookings: TableDef<Booking & { created_by: string | null; updated_at: string }>;
      calendar_blocks: TableDef<CalendarBlock & { created_at: string }>;
      invoices: TableDef<Invoice & { pdf_url: string | null; voided_at: string | null; updated_at: string }>;
      invoice_items: TableDef<InvoiceItem & { org_id: string }>;
      payments: TableDef<Payment & { created_at: string }>;
      expenses: TableDef<Expense & Timestamps>;
      tasks: TableDef<Task & Timestamps>;
      documents: TableDef<DocumentRecord & { uploaded_by: string | null }>;
      notes: TableDef<Omit<Note, "author_name"> & { author_id: string | null }>;
      notifications: TableDef<
        Omit<AppNotification, "severity"> & { user_id: string | null; severity: string }
      >;
      activity_log: TableDef<
        Omit<ActivityEntry, "actor_name"> & { actor_id: string | null }
      >;
    };
    Views: {
      booking_balances: ViewDef<{
        booking_id: string;
        org_id: string;
        total: number;
        paid: number;
        balance: number;
      }>;
      booking_nights: ViewDef<{
        org_id: string;
        booking_id: string;
        apartment_id: string;
        source: string;
        night: string;
        night_revenue: number;
      }>;
    };
    Functions: {
      auth_org_ids: { Args: Record<string, never>; Returns: string[] };
      is_org_member: { Args: { target: string }; Returns: boolean };
    };
    Enums: {
      apartment_status: Apartment["status"];
      booking_status: Booking["status"];
      booking_source: Booking["source"];
      payment_method: Payment["method"];
      payment_status: Payment["status"];
      invoice_status: Invoice["status"];
      expense_category: Expense["category"];
      task_type: Task["type"];
      task_status: Task["status"];
      member_role: "owner" | "admin" | "manager" | "staff" | "viewer";
    };
    CompositeTypes: Record<string, never>;
  };
};
