"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Check, Pencil, Share2, Sparkles, Wrench } from "lucide-react";
import { dayjs, eachDay, toISODate } from "@/lib/date-range";
import { useT } from "@/i18n";
import { formatDate, fullName, money, percent, number } from "@/lib/format";
import {
  APARTMENT_STATUS_META, BOOKING_STATUS_META, expenseCategoryLabel,
  TASK_STATUS_META, categoryColor,
} from "@/lib/constants";
import { capSlices, computeOccupancyByDay, expensesByCategory } from "@/data/analytics";
import { useDateFilter } from "@/hooks/use-date-filter";
import { useAnalytics } from "@/hooks/use-analytics";
import {
  useApartments, useBookings, useExpenses, useTasks, useUpdateApartment,
} from "@/data/queries";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Select } from "@/components/ui/field";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartCard, ChartTable } from "@/components/charts/chart-card";
import { HeatLegend, HeatStrip, RankedBars, TrendChart } from "@/components/charts/charts";
import { ApartmentImage } from "@/components/apartments/apartment-image";
import { ApartmentFormDrawer } from "@/components/apartments/apartment-form";
import { ShareDialog } from "@/components/apartments/share-dialog";
import { ImageUploader } from "@/components/apartments/image-uploader";
import { DataTable, type Column } from "@/components/ui/data-table";
import { APARTMENT_STATUSES } from "@/types/domain";
import type { BookingWithRelations, ExpenseWithRelations, TaskWithRelations } from "@/types/domain";

type Tab =
  | "overview" | "gallery" | "amenities" | "pricing" | "availability"
  | "bookings" | "expenses" | "housekeeping" | "performance";

