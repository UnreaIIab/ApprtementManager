"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import { exportCsv, matches } from "@/lib/utils";
import { useT } from "@/i18n";
import { formatDate, fullName, money } from "@/lib/format";
import { useBookings, useDeleteGuest, useGuests } from "@/data/queries";
import { useQueryParam } from "@/hooks/use-query-param";
import { PageHeader, FilterBar } from "@/components/layout/page-header";
import { DataTable, type Column, type SortState } from "@/components/ui/data-table";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/feedback";
import { Menu } from "@/components/ui/menu";
import { useConfirm } from "@/components/ui/overlay";
import { GuestQuickAdd } from "@/components/guests/guest-quick-add";
import type { Guest } from "@/types/domain";

type Segment = "all" | "vip" | "repeat" | "blacklisted" | "in_house";

export default function GuestsPage() {
  return (
    <Suspense fallback={null}>
      <GuestsView />
    </Suspense>
  );
}

function GuestsView() {
  const t = useT();
  const router = useRouter();
  const [newParam, clearNewParam] = useQueryParam("new");
  const { data: guests, isLoading } = useGuests();
  const { data: bookings } = useBookings();
  const deleteGuest = useDeleteGuest();
  const { confirm, dialog } = useConfirm();

  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<Segment>("all");
  const [sort, setSort] = useState<SortState | null>({ key: "lastStay", direction: "desc" });
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const today = new Date().toISOString().slice(0, 10);

  /** Stay history per guest — the basis for every column and segment here. */
  const stats = useMemo(() => {
    const map = new Map<
      string,
      { stays: number; nights: number; spend: number; lastStay: string; balance: number; inHouse: boolean }
    >();
    for (const booking of bookings) {
      if (booking.status === "cancelled" || booking.status === "no_show") continue;
      const entry = map.get(booking.guest_id) ?? {
        stays: 0, nights: 0, spend: 0, lastStay: "", balance: 0, inHouse: false,
      };
      entry.stays += 1;
      entry.nights += booking.nights;
      entry.spend += booking.total;
      entry.balance += booking.balance;
      if (booking.check_in > entry.lastStay) entry.lastStay = booking.check_in;
      if (booking.check_in <= today && booking.check_out > today) entry.inHouse = true;
      map.set(booking.guest_id, entry);
    }
    return map;
  }, [bookings, today]);

  const rows = useMemo(() => {
    return guests
      .map((guest) => ({
        guest,
        stats: stats.get(guest.id) ?? {
          stays: 0, nights: 0, spend: 0, lastStay: "", balance: 0, inHouse: false,
        },
      }))
      .filter(({ guest, stats: entry }) => {
        if (segment === "vip" && !guest.is_vip) return false;
        if (segment === "blacklisted" && !guest.is_blacklisted) return false;
        if (segment === "repeat" && entry.stays < 2) return false;
        if (segment === "in_house" && !entry.inHouse) return false;
        if (query.trim()) {
          const haystack = `${fullName(guest)} ${guest.email ?? ""} ${guest.phone ?? ""} ${guest.nationality ?? ""} ${guest.id_number ?? ""}`;
          if (!matches(haystack, query)) return false;
        }
        return true;
      });
  }, [guests, stats, segment, query]);

  type Row = (typeof rows)[number];

  const remove = async (guest: Guest) => {
    const ok = await confirm({
      title: t.guests.deleteGuestConfirm(fullName(guest)),
      message: t.guests.profileRemoved,
      confirmLabel: t.guests.deleteGuest,
      destructive: true,
    });
    if (ok) deleteGuest.mutate(guest.id);
  };

  const exportRows = (list: Row[]) =>
    exportCsv(
      "guests.csv",
      list.map(({ guest, stats: entry }) => ({
        first_name: guest.first_name,
        last_name: guest.last_name,
        email: guest.email ?? "",
        phone: guest.phone ?? "",
        nationality: guest.nationality ?? "",
        vip: guest.is_vip ? "yes" : "no",
        blacklisted: guest.is_blacklisted ? "yes" : "no",
        stays: entry.stays,
        nights: entry.nights,
        lifetime_value: (entry.spend / 100).toFixed(2),
        outstanding: (entry.balance / 100).toFixed(2),
        last_stay: entry.lastStay || "",
      })),
    );

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Guest",
      sortValue: (row) => `${row.guest.last_name} ${row.guest.first_name}`,
      cell: (row) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={fullName(row.guest)} size={34} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <Link
                href={`/guests/${row.guest.id}`}
                className="truncate font-medium text-ink hover:underline"
              >
                {fullName(row.guest)}
              </Link>
              {row.guest.is_vip ? <Badge tone="brand">VIP</Badge> : null}
              {row.guest.is_blacklisted ? <Badge tone="critical">{t.status.apartment.blocked}</Badge> : null}
              {row.stats.inHouse ? <Badge tone="info">{t.guests.inHouse}</Badge> : null}
            </span>
            <span className="block truncate text-[12px] text-ink-3">
              {row.guest.email ?? row.guest.phone ?? "—"}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "nationality",
      header: "Nationality",
      secondary: true,
      sortValue: (row) => row.guest.nationality ?? "",
      cell: (row) => <span className="text-ink-2">{row.guest.nationality ?? "—"}</span>,
    },
    {
      key: "phone",
      header: "Phone",
      secondary: true,
      sortValue: (row) => row.guest.phone ?? "",
      cell: (row) => <span className="text-ink-2 tnum">{row.guest.phone ?? "—"}</span>,
    },
    {
      key: "stays",
      header: "Stays",
      align: "right",
      sortValue: (row) => row.stats.stays,
      cell: (row) => <span className="text-ink tnum">{row.stats.stays}</span>,
    },
    {
      key: "nights",
      header: "Nights",
      align: "right",
      secondary: true,
      sortValue: (row) => row.stats.nights,
      cell: (row) => <span className="text-ink-2 tnum">{row.stats.nights}</span>,
    },
    {
      key: "spend",
      header: t.guests.lifetimeValue,
      align: "right",
      sortValue: (row) => row.stats.spend,
      cell: (row) => <span className="font-medium text-ink tnum">{money(row.stats.spend)}</span>,
    },
    {
      key: "balance",
      header: "Outstanding",
      align: "right",
      sortValue: (row) => row.stats.balance,
      cell: (row) => (
        <span className={row.stats.balance > 0 ? "font-medium text-serious tnum" : "text-ink-3 tnum"}>
          {money(row.stats.balance)}
        </span>
      ),
    },
    {
      key: "lastStay",
      header: t.guests.lastStay,
      align: "right",
      sortValue: (row) => row.stats.lastStay,
      cell: (row) => (
        <span className="text-ink-2 tnum">
          {row.stats.lastStay ? formatDate(row.stats.lastStay) : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "48px",
      cell: (row) => (
        <span onClick={(event) => event.stopPropagation()}>
          <Menu
            align="end"
            trigger={({ toggle, ref }) => (
              <IconButton
                ref={ref}
                label={t.guests.guestActions}
                onClick={toggle}
                icon={<MoreHorizontal className="size-4" />}
              />
            )}
            items={[
              { label: t.guests.openProfile, onSelect: () => router.push(`/guests/${row.guest.id}`) },
              {
                label: t.calendar.newBooking,
                icon: <Plus />,
                onSelect: () => router.push("/bookings?new=1"),
              },
              {
                label: t.common.delete,
                icon: <Trash2 />,
                destructive: true,
                separatorBefore: true,
                onSelect: () => void remove(row.guest),
              },
            ]}
          />
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t.guests.title}
        description={`${rows.length} of ${guests.length} profiles`}
        actions={
          <>
            <Button
              variant="outline"
              icon={<Download className="size-4" />}
              onClick={() => exportRows(rows)}
            >
              Export
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAddOpen(true)}>
              Add guest
            </Button>
          </>
        }
      />

      <FilterBar>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.guests.searchPlaceholder}
            aria-label={t.guests.searchGuests}
            className="h-9 w-[260px] pl-9 text-[13px]"
          />
        </div>

        <Select
          aria-label={t.guests.segment}
          value={segment}
          onChange={(event) => setSegment(event.target.value as Segment)}
          className="h-9 w-[170px] text-[13px]"
        >
          <option value="all">{t.guests.allGuests}</option>
          <option value="in_house">{t.guests.currentlyInHouse}</option>
          <option value="repeat">{t.guests.repeatGuests}</option>
          <option value="vip">VIP</option>
          <option value="blacklisted">{t.guests.blacklisted}</option>
        </Select>
      </FilterBar>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.guest.id}
        loading={isLoading}
        sort={sort}
        onSortChange={setSort}
        onRowClick={(row) => router.push(`/guests/${row.guest.id}`)}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        maxHeight="calc(100dvh - 300px)"
        emptyTitle={t.guests.noMatch}
        emptyDescription={t.ui.tryDifferentSearch}
        bulkActions={(ids) => (
          <Button
            size="sm"
            variant="outline"
            icon={<Download className="size-3.5" />}
            onClick={() => exportRows(rows.filter((row) => ids.includes(row.guest.id)))}
          >
            Export selected
          </Button>
        )}
      />

      <GuestQuickAdd
        open={addOpen || Boolean(newParam)}
        onClose={() => {
          setAddOpen(false);
          if (newParam) clearNewParam();
        }}
      />
      {dialog}
    </>
  );
}
