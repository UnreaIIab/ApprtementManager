"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight, BedDouble, Building2, CalendarCheck, CircleDollarSign, Clock,
  Moon, Percent, Plus, Receipt, TrendingUp, Users, Wallet,
} from "lucide-react";
import {
  bookingsBySource,
  capSlices,
  expensesByCategory,
  revenueBySource,
} from "@/data/analytics";
import { useAnalytics } from "@/hooks/use-analytics";
import { useApartments, useSnapshot } from "@/data/queries";
import { useDateFilter } from "@/hooks/use-date-filter";
import { APARTMENT_STATUS_META, categoryColor, sourceColor } from "@/lib/constants";
import { formatDateRange, money, moneyCompact, number, percent } from "@/lib/format";
import { useT } from "@/i18n";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard, StatusTile } from "@/components/dashboard/kpi-card";
import { TodaysOperations } from "@/components/dashboard/todays-operations";
import { ChartCard, ChartTable } from "@/components/charts/chart-card";
import { DonutChart, RankedBars, TrendChart } from "@/components/charts/charts";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { APARTMENT_STATUSES, type ApartmentStatus } from "@/types/domain";

export default function DashboardPage() {
  const t = useT();
  const router = useRouter();
  const { data: snapshot } = useSnapshot();
  const { data: apartments } = useApartments();
  const { range, label } = useDateFilter();
  const {
    kpis, trend, apartmentPerformance, delta, loading, refetching,
  } = useAnalytics();

  const [statusFilter, setStatusFilter] = useState<ApartmentStatus | null>(null);

  // Memoised so the `?? []` fallback doesn't produce a new array identity on
  // every render and invalidate the chart memos below.
  const bookings = useMemo(() => snapshot?.bookings ?? [], [snapshot]);
  const expenses = useMemo(() => snapshot?.expenses ?? [], [snapshot]);

  /* --- Chart inputs ------------------------------------------------ */

  const sourceRevenue = useMemo(
    () => capSlices(revenueBySource(bookings, range), 6),
    [bookings, range],
  );
  const sourceBookings = useMemo(
    () => bookingsBySource(bookings, range),
    [bookings, range],
  );
  const expenseSlices = useMemo(
    () => capSlices(expensesByCategory(expenses, range), 7),
    [expenses, range],
  );

  const topApartments = useMemo(
    () =>
      [...apartmentPerformance]
        .filter((row) => row.revenue > 0)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 6),
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

  const filteredApartments = statusFilter
    ? apartments.filter((apartment) => apartment.status === statusFilter)
    : apartments;

  const revenueSpark = trend.map((point) => point.revenue);
  const occupancySpark = trend.map((point) => point.occupancy);
  const profitSpark = trend.map((point) => point.profit);

  const isEmptyPeriod = kpis.nightsSold === 0 && kpis.expenses === 0;

  return (
    <>
      <PageHeader
        title={t.dashboard.title}
        description={
          <>
            {label} · <span className="tnum">{formatDateRange(range.start, range.end)}</span>
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => router.push("/reports")}>
              {t.dashboard.viewReports}
            </Button>
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={() => router.push("/bookings?new=1")}
            >
              {t.dashboard.newBooking}
            </Button>
          </>
        }
      />

      {/* --- KPIs ---------------------------------------------------- */}
      <section aria-label={t.dashboard.kpiSection} className="mb-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          <KpiCard
            label={t.dashboard.totalRevenue}
            value={money(kpis.revenue, { cents: false })}
            delta={delta("revenue")}
            icon={<CircleDollarSign />}
            spark={revenueSpark}
            sparkColor="var(--series-1)"
            loading={loading}
            href="/reports"
          />
          <KpiCard
            label={t.dashboard.netProfit}
            value={money(kpis.netProfit, { cents: false })}
            delta={delta("netProfit")}
            icon={<TrendingUp />}
            spark={profitSpark}
            sparkColor="var(--series-3)"
            loading={loading}
            href="/reports"
          />
          <KpiCard
            label={t.dashboard.expenses}
            value={money(kpis.expenses, { cents: false })}
            delta={delta("expenses")}
            invertDelta
            icon={<Receipt />}
            loading={loading}
            href="/expenses"
          />
          <KpiCard
            label={t.dashboard.occupancyRate}
            value={percent(kpis.occupancyRate)}
            delta={delta("occupancyRate")}
            icon={<Percent />}
            spark={occupancySpark}
            sparkColor="var(--series-2)"
            loading={loading}
          />
          <KpiCard
            label={t.dashboard.bookings}
            value={number(kpis.bookings)}
            delta={delta("bookings")}
            icon={<CalendarCheck />}
            loading={loading}
            href="/bookings"
          />
          <KpiCard
            label={t.dashboard.adr}
            value={money(kpis.adr, { cents: false })}
            delta={delta("adr")}
            deltaLabel="average daily rate"
            icon={<BedDouble />}
            loading={loading}
          />
          <KpiCard
            label={t.dashboard.revpar}
            value={money(kpis.revpar, { cents: false })}
            delta={delta("revpar")}
            deltaLabel="per available apartment"
            icon={<Building2 />}
            loading={loading}
          />
          <KpiCard
            label={t.dashboard.avgStay}
            value={`${kpis.avgLengthOfStay.toFixed(1)} nights`}
            delta={delta("avgLengthOfStay")}
            icon={<Moon />}
            loading={loading}
          />
          <KpiCard
            label={t.dashboard.availableApartments}
            value={`${kpis.availableApartments} / ${kpis.totalApartments}`}
            hint="free right now"
            icon={<Building2 />}
            loading={loading}
            href="/apartments"
          />
          <KpiCard
            label={t.dashboard.activeGuests}
            value={number(kpis.activeGuests)}
            delta={delta("activeGuests")}
            icon={<Users />}
            loading={loading}
            href="/guests"
          />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard
            label={t.dashboard.collected}
            value={money(kpis.collected, { cents: false })}
            hint="payments received"
            icon={<Wallet />}
            loading={loading}
            href="/payments"
          />
          <KpiCard
            label={t.dashboard.outstanding}
            value={money(kpis.outstanding, { cents: false })}
            hint="still owed on stays in this period"
            icon={<Clock />}
            loading={loading}
            href="/invoices"
          />
          <KpiCard
            label={t.dashboard.cancellationRate}
            value={percent(kpis.cancellationRate)}
            delta={delta("cancellationRate")}
            invertDelta
            icon={<ArrowUpRight />}
            loading={loading}
          />
        </div>
      </section>

      {/* --- Trends -------------------------------------------------- */}
      <section aria-label={t.ui.trends} className="mb-5 grid gap-4 xl:grid-cols-2">
        <ChartCard
          title={t.dashboard.revenueAndExpenses}
          description={t.dashboard.revenueAndExpensesHint}
          loading={loading}
          refetching={refetching}
          isEmpty={isEmptyPeriod}
          series={[
            { key: "revenue", label: t.dashboard.revenue, color: "var(--series-1)" },
            { key: "expenses", label: t.dashboard.expenses, color: "var(--series-2)" },
          ]}
          table={
            <ChartTable
              columns={[
                { key: "label", label: t.dashboard.period },
                { key: "revenue", label: t.dashboard.revenue, align: "right" },
                { key: "expenses", label: t.dashboard.expenses, align: "right" },
                { key: "profit", label: t.dashboard.profit, align: "right" },
              ]}
              rows={trend.map((point) => ({
                key: point.key,
                label: point.label,
                revenue: money(point.revenue),
                expenses: money(point.expenses),
                profit: money(point.profit),
              }))}
            />
          }
        >
          <TrendChart
            data={trend}
            xKey="label"
            kind="area"
            series={[
              { key: "revenue", label: t.dashboard.revenue, color: "var(--series-1)" },
              { key: "expenses", label: t.dashboard.expenses, color: "var(--series-2)" },
            ]}
            formatValue={(value) => money(value)}
            formatAxis={(value) => moneyCompact(value)}
          />
        </ChartCard>

        <ChartCard
          title={t.dashboard.netProfit}
          description={t.dashboard.netProfitHint}
          loading={loading}
          refetching={refetching}
          isEmpty={isEmptyPeriod}
          table={
            <ChartTable
              columns={[
                { key: "label", label: t.dashboard.period },
                { key: "profit", label: t.dashboard.netProfit, align: "right" },
                { key: "margin", label: t.dashboard.margin, align: "right" },
              ]}
              rows={trend.map((point) => ({
                key: point.key,
                label: point.label,
                profit: money(point.profit),
                margin: point.revenue ? percent(point.profit / point.revenue) : "—",
              }))}
            />
          }
        >
          <TrendChart
            data={trend}
            xKey="label"
            kind="bar"
            series={[{ key: "profit", label: t.dashboard.netProfit, color: "var(--series-3)" }]}
            formatValue={(value) => money(value)}
            formatAxis={(value) => moneyCompact(value)}
          />
        </ChartCard>

        <ChartCard
          title={t.dashboard.occupancy}
          description={t.dashboard.occupancyHint}
          loading={loading}
          refetching={refetching}
          isEmpty={isEmptyPeriod}
          table={
            <ChartTable
              columns={[
                { key: "label", label: t.dashboard.period },
                { key: "occupancy", label: t.dashboard.occupancy, align: "right" },
                { key: "sold", label: t.dashboard.nightsSold, align: "right" },
                { key: "available", label: t.dashboard.available, align: "right" },
              ]}
              rows={trend.map((point) => ({
                key: point.key,
                label: point.label,
                occupancy: percent(point.occupancy),
                sold: number(point.nightsSold),
                available: number(point.nightsAvailable),
              }))}
            />
          }
        >
          <TrendChart
            data={trend.map((point) => ({ ...point, occupancyPct: point.occupancy * 100 }))}
            xKey="label"
            kind="area"
            series={[{ key: "occupancyPct", label: t.dashboard.occupancy, color: "var(--series-2)" }]}
            formatValue={(value) => `${value.toFixed(1)}%`}
            formatAxis={(value) => `${Math.round(value)}%`}
          />
        </ChartCard>

        <ChartCard
          title={t.dashboard.bookingsCreated}
          description={t.dashboard.bookingsCreatedHint}
          loading={loading}
          refetching={refetching}
          isEmpty={isEmptyPeriod}
          table={
            <ChartTable
              columns={[
                { key: "label", label: t.dashboard.period },
                { key: "bookings", label: t.dashboard.bookings, align: "right" },
                { key: "nights", label: t.dashboard.nightsSold, align: "right" },
              ]}
              rows={trend.map((point) => ({
                key: point.key,
                label: point.label,
                bookings: number(point.bookings),
                nights: number(point.nightsSold),
              }))}
            />
          }
        >
          <TrendChart
            data={trend}
            xKey="label"
            kind="bar"
            series={[{ key: "bookings", label: t.dashboard.bookings, color: "var(--series-7)" }]}
            formatValue={(value) => number(value)}
            formatAxis={(value) => number(value)}
          />
        </ChartCard>
      </section>

      {/* --- Breakdowns ---------------------------------------------- */}
      <section aria-label={t.ui.breakdowns} className="mb-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <ChartCard
          title={t.dashboard.bookingSources}
          description={t.dashboard.bookingSourcesHint}
          loading={loading}
          refetching={refetching}
          isEmpty={sourceRevenue.length === 0}
          series={sourceRevenue.map((slice) => ({
            key: slice.key,
            label: slice.label,
            color: sourceColor(slice.key as never),
          }))}
          table={
            <ChartTable
              columns={[
                { key: "label", label: t.dashboard.sourceCol },
                { key: "revenue", label: t.dashboard.revenue, align: "right" },
                { key: "share", label: t.dashboard.share, align: "right" },
                { key: "count", label: t.dashboard.bookings, align: "right" },
              ]}
              rows={sourceRevenue.map((slice) => ({
                key: slice.key,
                swatch: sourceColor(slice.key as never),
                label: slice.label,
                revenue: money(slice.value),
                share: percent(slice.share),
                count: number(
                  sourceBookings.find((entry) => entry.key === slice.key)?.value ?? 0,
                ),
              }))}
            />
          }
        >
          <DonutChart
            slices={sourceRevenue.map((slice) => ({
              key: slice.key,
              label: slice.label,
              value: slice.value,
              color: sourceColor(slice.key as never),
            }))}
            formatValue={(value) => money(value)}
            centerValue={moneyCompact(kpis.revenue)}
            centerLabel={t.dashboard.totalRevenueLower}
          />
        </ChartCard>

        <ChartCard
          title={t.dashboard.expenseBreakdown}
          description={t.dashboard.expenseBreakdownHint}
          loading={loading}
          refetching={refetching}
          isEmpty={expenseSlices.length === 0}
          series={expenseSlices.map((slice) => ({
            key: slice.key,
            label: slice.label,
            color: categoryColor(slice.key as never),
          }))}
          table={
            <ChartTable
              columns={[
                { key: "label", label: t.dashboard.categoryCol },
                { key: "amount", label: t.common.amount, align: "right" },
                { key: "share", label: t.dashboard.share, align: "right" },
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

        <ChartCard
          title={t.dashboard.topApartments}
          description={t.dashboard.topApartmentsHint}
          loading={loading}
          refetching={refetching}
          isEmpty={topApartments.length === 0}
          action={
            <Link
              href="/reports"
              className="text-[12px] font-medium text-brand hover:underline"
            >
              All apartments
            </Link>
          }
          table={
            <ChartTable
              columns={[
                { key: "label", label: "Apartment" },
                { key: "revenue", label: t.dashboard.revenue, align: "right" },
                { key: "occupancy", label: t.dashboard.occupancy, align: "right" },
                { key: "adr", label: "ADR", align: "right" },
              ]}
              rows={topApartments.map((row) => ({
                key: row.apartment.id,
                label: row.apartment.name,
                revenue: money(row.revenue),
                occupancy: percent(row.occupancy),
                adr: money(row.adr, { cents: false }),
              }))}
            />
          }
        >
          <RankedBars
            rows={topApartments.map((row) => ({
              key: row.apartment.id,
              label: row.apartment.name,
              value: row.revenue,
              color: "var(--series-1)",
              sublabel: percent(row.occupancy, 0),
            }))}
            formatValue={(value) => money(value, { cents: false })}
          />
        </ChartCard>
      </section>

      {/* --- Operations + apartment status ---------------------------- */}
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <TodaysOperations />

        <Card className="flex min-w-0 flex-col">
          <CardHeader
            title={t.dashboard.apartmentStatus}
            description={t.dashboard.apartmentStatusHint}
            action={
              <Link
                href="/apartments"
                className="text-[12px] font-medium text-brand hover:underline"
              >
                Manage
              </Link>
            }
          />

          <div className="grid grid-cols-2 gap-2 px-5 sm:grid-cols-3 sm:px-6">
            {APARTMENT_STATUSES.map((status) => (
              <StatusTile
                key={status}
                label={APARTMENT_STATUS_META[status].label}
                count={statusCounts.get(status) ?? 0}
                color={APARTMENT_STATUS_META[status].color}
                active={statusFilter === status}
                onClick={() =>
                  setStatusFilter((current) => (current === status ? null : status))
                }
              />
            ))}
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto border-t border-line">
            {filteredApartments.length === 0 ? (
              <p className="px-6 py-8 text-center text-[13px] text-ink-3">
                No apartments with this status.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {filteredApartments.slice(0, 40).map((apartment) => {
                  const meta = APARTMENT_STATUS_META[apartment.status];
                  return (
                    <li key={apartment.id}>
                      <Link
                        href={`/apartments/${apartment.id}`}
                        className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface-2 sm:px-6"
                      >
                        <span
                          aria-hidden
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: meta.color }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium text-ink">
                            {apartment.name}
                          </span>
                          <span className="block truncate text-[12px] text-ink-3">
                            {apartment.code} · {apartment.bedrooms} bed · {apartment.capacity} guests
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-[13px] font-medium text-ink tnum">
                            {money(apartment.nightly_rate, { cents: false })}
                          </span>
                          <span className="block text-[11px] text-ink-3">{meta.label}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>
      </section>
    </>
  );
}
