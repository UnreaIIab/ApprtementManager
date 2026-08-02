"use client";

import { useMemo } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useWorkspace, workspaceKeys } from "@/hooks/use-workspace";
import { configureFormatting } from "@/lib/format";
import {
  joinBookings,
  joinExpenses,
  joinInvoices,
  joinPayments,
  joinTasks,
  createWorkspace,
  leaveWorkspace,
  repository,
  type NewApartment,
  type NewBlock,
  type NewBooking,
  type NewExpense,
  type NewGuest,
  type NewInvoice,
  type NewInvoiceItem,
  type NewPayment,
  type NewTask,
  type Snapshot,
} from "@/data/repository";
import type {
  Apartment,
  Booking,
  CalendarBlock,
  Expense,
  Guest,
  Invoice,
  Organization,
  Payment,
  Task,
} from "@/types/domain";

export const queryKeys = {
  /**
   * Scoped by company. Without the org in the key, switching companies would
   * serve the previous one's cached rows — not a security hole (RLS still
   * applies server-side) but plainly the wrong numbers on screen.
   *
   * Invalidation still uses the `["snapshot"]` prefix, which React Query
   * matches partially, so mutations refresh whichever company is active.
   */
  snapshot: (orgId: string | null) => ["snapshot", orgId] as const,
  snapshotRoot: ["snapshot"] as const,
};

/**
 * The one server query in the app.
 *
 * Everything else is a memoised projection of this snapshot, which keeps the
 * numbers on any given screen mutually consistent and makes cross-entity
 * filtering (a guest's invoices, an apartment's expenses) a local operation.
 */
export function useSnapshot() {
  const { activeOrgId } = useWorkspace();

  return useQuery({
    queryKey: queryKeys.snapshot(activeOrgId),
    queryFn: async () => {
      const snapshot = await repository.snapshot();
      // Money formatting is module-level state, so it has to be configured
      // before anything renders with it. Doing it here — rather than in an
      // effect — guarantees that: any render holding this data necessarily
      // happens after the fetch resolved. Saving org settings invalidates the
      // snapshot, so a currency change flows through the same path.
      configureFormatting(
        snapshot.organization.currency,
        snapshot.organization.locale,
      );
      return snapshot;
    },
    staleTime: 60_000,
  });
}

/** Narrow, memoised views over the snapshot. */
export function useProjection<T>(select: (snapshot: Snapshot) => T, fallback: T) {
  const { data, ...rest } = useSnapshot();
  const value = useMemo(() => (data ? select(data) : fallback), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data: value, ...rest };
}

export function useOrganization() {
  const { data } = useSnapshot();
  return data?.organization ?? null;
}

export function useApartments() {
  return useProjection((s) => s.apartments, [] as Apartment[]);
}

export function useGuests() {
  return useProjection((s) => s.guests, [] as Guest[]);
}

export function useBookings() {
  return useProjection(joinBookings, []);
}

export function useInvoices() {
  return useProjection(joinInvoices, []);
}

export function usePayments() {
  return useProjection(joinPayments, []);
}

export function useExpenses() {
  return useProjection(joinExpenses, []);
}

export function useTasks() {
  return useProjection(joinTasks, []);
}

export function useBlocks() {
  return useProjection((s) => s.blocks, [] as CalendarBlock[]);
}

export function useNotifications() {
  return useProjection((s) => s.notifications, []);
}

export function useActivity(entityType?: string, entityId?: string) {
  const { data } = useSnapshot();
  return useMemo(() => {
    if (!data) return [];
    if (!entityType || !entityId) return data.activity;
    return data.activity.filter(
      (entry) => entry.entity_type === entityType && entry.entity_id === entityId,
    );
  }, [data, entityType, entityId]);
}

export function useNotes(entityType: string, entityId: string | undefined) {
  const { data } = useSnapshot();
  return useMemo(() => {
    if (!data || !entityId) return [];
    return data.notes
      .filter((note) => note.entity_type === entityType && note.entity_id === entityId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [data, entityType, entityId]);
}

export function useDocuments(entityType: string, entityId: string | undefined) {
  const { data } = useSnapshot();
  return useMemo(() => {
    if (!data || !entityId) return [];
    return data.documents.filter(
      (doc) => doc.entity_type === entityType && doc.entity_id === entityId,
    );
  }, [data, entityType, entityId]);
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

/**
 * Shared mutation wrapper: invalidates the snapshot on success and surfaces
 * failures as a toast, so no call site has to repeat that plumbing.
 */
function useAppMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  messages: { success?: string | ((data: TData) => string); error?: string },
  options?: Omit<UseMutationOptions<TData, Error, TVariables>, "mutationFn">,
) {
  const queryClient = useQueryClient();
  return useMutation<TData, Error, TVariables>({
    mutationFn,
    ...options,
    onSuccess: (...args) => {
      const [data] = args;
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshotRoot });
      if (messages.success) {
        toast.success(
          typeof messages.success === "function" ? messages.success(data) : messages.success,
        );
      }
      options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(messages.error ?? "Something went wrong", { description: error.message });
      options?.onError?.(...args);
    },
  });
}

export function useCreateBooking() {
  return useAppMutation<Booking, NewBooking>(
    (input) => repository.createBooking(input),
    { success: (booking) => `Booking ${booking.reference} created`, error: "Could not create booking" },
  );
}

export function useUpdateBooking() {
  return useAppMutation<Booking, { id: string; patch: Partial<Booking>; silent?: boolean }>(
    ({ id, patch }) => repository.updateBooking(id, patch),
    { success: "Booking updated", error: "Could not update booking" },
  );
}

