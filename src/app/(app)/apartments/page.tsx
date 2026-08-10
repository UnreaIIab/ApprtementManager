"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2, Download, LayoutGrid, List, MoreHorizontal, Pencil, Plus, Search, Trash2,
} from "lucide-react";
import { exportCsv, matches } from "@/lib/utils";
import { useT } from "@/i18n";
import { fullName, money, percent } from "@/lib/format";
import { APARTMENT_STATUS_META } from "@/lib/constants";
import { APARTMENT_STATUSES, type ApartmentStatus } from "@/types/domain";
import { toISODate, dayjs } from "@/lib/date-range";
import { useAnalytics } from "@/hooks/use-analytics";
import { useApartments, useBookings, useDeleteApartment } from "@/data/queries";
import { useDateFilter } from "@/hooks/use-date-filter";
import { useQueryParam } from "@/hooks/use-query-param";
import { PageHeader, FilterBar } from "@/components/layout/page-header";
import { DataTable, type Column, type SortState } from "@/components/ui/data-table";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, Progress } from "@/components/ui/feedback";
import { Menu } from "@/components/ui/menu";
import { useConfirm } from "@/components/ui/overlay";
import { StatusTile } from "@/components/dashboard/kpi-card";
import { ApartmentImage } from "@/components/apartments/apartment-image";
import { ApartmentFormDrawer } from "@/components/apartments/apartment-form";
import type { Apartment, ApartmentPerformance } from "@/types/domain";

export default function ApartmentsPage() {
  return (
    <Suspense fallback={null}>
      <ApartmentsView />
    </Suspense>
  );
}