export default function ApartmentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = useT();
  const { id } = use(params);
  const router = useRouter();
  const { range, label } = useDateFilter();

  const { data: apartments } = useApartments();
  const { data: bookings } = useBookings();
  const { data: expenses } = useExpenses();
  const { data: tasks } = useTasks();
  const { apartmentPerformance } = useAnalytics();
  const updateApartment = useUpdateApartment();

  const [tab, setTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const apartment = apartments.find((entry) => entry.id === id);

  const performance = apartmentPerformance.find((row) => row.apartment.id === id);

  const apartmentBookings = useMemo(
    () =>
      bookings
        .filter((booking) => booking.apartment_id === id)
        .sort((a, b) => b.check_in.localeCompare(a.check_in)),
    [bookings, id],
  );

  const apartmentExpenses = useMemo(
    () =>
      expenses
        .filter((expense) => expense.apartment_id === id)
        .sort((a, b) => b.expense_date.localeCompare(a.expense_date)),
    [expenses, id],
  );

  const apartmentTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.apartment_id === id)
        .sort((a, b) => (b.due_date ?? "").localeCompare(a.due_date ?? "")),
    [tasks, id],
  );

  /** Per-apartment trend: the shared engine restricted to this unit. */
  const unitTrend = useMemo(() => {
    if (!apartment) return [];
    const days = eachDay(range);
    const byBucket = new Map<string, { label: string; revenue: number; nights: number }>();
    const useMonths = days.length > 92;
    for (const day of days) {
      const key = useMonths ? day.slice(0, 7) : day;
      if (!byBucket.has(key)) {
        byBucket.set(key, {
          label: useMonths ? dayjs(`${key}-01`).format("MMM YYYY") : dayjs(key).format("MMM D"),
          revenue: 0,
          nights: 0,
        });
      }
    }
    for (const booking of apartmentBookings) {
      if (booking.status === "cancelled" || booking.status === "no_show") continue;
      const perNight = booking.total / Math.max(1, booking.nights);
      let cursor = dayjs(booking.check_in);
      const end = dayjs(booking.check_out);
      while (cursor.isBefore(end, "day")) {
        const iso = cursor.format("YYYY-MM-DD");
        const bucket = byBucket.get(useMonths ? iso.slice(0, 7) : iso);
        if (bucket) {
          bucket.revenue += perNight;
          bucket.nights += 1;
        }
        cursor = cursor.add(1, "day");
      }
    }
    return Array.from(byBucket.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, value]) => ({ key, ...value, revenue: Math.round(value.revenue) }));
  }, [apartment, apartmentBookings, range]);

  const occupancyCells = useMemo(() => {
    if (!apartment) return [];
    return computeOccupancyByDay(
      { apartments: [apartment], bookings: apartmentBookings, expenses: [], payments: [] },
      range,
    );
  }, [apartment, apartmentBookings, range]);

  const expenseSlices = useMemo(
    () => capSlices(expensesByCategory(apartmentExpenses, range), 7),
    [apartmentExpenses, range],
  );

  if (!apartment) {
    return (
      <EmptyState
        icon={<Building2 />}
        title={t.apartments.notFound}
        description={t.apartments.mayHaveBeenRemoved}
        action={() => router.push("/apartments")}
        actionLabel={t.apartments.backToApartments}
      />
    );
  }

  const meta = APARTMENT_STATUS_META[apartment.status];
  const today = toISODate(dayjs());
  const inHouse = apartmentBookings.find(
    (booking) =>
      booking.status !== "cancelled" &&
      booking.status !== "no_show" &&
      booking.check_in <= today &&
      booking.check_out > today,
  );

  const bookingColumns: Column<BookingWithRelations>[] = [
    {
      key: "reference",
      header: t.bookings.colBooking,
      sortValue: (row) => row.reference,
      cell: (row) => (
        <Link href={`/bookings?booking=${row.id}`} className="font-medium text-ink hover:underline">
          {row.reference}
        </Link>
      ),
    },
    {
      key: "guest",
      header: t.bookings.colGuest,
      sortValue: (row) => row.guest.last_name,
      cell: (row) => <span className="text-ink">{fullName(row.guest)}</span>,
    },
    {
      key: "stay",
      header: t.bookings.colStay,
      sortValue: (row) => row.check_in,
      cell: (row) => (
        <span className="whitespace-nowrap text-ink tnum">
          {formatDate(row.check_in, "MMM D")} → {formatDate(row.check_out, "MMM D, YYYY")}
        </span>
      ),
    },
    {
      key: "nights",
      header: t.printReport.colNights,
      align: "right",
      sortValue: (row) => row.nights,
      cell: (row) => <span className="text-ink-2 tnum">{row.nights}</span>,
    },
    {
      key: "status",
      header: t.common.status,
      sortValue: (row) => row.status,
      cell: (row) => <StatusBadge size="sm" meta={BOOKING_STATUS_META[row.status]} />,
    },
    {
      key: "total",
      header: t.common.total,
      align: "right",
      sortValue: (row) => row.total,
      cell: (row) => <span className="font-medium text-ink tnum">{money(row.total)}</span>,
    },
  ];

  const expenseColumns: Column<ExpenseWithRelations>[] = [
    {
      key: "date",
      header: t.common.date,
      sortValue: (row) => row.expense_date,
      cell: (row) => <span className="text-ink tnum">{formatDate(row.expense_date)}</span>,
    },
    {
      key: "category",
      header: t.dashboard.categoryCol,
      sortValue: (row) => row.category,
      cell: (row) => (
        <span className="flex items-center gap-2 text-ink">
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ background: categoryColor(row.category) }}
          />
          {expenseCategoryLabel(row.category)}
        </span>
      ),
    },
    {
      key: "vendor",
      header: t.expenses.vendor,
      secondary: true,
      sortValue: (row) => row.vendor ?? "",
      cell: (row) => <span className="text-ink-2">{row.vendor ?? "—"}</span>,
    },
    {
      key: "description",
      header: t.expenses.description2,
      secondary: true,
      cell: (row) => <span className="text-ink-2">{row.description ?? "—"}</span>,
    },
    {
      key: "amount",
      header: t.common.amount,
      align: "right",
      sortValue: (row) => row.amount,
      cell: (row) => <span className="font-medium text-ink tnum">{money(row.amount)}</span>,
    },
  ];

  const taskColumns: Column<TaskWithRelations>[] = [
    {
      key: "title",
      header: t.apartments.task,
      sortValue: (row) => row.title,
      cell: (row) => (
        <span className="flex items-center gap-2">
          {row.type === "cleaning" ? (
            <Sparkles className="size-4 shrink-0 text-warning" aria-hidden />
          ) : (
            <Wrench className="size-4 shrink-0 text-serious" aria-hidden />
          )}
          <span className="min-w-0">
            <span className="block truncate text-ink">{row.title}</span>
            <span className="block truncate text-[12px] text-ink-3">{row.assignee ?? "Unassigned"}</span>
          </span>
        </span>
      ),
    },
    {
      key: "due",
      header: t.invoices.due,
      sortValue: (row) => row.due_date ?? "",
      cell: (row) => <span className="text-ink tnum">{formatDate(row.due_date)}</span>,
    },
    {
      key: "status",
      header: t.common.status,
      sortValue: (row) => row.status,
      cell: (row) => <StatusBadge size="sm" meta={TASK_STATUS_META[row.status]} />,
    },
    {
      key: "cost",
      header: t.expenses.taskCost,
      align: "right",
      sortValue: (row) => row.cost,
      cell: (row) => <span className="text-ink tnum">{money(row.cost)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title={apartment.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge size="sm" meta={meta} />
            <span>
              {apartment.code} · {apartment.address ?? "—"}
              {apartment.city ? `, ${apartment.city}` : ""}
            </span>
          </span>
        }
        actions={
          <>
            <Button
              variant="ghost"
              icon={<ArrowLeft className="size-4" />}
              onClick={() => router.push("/apartments")}
            >
              All apartments
            </Button>
            <Select
              aria-label={t.apartments.changeStatus}
              value={apartment.status}
              onChange={(event) =>
                updateApartment.mutate({
                  id: apartment.id,
                  patch: { status: event.target.value as typeof apartment.status },
                })
              }
              className="h-10 w-[150px] text-[13px]"
            >
              {APARTMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {APARTMENT_STATUS_META[status].label}
                </option>
              ))}
            </Select>
            <Button
              variant="outline"
              icon={<Share2 className="size-4" />}
              onClick={() => setShareOpen(true)}
            >
              Share
            </Button>
            <Button
              variant="primary"
              icon={<Pencil className="size-4" />}
              onClick={() => setEditOpen(true)}
            >
              {t.common.edit}
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <ApartmentImage
            code={apartment.code}
            name={apartment.name}
            src={apartment.cover_image}
            className="h-44 w-full"
            rounded="rounded-none"
          />
          <CardBody className="pt-4">
            <dl className="space-y-2.5 text-[13px]">
              <InfoRow label={t.apartments.nightlyRate} value={money(apartment.nightly_rate)} />
              <InfoRow label={t.apartments.cleaningFee} value={money(apartment.cleaning_fee)} />
              <InfoRow label={t.apartments.layout} value={`${apartment.bedrooms} bed · ${apartment.bathrooms} bath`} />
              <InfoRow label={t.apartments.sleeps} value={`${apartment.capacity} guests`} />
              <InfoRow label={t.apartments.size} value={apartment.size_sqm ? `${apartment.size_sqm} m²` : "—"} />
              <InfoRow label={t.apartments.minimumStay} value={`${apartment.min_nights} nights`} />
            </dl>

            {inHouse ? (
              <div className="mt-4 rounded-xl bg-info-wash px-3 py-2.5">
                <p className="text-[12px] text-ink-3">{t.guests.currentlyInHouse}</p>
                <Link
                  href={`/bookings?booking=${inHouse.id}`}
                  className="text-[13.5px] font-medium text-ink hover:underline"
                >
                  {fullName(inHouse.guest)}
                </Link>
                <p className="text-[12px] text-ink-2">
                  until {formatDate(inHouse.check_out, "MMM D")}
                </p>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <KpiCard label={t.dashboard.revenue} value={money(performance?.revenue ?? 0, { cents: false })} hint={label} />
          <KpiCard label={t.dashboard.expenses} value={money(performance?.expenses ?? 0, { cents: false })} hint={label} />
          <KpiCard
            label={t.dashboard.profit}
            value={money(performance?.profit ?? 0, { cents: false })}
            hint={`${percent(performance?.margin ?? 0, 0)} margin`}
          />
          <KpiCard label={t.dashboard.occupancy} value={percent(performance?.occupancy ?? 0)} hint={`${performance?.nightsSold ?? 0} nights sold`} />
          <KpiCard label={t.dashboard.adr} value={money(performance?.adr ?? 0, { cents: false })} hint="average daily rate" />
          <KpiCard label={t.dashboard.revpar} value={money(performance?.revpar ?? 0, { cents: false })} hint={t.apartments.perAvailableNight} />
          <KpiCard label={t.dashboard.bookings} value={number(performance?.bookings ?? 0)} hint={t.apartments.arrivalsInPeriod} />
          <KpiCard
            label={t.guests.averageStay}
            value={`${(performance?.avgStay ?? 0).toFixed(1)}n`}
            hint={t.apartments.nightsPerBooking}
          />
          <KpiCard
            label={t.guests.cancellationRate}
            value={percent(performance?.cancellationRate ?? 0, 0)}
            hint={t.apartments.ofArrivalsInPeriod}
          />
        </div>
      </div>

      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "overview", label: t.common.overview },
          { value: "performance", label: t.apartments.tabPerformance },
          { value: "availability", label: t.apartments.tabAvailability },
          { value: "bookings", label: "Bookings", count: apartmentBookings.length },
          { value: "expenses", label: t.apartments.tabExpenses, count: apartmentExpenses.length },
          { value: "housekeeping", label: t.apartments.tabTasks, count: apartmentTasks.length },
          { value: "amenities", label: "Amenities", count: apartment.amenities.length },
          { value: "pricing", label: t.apartments.tabPricing },
          { value: "gallery", label: "Gallery" },
        ]}
      />

      {tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title={t.apartments.aboutThisApartment} />
            <CardBody>
              <p className="text-[13.5px] leading-relaxed text-ink-2">
                {apartment.description ?? t.ui.noDescriptionYet}
              </p>
              <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-[13px]">
                <InfoRow label={t.apartments.floor} value={apartment.floor ?? "—"} stacked />
                <InfoRow label={t.apartments.beds} value={String(apartment.beds)} stacked />
                <InfoRow label={t.common.city} value={apartment.city ?? "—"} stacked />
                <InfoRow label={t.common.country} value={apartment.country ?? "—"} stacked />
                <InfoRow
                  label={t.ui.added}
                  value={formatDate(apartment.created_at)}
                  stacked
                />
                <InfoRow
                  label={t.apartments.listed}
                  value={apartment.is_active ? "Active" : "Inactive"}
                  stacked
                />
              </dl>
            </CardBody>
          </Card>

          <ChartCard
            title={t.dashboard.revenue}
            description={t.apartments.nightlyRevenueIn(label.toLowerCase())}
            isEmpty={unitTrend.every((point) => point.revenue === 0)}
            table={
              <ChartTable
                columns={[
                  { key: "label", label: "Period" },
                  { key: "revenue", label: "Revenue", align: "right" },
                  { key: "nights", label: "Nights", align: "right" },
                ]}
                rows={unitTrend.map((point) => ({
                  key: point.key,
                  label: point.label,
                  revenue: money(point.revenue),
                  nights: number(point.nights),
                }))}
              />
            }
          >
            <TrendChart
              data={unitTrend}
              xKey="label"
              kind="area"
              series={[{ key: "revenue", label: "Revenue", color: "var(--series-1)" }]}
              formatValue={(value) => money(value)}
              formatAxis={(value) => money(value, { cents: false })}
            />
          </ChartCard>
        </div>
      ) : null}

      {tab === "performance" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title={t.dashboard.nightsSold}
            description={t.apartments.occupiedNightsAcross(label.toLowerCase())}
            isEmpty={unitTrend.every((point) => point.nights === 0)}
            table={
              <ChartTable
                columns={[
                  { key: "label", label: "Period" },
                  { key: "nights", label: t.dashboard.nightsSold, align: "right" },
                ]}
                rows={unitTrend.map((point) => ({
                  key: point.key,
                  label: point.label,
                  nights: number(point.nights),
                }))}
              />
            }
          >
            <TrendChart
              data={unitTrend}
              xKey="label"
              kind="bar"
              series={[{ key: "nights", label: t.dashboard.nightsSold, color: "var(--series-2)" }]}
              formatValue={(value) => `${value} nights`}
              formatAxis={(value) => number(value)}
            />
          </ChartCard>

          <ChartCard
            title={t.apartments.expensesByCategory}
            description={t.ui.costsBookedAgainst}
            isEmpty={expenseSlices.length === 0}
            series={expenseSlices.map((slice) => ({
              key: slice.key,
              label: slice.label,
              color: categoryColor(slice.key as never),
            }))}
            table={
              <ChartTable
                columns={[
                  { key: "label", label: "Category" },
                  { key: "amount", label: "Amount", align: "right" },
                  { key: "share", label: t.apartments.share, align: "right" },
                ]}
                rows={expenseSlices.map((slice) => ({
                  key: slice.key,
                  swatch: categoryColor(slice.key as never),
                  label: slice.label,
                  amount: money(slice.value),
                  share: percent(slice.share),
                }))}
              />
            }
          >
            <RankedBars
              rows={expenseSlices.map((slice) => ({
                key: slice.key,
                label: slice.label,
                value: slice.value,
                color: categoryColor(slice.key as never),
                sublabel: percent(slice.share, 0),
              }))}
              formatValue={(value) => money(value, { cents: false })}
            />
          </ChartCard>

          <Card className="lg:col-span-2">
            <CardHeader
              title={t.apartments.againstPortfolio}
              description={t.ui.howUnitCompares}
            />
            <CardBody>
              <ComparisonRow
                label={t.dashboard.occupancy}
                value={performance?.occupancy ?? 0}
                average={average(apartmentPerformance.map((row) => row.occupancy))}
                format={(value) => percent(value)}
              />
              <ComparisonRow
                label={t.dashboard.adr}
                value={(performance?.adr ?? 0) / 100}
                average={average(apartmentPerformance.map((row) => row.adr / 100))}
                format={(value) => money(value * 100, { cents: false })}
              />
              <ComparisonRow
                label={t.dashboard.revpar}
                value={(performance?.revpar ?? 0) / 100}
                average={average(apartmentPerformance.map((row) => row.revpar / 100))}
                format={(value) => money(value * 100, { cents: false })}
              />
              <ComparisonRow
                label={t.apartments.profitMargin}
                value={performance?.margin ?? 0}
                average={average(apartmentPerformance.map((row) => row.margin))}
                format={(value) => percent(value)}
              />
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === "availability" ? (
        <Card>
          <CardHeader
            title={t.apartments.tabAvailability}
            description={t.apartments.occupiedNightsIn(label.toLowerCase())}
            action={<HeatLegend />}
          />
          <CardBody>
            <HeatStrip
              cells={occupancyCells.map((cell) => ({
                key: cell.date,
                value: cell.occupancy,
                label: `${formatDate(cell.date)} — ${cell.nightsSold ? "booked" : "free"}`,
              }))}
            />
            <div className="mt-4 flex flex-wrap gap-6 border-t border-line pt-4 text-[13px]">
              <Stat label={t.dashboard.nightsSold} value={number(performance?.nightsSold ?? 0)} />
              <Stat label={t.apartments.nightsAvailable} value={number(performance?.nightsAvailable ?? 0)} />
              <Stat label={t.dashboard.occupancy} value={percent(performance?.occupancy ?? 0)} />
            </div>
          </CardBody>
        </Card>
      ) : null}

      {tab === "bookings" ? (
        <DataTable
          rows={apartmentBookings}
          columns={bookingColumns}
          rowKey={(row) => row.id}
          onRowClick={(row) => router.push(`/bookings?booking=${row.id}`)}
          emptyTitle={t.apartments.noBookingsYet}
          emptyDescription={t.apartments.reservationsAppearHere}
          maxHeight="calc(100dvh - 460px)"
        />
      ) : null}

      {tab === "expenses" ? (
        <DataTable
          rows={apartmentExpenses}
          columns={expenseColumns}
          rowKey={(row) => row.id}
          emptyTitle={t.apartments.noExpenses}
          emptyDescription={t.apartments.costsAppearHere}
          maxHeight="calc(100dvh - 460px)"
          footer={
            apartmentExpenses.length > 0 ? (
              <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2 px-4 py-2.5 text-[13px]">
                <span className="text-ink-3">{t.guests.allTimeTotal}</span>
                <span className="font-semibold text-ink tnum">
                  {money(apartmentExpenses.reduce((acc, row) => acc + row.amount, 0))}
                </span>
              </div>
            ) : null
          }
        />
      ) : null}

      {tab === "housekeeping" ? (
        <DataTable
          rows={apartmentTasks}
          columns={taskColumns}
          rowKey={(row) => row.id}
          emptyTitle={t.apartments.nothingScheduled}
          emptyDescription={t.apartments.tasksAppearHere}
          maxHeight="calc(100dvh - 460px)"
        />
      ) : null}

      {tab === "amenities" ? (
        <Card>
          <CardHeader title={t.apartments.amenities} description={`${apartment.amenities.length} listed`} />
          <CardBody>
            {apartment.amenities.length === 0 ? (
              <EmptyState compact title={t.apartments.noAmenities} description={t.apartments.editToAddThem} />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {apartment.amenities.map((amenity) => (
                  <li
                    key={amenity}
                    className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-[13.5px] text-ink"
                  >
                    <Check className="size-4 shrink-0 text-good" aria-hidden />
                    {amenity}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      ) : null}

      {tab === "pricing" ? (
        <Card>
          <CardHeader
            title={t.apartments.pricingRules}
            description={t.apartments.appliedAutomatically}
          />
          <CardBody>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <PriceCard label={t.apartments.baseNightlyRate} value={money(apartment.nightly_rate)} />
              <PriceCard label={t.apartments.cleaningFee} value={money(apartment.cleaning_fee)} />
              <PriceCard label={t.apartments.minimumNights} value={String(apartment.min_nights)} />
              <PriceCard
                label={t.apartments.weeklyDiscount}
                value={`${apartment.weekly_discount}%`}
                note="7+ night stays"
              />
              <PriceCard
                label={t.apartments.monthlyDiscount}
                value={`${apartment.monthly_discount}%`}
                note="28+ night stays"
              />
              <PriceCard
                label={t.apartments.effectiveAdr}
                value={money(performance?.adr ?? 0)}
                note={`achieved in ${label.toLowerCase()}`}
              />
            </dl>
          </CardBody>
        </Card>
      ) : null}

      {tab === "gallery" ? (
        <Card>
          <CardHeader
            title={t.apartments.photos}
            description={t.apartments.photosHint}
          />
          <CardBody>
            <ImageUploader
              apartmentId={apartment.id}
              images={apartment.images}
              coverImage={apartment.cover_image}
              onChange={({ images, coverImage }) =>
                updateApartment.mutate({
                  id: apartment.id,
                  patch: { images, cover_image: coverImage },
                })
              }
            />
          </CardBody>
        </Card>
      ) : null}

      <ApartmentFormDrawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        apartment={apartment}
      />

      <ShareDialog
        apartment={apartment}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function InfoRow({
  label,
  value,
  stacked,
}: {
  label: string;
  value: string;
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <div>
        <dt className="text-[11.5px] uppercase tracking-wide text-ink-3">{label}</dt>
        <dd className="mt-0.5 text-[13.5px] text-ink">{value}</dd>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-3">{label}</dt>
      <dd className="font-medium text-ink tnum">{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11.5px] uppercase tracking-wide text-ink-3">{label}</p>
      <p className="mt-0.5 text-[16px] font-semibold text-ink tnum">{value}</p>
    </div>
  );
}

function PriceCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <dt className="text-[12px] uppercase tracking-wide text-ink-3">{label}</dt>
      <dd className="mt-1 text-[19px] font-semibold tracking-[-0.02em] text-ink">{value}</dd>
      {note ? <p className="mt-0.5 text-[12px] text-ink-3">{note}</p> : null}
    </div>
  );
}

/**
 * This unit against the portfolio average.
 * Two bars on one scale — never a second axis.
 */
function ComparisonRow({
  label,
  value,
  average: portfolioAverage,
  format,
}: {
  label: string;
  value: number;
  average: number;
  format: (value: number) => string;
}) {
  const t = useT();
  const peak = Math.max(value, portfolioAverage, 0.0001);
  const better = value >= portfolioAverage;

  return (
    <div className="border-b border-line py-3 last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-ink">{label}</span>
        <span className="text-[13px] font-medium text-ink tnum">{format(value)}</span>
      </div>
      <div className="mt-2 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-[11px] text-ink-3">{t.apartments.thisUnit}</span>
          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(2, (value / peak) * 100)}%`,
                background: better ? "var(--series-1)" : "var(--series-2)",
              }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-[11px] text-ink-3">{t.apartments.portfolio}</span>
          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-line-strong"
              style={{ width: `${Math.max(2, (portfolioAverage / peak) * 100)}%` }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-[11px] text-ink-3 tnum">
            {format(portfolioAverage)}
          </span>
        </div>
      </div>
    </div>
  );
}