export function useDeleteBooking() {
  return useAppMutation<void, string>(
    (id) => repository.deleteBooking(id),
    { success: "Booking deleted", error: "Could not delete booking" },
  );
}

export function useCreateGuest() {
  return useAppMutation<Guest, NewGuest>(
    (input) => repository.createGuest(input),
    { success: "Guest added", error: "Could not add guest" },
  );
}

export function useUpdateGuest() {
  return useAppMutation<Guest, { id: string; patch: Partial<Guest> }>(
    ({ id, patch }) => repository.updateGuest(id, patch),
    { success: "Guest updated", error: "Could not update guest" },
  );
}

export function useDeleteGuest() {
  return useAppMutation<void, string>(
    (id) => repository.deleteGuest(id),
    { success: "Guest deleted", error: "Could not delete guest" },
  );
}

export function useCreateApartment() {
  return useAppMutation<Apartment, NewApartment>(
    (input) => repository.createApartment(input),
    { success: "Apartment added", error: "Could not add apartment" },
  );
}

export function useUpdateApartment() {
  return useAppMutation<Apartment, { id: string; patch: Partial<Apartment> }>(
    ({ id, patch }) => repository.updateApartment(id, patch),
    { success: "Apartment updated", error: "Could not update apartment" },
  );
}

export function useDeleteApartment() {
  return useAppMutation<void, string>(
    (id) => repository.deleteApartment(id),
    { success: "Apartment removed", error: "Could not remove apartment" },
  );
}

export function useCreateExpense() {
  return useAppMutation<Expense, NewExpense>(
    (input) => repository.createExpense(input),
    { success: "Expense recorded", error: "Could not record expense" },
  );
}

export function useUpdateExpense() {
  return useAppMutation<Expense, { id: string; patch: Partial<Expense> }>(
    ({ id, patch }) => repository.updateExpense(id, patch),
    { success: "Expense updated", error: "Could not update expense" },
  );
}

export function useDeleteExpense() {
  return useAppMutation<void, string>(
    (id) => repository.deleteExpense(id),
    { success: "Expense deleted", error: "Could not delete expense" },
  );
}

export function useCreatePayment() {
  return useAppMutation<Payment, NewPayment>(
    (input) => repository.createPayment(input),
    { success: "Payment recorded", error: "Could not record payment" },
  );
}

export function useDeletePayment() {
  return useAppMutation<void, string>(
    (id) => repository.deletePayment(id),
    { success: "Payment removed", error: "Could not remove payment" },
  );
}

export function useCreateInvoice() {
  return useAppMutation<Invoice, { invoice: NewInvoice; items: NewInvoiceItem[] }>(
    ({ invoice, items }) => repository.createInvoice(invoice, items),
    { success: (invoice) => `Invoice ${invoice.number} created`, error: "Could not create invoice" },
  );
}

export function useUpdateInvoice() {
  return useAppMutation<Invoice, { id: string; patch: Partial<Invoice> }>(
    ({ id, patch }) => repository.updateInvoice(id, patch),
    { success: "Invoice updated", error: "Could not update invoice" },
  );
}

export function useDeleteInvoice() {
  return useAppMutation<void, string>(
    (id) => repository.deleteInvoice(id),
    { success: "Invoice deleted", error: "Could not delete invoice" },
  );
}

export function useCreateTask() {
  return useAppMutation<Task, NewTask>(
    (input) => repository.createTask(input),
    { success: "Task created", error: "Could not create task" },
  );
}

export function useUpdateTask() {
  return useAppMutation<Task, { id: string; patch: Partial<Task> }>(
    ({ id, patch }) => repository.updateTask(id, patch),
    { success: "Task updated", error: "Could not update task" },
  );
}

export function useCreateBlock() {
  return useAppMutation<CalendarBlock, NewBlock>(
    (input) => repository.createBlock(input),
    { success: "Dates blocked", error: "Could not block those dates" },
  );
}

export function useDeleteBlock() {
  return useAppMutation<void, string>(
    (id) => repository.deleteBlock(id),
    { success: "Block removed", error: "Could not remove block" },
  );
}

export function useAddNote() {
  return useAppMutation<unknown, { entity_type: string; entity_id: string; body: string }>(
    (input) => repository.addNote(input),
    { success: "Note added", error: "Could not add note" },
  );
}

export function useUpdateOrganization() {
  return useAppMutation<Organization, Partial<Organization>>(
    (patch) => repository.updateOrganization(patch),
    { success: "Settings saved", error: "Could not save settings" },
  );
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repository.markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.snapshotRoot }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => repository.markAllNotificationsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.snapshotRoot }),
  });
}

/* ------------------------------------------------------------------ */
/* Companies                                                           */
/* ------------------------------------------------------------------ */

/**
 * Creating a company goes through a SECURITY DEFINER function rather than a
 * direct insert: `organizations` and `memberships` deliberately have no INSERT
 * policy, because a client-side insert into `memberships` would let anyone
 * grant themselves access to any company.
 */
export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; currency: string; timezone: string }) =>
      createWorkspace(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
      toast.success("Company created");
    },
    onError: (error: Error) =>
      toast.error("Could not create the company", { description: error.message }),
  });
}

export function useLeaveWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orgId: string) => leaveWorkspace(orgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
      queryClient.removeQueries({ queryKey: queryKeys.snapshotRoot });
      toast.success("You have left the company");
    },
    onError: (error: Error) =>
      toast.error("Could not leave the company", { description: error.message }),
  });
}