function ApartmentsView() {
  const t = useT();
  const router = useRouter();
  const { label } = useDateFilter();
  const [newParam, clearNewParam] = useQueryParam("new");
  const { data: apartments, isLoading } = useApartments();
  const { data: bookings } = useBookings();
  const { apartmentPerformance } = useAnalytics();
  const deleteApartment = useDeleteApartment();
  const { confirm, dialog } = useConfirm();

  const [view, setView] = useState<"grid" | "table">("grid");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ApartmentStatus | "all">("all");
  const [bedroomFilter, setBedroomFilter] = useState("all");
  const [sort, setSort] = useState<SortState | null>({ key: "revenue", direction: "desc" });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Apartment | null>(null);

  const today = toISODate(dayjs());

  /** Who is staying in each apartment right now. */
  const currentGuests = useMemo(() => {
    const map = new Map<string, string>();
    for (const booking of bookings) {
      if (booking.status === "cancelled" || booking.status === "no_show") continue;
      if (booking.check_in <= today && booking.check_out > today) {
        map.set(booking.apartment_id, fullName(booking.guest));
      }
    }
    return map;
  }, [bookings, today]);

  const performanceById = useMemo(
    () => new Map(apartmentPerformance.map((row) => [row.apartment.id, row])),
    [apartmentPerformance],
  );

  const statusCounts = useMemo(() => {
    const counts = new Map<ApartmentStatus, number>();
    for (const status of APARTMENT_STATUSES) counts.set(status, 0);
    for (const apartment of apartments) {
      counts.set(apartment.status, (counts.get(apartment.status) ?? 0) + 1);
    }
    return counts;
  }, [apartments]);

  const filtered = useMemo(
    () =>
      apartments.filter((apartment) => {
        if (statusFilter !== "all" && apartment.status !== statusFilter) return false;
        if (bedroomFilter !== "all" && String(apartment.bedrooms) !== bedroomFilter) return false;
        if (query.trim()) {
          const haystack = `${apartment.name} ${apartment.code} ${apartment.address ?? ""} ${apartment.city ?? ""}`;
          if (!matches(haystack, query)) return false;
        }
        return true;
      }),
    [apartments, statusFilter, bedroomFilter, query],
  );

  const rows = useMemo(
    () =>
      filtered.map((apartment) => ({
        apartment,
        performance: performanceById.get(apartment.id),
        currentGuest: currentGuests.get(apartment.id) ?? null,
      })),
    [filtered, performanceById, currentGuests],
  );

  const bedroomOptions = useMemo(
    () => Array.from(new Set(apartments.map((a) => a.bedrooms))).sort((a, b) => a - b),
    [apartments],
  );

  const exportRows = () =>
    exportCsv(
      "apartments.csv",
      rows.map(({ apartment, performance }) => ({
        code: apartment.code,
        name: apartment.name,
        city: apartment.city ?? "",
        bedrooms: apartment.bedrooms,
        bathrooms: apartment.bathrooms,
        capacity: apartment.capacity,
        status: APARTMENT_STATUS_META[apartment.status].label,
        nightly_rate: (apartment.nightly_rate / 100).toFixed(2),
        occupancy: performance ? (performance.occupancy * 100).toFixed(1) : "0",
        revenue: performance ? (performance.revenue / 100).toFixed(2) : "0",
        expenses: performance ? (performance.expenses / 100).toFixed(2) : "0",
        profit: performance ? (performance.profit / 100).toFixed(2) : "0",
      })),
    );

  const remove = async (apartment: Apartment) => {
    const ok = await confirm({
      title: `Remove ${apartment.name}?`,
      message:
        "The apartment will no longer appear in the calendar or reports. Existing bookings keep their history.",
      confirmLabel: t.apartments.removeApartment,
      destructive: true,
    });
    if (ok) deleteApartment.mutate(apartment.id);
  };

  type Row = (typeof rows)[number];

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: t.change.apartment,
      sortValue: (row) => row.apartment.name,
      cell: (row) => (
        <span className="flex items-center gap-3">
          <ApartmentImage
            code={row.apartment.code}
            name={row.apartment.name}
            src={row.apartment.cover_image}
            className="size-10 shrink-0"
            rounded="rounded-lg"
          />
          <span className="min-w-0">
            <Link
              href={`/apartments/${row.apartment.id}`}
              className="block truncate font-medium text-ink hover:underline"
            >
              {row.apartment.name}
            </Link>
            <span className="block truncate text-[12px] text-ink-3">
              {row.apartment.code} · {row.apartment.city ?? "—"}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "layout",
      header: t.apartments.layout,
      secondary: true,
      sortValue: (row) => row.apartment.bedrooms,
      cell: (row) => (
        <span className="text-[13px] text-ink-2 tnum">
          {row.apartment.bedrooms} bed · {row.apartment.bathrooms} bath · sleeps{" "}
          {row.apartment.capacity}
        </span>
      ),
    },
    {
      key: "status",
      header: t.common.status,
      sortValue: (row) => row.apartment.status,
      cell: (row) => (
        <span className="block">
          <StatusBadge size="sm" meta={APARTMENT_STATUS_META[row.apartment.status]} />
          {row.currentGuest ? (
            <span className="mt-1 block truncate text-[11.5px] text-ink-3">
              {row.currentGuest}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "rate",
      header: t.apartments.rate,
      align: "right",
      sortValue: (row) => row.apartment.nightly_rate,
      cell: (row) => (
        <span className="text-ink tnum">{money(row.apartment.nightly_rate, { cents: false })}</span>
      ),
    },
    {
      key: "occupancy",
      header: t.dashboard.occupancy,
      align: "right",
      sortValue: (row) => row.performance?.occupancy ?? 0,
      cell: (row) => (
        <span className="inline-flex w-24 flex-col items-end gap-1">
          <span className="text-ink tnum">{percent(row.performance?.occupancy ?? 0, 0)}</span>
          <Progress value={row.performance?.occupancy ?? 0} tone="info" />
        </span>
      ),
    },
    {
      key: "revenue",
      header: t.dashboard.revenue,
      align: "right",
      sortValue: (row) => row.performance?.revenue ?? 0,
      cell: (row) => (
        <span className="font-medium text-ink tnum">
          {money(row.performance?.revenue ?? 0, { cents: false })}
        </span>
      ),
    },
    {
      key: "profit",
      header: t.dashboard.profit,
      align: "right",
      secondary: true,
      sortValue: (row) => row.performance?.profit ?? 0,
      cell: (row) => {
        const profit = row.performance?.profit ?? 0;
        return (
          <span className={profit < 0 ? "text-delta-down tnum" : "text-ink tnum"}>
            {money(profit, { cents: false })}
          </span>
        );
      },
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
                label={t.apartments.apartmentActions}
                onClick={toggle}
                icon={<MoreHorizontal className="size-4" />}
              />
            )}
            items={[
              { label: t.guests.openProfile, onSelect: () => router.push(`/apartments/${row.apartment.id}`) },
              {
                label: t.common.edit,
                icon: <Pencil />,
                onSelect: () => {
                  setEditing(row.apartment);
                  setFormOpen(true);
                },
              },
              {
                label: t.common.remove,
                icon: <Trash2 />,
                destructive: true,
                separatorBefore: true,
                onSelect: () => void remove(row.apartment),
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
        title={t.apartments.title}
        description={t.apartments.unitsPerformance(apartments.length, label.toLowerCase())}
        actions={
          <>
            <Button variant="outline" icon={<Download className="size-4" />} onClick={exportRows}>
              {t.common.export}
            </Button>
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Add apartment
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {APARTMENT_STATUSES.map((status) => (
          <StatusTile
            key={status}
            label={APARTMENT_STATUS_META[status].label}
            count={statusCounts.get(status) ?? 0}
            color={APARTMENT_STATUS_META[status].color}
            active={statusFilter === status}
            onClick={() => setStatusFilter((current) => (current === status ? "all" : status))}
          />
        ))}
      </div>

      <FilterBar>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.apartments.searchPlaceholder}
            aria-label={t.apartments.searchApartments}
            className="h-9 w-[230px] pl-9 text-[13px]"
          />
        </div>

        <Select
          aria-label={t.apartments.filterByBedrooms}
          value={bedroomFilter}
          onChange={(event) => setBedroomFilter(event.target.value)}
          className="h-9 w-[150px] text-[13px]"
        >
          <option value="all">{t.apartments.anyBedrooms}</option>
          {bedroomOptions.map((count) => (
            <option key={count} value={String(count)}>
              {count} bedroom{count === 1 ? "" : "s"}
            </option>
          ))}
        </Select>

        {statusFilter !== "all" ? (
          <Button size="sm" variant="ghost" onClick={() => setStatusFilter("all")}>
            {t.apartments.clearStatus}
          </Button>
        ) : null}

        <Segmented
          className="ml-auto"
          size="sm"
          ariaLabel={t.apartments.layout}
          value={view}
          onChange={setView}
          options={[
            { value: "grid", label: t.apartments.grid, icon: <LayoutGrid /> },
            { value: "table", label: t.apartments.table, icon: <List /> },
          ]}
        />
      </FilterBar>

      {rows.length === 0 && !isLoading ? (
        <EmptyState
          icon={<Building2 />}
          title={t.apartments.noMatch}
          description={t.apartments.adjustFilters}
          action={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          actionLabel={t.apartments.addApartment}
        />
      ) : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {rows.map(({ apartment, performance, currentGuest }) => (
            <ApartmentCard
              key={apartment.id}
              apartment={apartment}
              performance={performance}
              currentGuest={currentGuest}
            />
          ))}
        </div>
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.apartment.id}
          loading={isLoading}
          sort={sort}
          onSortChange={setSort}
          onRowClick={(row) => router.push(`/apartments/${row.apartment.id}`)}
          maxHeight="calc(100dvh - 380px)"
        />
      )}

      <ApartmentFormDrawer
        open={formOpen || Boolean(newParam)}
        onClose={() => {
          setFormOpen(false);
          if (newParam) clearNewParam();
        }}
        apartment={editing}
      />
      {dialog}
    </>
  );
}

/* ------------------------------------------------------------------ */

function ApartmentCard({
  apartment,
  performance,
  currentGuest,
}: {
  apartment: Apartment;
  performance?: ApartmentPerformance;
  currentGuest: string | null;
}) {
  const t = useT();
  const meta = APARTMENT_STATUS_META[apartment.status];

  return (
    <Link
      href={`/apartments/${apartment.id}`}
      className="group flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md"
    >
      <div className="relative">
        <ApartmentImage
          code={apartment.code}
          name={apartment.name}
          src={apartment.cover_image}
          className="h-40 w-full"
          rounded="rounded-none"
        />
        <span className="absolute left-3 top-3">
          <StatusBadge size="sm" meta={meta} className="shadow-sm backdrop-blur" />
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-[14.5px] font-semibold tracking-[-0.01em] text-ink">
              {apartment.name}
            </h3>
            <p className="truncate text-[12.5px] text-ink-3">
              {apartment.code} · {apartment.city ?? "—"}
            </p>
          </div>
          <p className="shrink-0 text-right">
            <span className="block text-[15px] font-semibold text-ink tnum">
              {money(apartment.nightly_rate, { cents: false })}
            </span>
            <span className="block text-[11px] text-ink-3">{t.listing.perNight}</span>
          </p>
        </div>

        <p className="mt-2 text-[12.5px] text-ink-2">
          {apartment.bedrooms} bed · {apartment.bathrooms} bath · sleeps {apartment.capacity}
        </p>

        {currentGuest ? (
          <p className="mt-2 truncate rounded-lg bg-info-wash px-2.5 py-1.5 text-[12px] text-ink">
            In house: <span className="font-medium">{currentGuest}</span>
          </p>
        ) : null}

        <div className="mt-auto pt-4">
          <div className="flex items-baseline justify-between text-[12px]">
            <span className="text-ink-3">{t.dashboard.occupancy}</span>
            <span className="font-medium text-ink tnum">
              {percent(performance?.occupancy ?? 0, 0)}
            </span>
          </div>
          <Progress className="mt-1.5" value={performance?.occupancy ?? 0} tone="info" />

          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
            <div>
              <p className="text-[11px] text-ink-3">{t.dashboard.revenue}</p>
              <p className="text-[13.5px] font-medium text-ink tnum">
                {money(performance?.revenue ?? 0, { cents: false })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-ink-3">{t.dashboard.profit}</p>
              <p
                className={
                  (performance?.profit ?? 0) < 0
                    ? "text-[13.5px] font-medium text-delta-down tnum"
                    : "text-[13.5px] font-medium text-ink tnum"
                }
              >
                {money(performance?.profit ?? 0, { cents: false })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
