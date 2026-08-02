"use client";

import { useMemo } from "react";
import { useSnapshot } from "@/data/queries";
import { matches, normalize } from "@/lib/utils";
import { formatDate, money } from "@/lib/format";
import { BOOKING_SOURCE_LABELS, EXPENSE_CATEGORY_LABELS } from "@/lib/constants";
import type { SearchHit } from "@/types/domain";

/**
 * Global search index.
 *
 * Built once from the in-memory snapshot and re-used by both the top-bar search
 * and the command palette, so the two never disagree about what exists. Each
 * entry carries a pre-normalised haystack so keystroke filtering is a plain
 * substring scan rather than repeated string building.
 */
interface IndexedHit extends SearchHit {
  haystack: string;
  /** Higher sorts first when scores tie — keeps live records above archives. */
  weight: number;
}

export function useSearchIndex(): IndexedHit[] {
  const { data } = useSnapshot();

  return useMemo(() => {
    if (!data) return [];
    const guests = new Map(data.guests.map((guest) => [guest.id, guest]));
    const apartments = new Map(data.apartments.map((apartment) => [apartment.id, apartment]));
    const index: IndexedHit[] = [];

    const push = (hit: SearchHit, extra: string, weight: number) => {
      index.push({
        ...hit,
        weight,
        haystack: normalize(`${hit.title} ${hit.subtitle} ${hit.meta ?? ""} ${extra}`),
      });
    };

    for (const apartment of data.apartments) {
      push(
        {
          id: apartment.id,
          type: "apartment",
          title: apartment.name,
          subtitle: `${apartment.code} · ${apartment.bedrooms} bed · ${apartment.city ?? ""}`,
          meta: money(apartment.nightly_rate, { cents: false }) + " / night",
          href: `/apartments/${apartment.id}`,
        },
        `${apartment.address ?? ""} ${apartment.amenities.join(" ")}`,
        3,
      );
    }

    for (const guest of data.guests) {
      push(
        {
          id: guest.id,
          type: "guest",
          title: `${guest.first_name} ${guest.last_name}`,
          subtitle: guest.email ?? guest.phone ?? "Guest",
          meta: guest.nationality ?? undefined,
          href: `/guests/${guest.id}`,
        },
        `${guest.phone ?? ""} ${guest.id_number ?? ""} ${guest.tags.join(" ")}`,
        2,
      );
    }

    for (const booking of data.bookings) {
      const guest = guests.get(booking.guest_id);
      const apartment = apartments.get(booking.apartment_id);
      push(
        {
          id: booking.id,
          type: "booking",
          title: booking.reference,
          subtitle: `${guest ? `${guest.first_name} ${guest.last_name}` : "Guest"} · ${apartment?.name ?? ""}`,
          meta: `${formatDate(booking.check_in, "MMM D")} – ${formatDate(booking.check_out, "MMM D, YYYY")}`,
          href: `/bookings?booking=${booking.id}`,
        },
        `${BOOKING_SOURCE_LABELS[booking.source]} ${booking.status} ${guest?.email ?? ""}`,
        // Cancelled stays stay searchable but rank below live ones.
        booking.status === "cancelled" || booking.status === "no_show" ? 1 : 4,
      );
    }

    for (const invoice of data.invoices) {
      const guest = invoice.guest_id ? guests.get(invoice.guest_id) : null;
      push(
        {
          id: invoice.id,
          type: "invoice",
          title: invoice.number,
          subtitle: guest ? `${guest.first_name} ${guest.last_name}` : "Invoice",
          meta: `${money(invoice.total)} · ${invoice.status}`,
          href: `/invoices?invoice=${invoice.id}`,
        },
        invoice.status,
        2,
      );
    }

    for (const payment of data.payments) {
      const guest = payment.guest_id ? guests.get(payment.guest_id) : null;
      push(
        {
          id: payment.id,
          type: "payment",
          title: payment.reference ?? money(payment.amount),
          subtitle: `${guest ? `${guest.first_name} ${guest.last_name}` : "Payment"} · ${payment.method.replace("_", " ")}`,
          meta: formatDate(payment.paid_at),
          href: `/payments?payment=${payment.id}`,
        },
        `${payment.note ?? ""} ${payment.status}`,
        1,
      );
    }

    for (const expense of data.expenses) {
      if (!expense.vendor && !expense.description) continue;
      push(
        {
          id: expense.id,
          type: "expense",
          title: expense.vendor ?? EXPENSE_CATEGORY_LABELS[expense.category],
          subtitle: expense.description ?? EXPENSE_CATEGORY_LABELS[expense.category],
          meta: `${money(expense.amount)} · ${formatDate(expense.expense_date)}`,
          href: `/expenses?expense=${expense.id}`,
        },
        `${EXPENSE_CATEGORY_LABELS[expense.category]} ${expense.invoice_ref ?? ""}`,
        1,
      );
    }

    return index;
  }, [data]);
}

/**
 * Ranks by match position — a hit at the start of the title beats one buried
 * in an address — then by entity weight.
 */
export function searchIndex(index: IndexedHit[], query: string, limit = 20): SearchHit[] {
  const needle = normalize(query.trim());
  if (!needle) return [];

  const scored: { hit: IndexedHit; score: number }[] = [];
  for (const entry of index) {
    const position = entry.haystack.indexOf(needle);
    if (position === -1) continue;
    const titleHit = normalize(entry.title).startsWith(needle) ? 100 : 0;
    scored.push({ hit: entry, score: titleHit + entry.weight * 4 - Math.min(position, 60) });
    // Bail out once we have a comfortable surplus to rank within.
    if (scored.length > limit * 12) break;
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ hit }) => ({
      id: hit.id,
      type: hit.type,
      title: hit.title,
      subtitle: hit.subtitle,
      meta: hit.meta,
      href: hit.href,
    }));
}

export function useSearch(query: string, limit = 20): SearchHit[] {
  const index = useSearchIndex();
  return useMemo(() => searchIndex(index, query, limit), [index, query, limit]);
}

export { matches };
