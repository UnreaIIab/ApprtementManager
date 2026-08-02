"use client";

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Printer, Sparkles, Wrench } from "lucide-react";
import {
  bookingsBySource, capSlices, computeCashFlow, computeOccupancyByDay,
  computeSeasonality, expensesByCategory, revenueBySource,
} from "@/data/analytics";
import { dayjs, granularityFor } from "@/lib/date-range";
import { strings, useT } from "@/i18n";
import { exportCsv } from "@/lib/utils";
import { formatDateRange, money, number, percent } from "@/lib/format";
import {
  BOOKING_STATUS_META, TASK_STATUS_META, categoryColor, sourceColor,
} from "@/lib/constants";
import { useDateFilter } from "@/hooks/use-date-filter";
import { useAnalytics } from "@/hooks/use-analytics";
import { useBookings, useSnapshot, useTasks } from "@/data/queries";
import { PageHeader, FilterBar } from "@/components/layout/page-header";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartCard, ChartTable } from "@/components/charts/chart-card";
import {
  DonutChart, HeatLegend, HeatStrip, RankedBars, TrendChart,
} from "@/components/charts/charts";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import type { ApartmentPerformance } from "@/types/domain";

type Report =
  | "financial" | "occupancy" | "apartments" | "sources" | "guests"
  | "seasonality" | "cancellations" | "housekeeping";

/* Module scope, so the labels read the active dictionary on access. */
const REPORTS: { value: Report; label: string }[] = [
  { value: "financial", get label() { return strings().reports.tabFinancial; } },
  { value: "occupancy", get label() { return strings().reports.tabOccupancy; } },
  { value: "apartments", get label() { return strings().reports.apartmentPerformance; } },
  { value: "sources", get label() { return strings().reports.bookingsBySource; } },
  { value: "guests", get label() { return strings().reports.guestStatistics; } },
  { value: "seasonality", get label() { return strings().reports.seasonality; } },
  { value: "cancellations", get label() { return strings().reports.cancellations; } },
  { value: "housekeeping", get label() { return strings().reports.tabTasks; } },
];

export default function ReportsPage() {
  const t = useT();
  const { range, label } = useDateFilter();
  const { data: snapshot } = useSnapshot();
  const { data: bookings } = useBookings();
  const { data: tasks } = useTasks();
  const {
    input, kpis, previousKpis, lastYearKpis, trend, apartmentPerformance, delta,
  } = useAnalytics();

  const [report, setReport] = useState<Report>("financial");

  // Stable identities so the report memos below only recompute on real change.
  const guests = useMemo(() => snapshot?.guests ?? [], [snapshot]);
  const rawBookings = useMemo(() => snapshot?.bookings ?? [], [snapshot]);
  const rawExpenses = useMemo(() => snapshot?.expenses ?? [], [snapshot]);
  const rawPayments = useMemo(() => snapshot?.payments ?? [], [snapshot]);

  /* --- Derived report data ------------------------------------------ */

  const sourceRevenue = useMemo(
    () => capSlices(revenueBySource(rawBookings, range), 6),
    [rawBookings, range],
  );
  const sourceCounts = useMemo(
    () => bookingsBySource(rawBookings, range),
    [rawBookings, range],
  );
  const expenseSlices = useMemo(
    () => capSlices(expensesByCategory(rawExpenses, range), 7),
    [rawExpenses, range],
  );
  const cashFlow = useMemo(
    () => computeCashFlow(rawPayments, rawExpenses, range, granularityFor(range)),
    [rawPayments, rawExpenses, range],
  );
  const occupancyCells = useMemo(
    () => computeOccupancyByDay(input, range),
    [input, range],
  );
  const seasonality = useMemo(() => {
    const years = Array.from(
      new Set([dayjs(range.start).year(), dayjs(range.end).year()]),
    );
    return computeSeasonality(input, years);
  }, [input, range]);

  const inRangeBookings = useMemo(
    () => bookings.filter((b) => b.check_in >= range.start && b.check_in <= range.end),
    [bookings, range],
  );

  const cancellations = useMemo(
    () => inRangeBookings.filter((b) => b.status === "cancelled" || b.status === "no_show"),
    [inRangeBookings],
  );

  const guestStats = useMemo(() => {
    const live = inRangeBookings.filter(
      (b) => b.status !== "cancelled" && b.status !== "no_show",
    );
    const byGuest = new Map<string, { stays: number; nights: number; spend: number }>();
    for (const booking of live) {
      const entry = byGuest.get(booking.guest_id) ?? { stays: 0, nights: 0, spend: 0 };
      entry.stays += 1;
      entry.nights += booking.nights;
      entry.spend += booking.total;
      byGuest.set(booking.guest_id, entry);
    }
    const nationalities = new Map<string, number>();
    for (const [guestId] of byGuest) {
      const guest = guests.find((entry) => entry.id === guestId);
      const key = guest?.nationality ?? t.reports.unknown;
      nationalities.set(key, (nationalities.get(key) ?? 0) + 1);
    }
    const repeat = Array.from(byGuest.values()).filter((entry) => entry.stays > 1).length;
    return {
      unique: byGuest.size,
      repeat,
      repeatRate: byGuest.size ? repeat / byGuest.size : 0,
      avgSpend: byGuest.size
        ? Array.from(byGuest.values()).reduce((acc, entry) => acc + entry.spend, 0) / byGuest.size
        : 0,
      topNationalities: Array.from(nationalities.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      topGuests: Array.from(byGuest.entries())
        .map(([guestId, entry]) => ({
          guest: guests.find((g) => g.id === guestId),
          ...entry,
        }))
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 10),
    };
  }, [inRangeBookings, guests, t]);

  const housekeeping = useMemo(() => {
    const inWindow = tasks.filter(
      (task) => !task.due_date || (task.due_date >= range.start && task.due_date <= range.end),
    );
    const cleaning = inWindow.filter((task) => task.type === "cleaning");
    const maintenance = inWindow.filter((task) => task.type === "maintenance");
    const cost = inWindow.reduce((acc, task) => acc + task.cost, 0);
    return {
      all: inWindow,
      cleaning,
      maintenance,
      cost,
      done: inWindow.filter((task) => task.status === "done").length,
      open: inWindow.filter((task) => task.status === "pending" || task.status === "in_progress").length,
    };
  }, [tasks, range]);

  /* --- Export ------------------------------------------------------- */

  const exportCurrent = () => {
    const stamp = `${range.start}-to-${range.end}`;
    switch (report) {
      case "financial":
        return exportCsv(
          `financial-report-${stamp}.csv`,
          trend.map((point) => ({
            period: point.label,
            revenue: (point.revenue / 100).toFixed(2),
            expenses: (point.expenses / 100).toFixed(2),
            profit: (point.profit / 100).toFixed(2),
            margin: point.revenue ? ((point.profit / point.revenue) * 100).toFixed(1) : "0",
            nights_sold: point.nightsSold,
            occupancy: (point.occupancy * 100).toFixed(1),
          })),
        );
      case "occupancy":
        return exportCsv(
          `occupancy-report-${stamp}.csv`,
          occupancyCells.map((cell) => ({
            date: cell.date,
            nights_sold: cell.nightsSold,
            nights_available: cell.nightsAvailable,
            occupancy: (cell.occupancy * 100).toFixed(1),
          })),
        );
      case "apartments":
        return exportCsv(
          `apartment-performance-${stamp}.csv`,
          apartmentPerformance.map((row) => ({
            code: row.apartment.code,
            apartment: row.apartment.name,
            revenue: (row.revenue / 100).toFixed(2),
            expenses: (row.expenses / 100).toFixed(2),
            profit: (row.profit / 100).toFixed(2),
            margin: (row.margin * 100).toFixed(1),
            occupancy: (row.occupancy * 100).toFixed(1),
            adr: (row.adr / 100).toFixed(2),
            revpar: (row.revpar / 100).toFixed(2),
            bookings: row.bookings,
            avg_stay: row.avgStay.toFixed(1),
            cancellation_rate: (row.cancellationRate * 100).toFixed(1),
          })),
        );
      case "sources":
        return exportCsv(
          `booking-sources-${stamp}.csv`,
          sourceRevenue.map((slice) => ({
            source: slice.label,
            revenue: (slice.value / 100).toFixed(2),
            share: (slice.share * 100).toFixed(1),
            bookings: sourceCounts.find((entry) => entry.key === slice.key)?.value ?? 0,
          })),
        );
      case "guests":
        return exportCsv(
          `guest-statistics-${stamp}.csv`,
          guestStats.topGuests.map((entry) => ({
            guest: entry.guest ? `${entry.guest.first_name} ${entry.guest.last_name}` : "",
            nationality: entry.guest?.nationality ?? "",
            stays: entry.stays,
            nights: entry.nights,
            spend: (entry.spend / 100).toFixed(2),
          })),
        );
      case "seasonality":
        return exportCsv(
          `seasonality-${stamp}.csv`,
          seasonality.map((point) => ({
            month: point.label,
            revenue: (point.revenue / 100).toFixed(2),
            occupancy: (point.occupancy * 100).toFixed(1),
            adr: (point.adr / 100).toFixed(2),
          })),
        );
      case "cancellations":
        return exportCsv(
          `cancellations-${stamp}.csv`,
          cancellations.map((booking) => ({
            reference: booking.reference,
            guest: `${booking.guest.first_name} ${booking.guest.last_name}`,
            apartment: booking.apartment.name,
            check_in: booking.check_in,
            nights: booking.nights,
            value_lost: (booking.total / 100).toFixed(2),
            reason: booking.cancellation_reason ?? "",
          })),
        );
      case "housekeeping":
      default:
        return exportCsv(
          `housekeeping-${stamp}.csv`,
          housekeeping.all.map((task) => ({
            type: task.type,
            title: task.title,
            apartment: task.apartment?.name ?? "",
            due_date: task.due_date ?? "",
            status: task.status,
            assignee: task.assignee ?? "",
            cost: (task.cost / 100).toFixed(2),
          })),
        );
    }
  };

  const apartmentColumns: Column<ApartmentPerformance>[] = [
    {
      key: "apartment",
      header: "Apartment",
      sortValue: (row) => row.apartment.name,
      cell: (row) => (
        <span className="block">
          <span className="block font-medium text-ink">{row.apartment.name}</span>
          <span className="block text-[12px] text-ink-3">{row.apartment.code}</span>
        </span>
      ),
    },
    {
      key: "revenue",
      header: "Revenue",
      align: "right",
      sortValue: (row) => row.revenue,
      cell: (row) => <span className="font-medium text-ink tnum">{money(row.revenue)}</span>,
    },
    {
      key: "expenses",
      header: "Expenses",
      align: "right",
      sortValue: (row) => row.expenses,
      cell: (row) => <span className="text-ink-2 tnum">{money(row.expenses)}</span>,
    },
    {
      key: "profit",
      header: "Profit",
      align: "right",
      sortValue: (row) => row.profit,
      cell: (row) => (
        <span className={row.profit < 0 ? "font-medium text-delta-down tnum" : "font-medium text-ink tnum"}>
          {money(row.profit)}
        </span>
      ),
    },
    {
      key: "margin",
      header: "Margin",
      align: "right",
      secondary: true,
      sortValue: (row) => row.margin,
      cell: (row) => <span className="text-ink-2 tnum">{percent(row.margin, 0)}</span>,
    },
    {
      key: "occupancy",
      header: "Occupancy",
      align: "right",
      sortValue: (row) => row.occupancy,
      cell: (row) => <span className="text-ink tnum">{percent(row.occupancy, 0)}</span>,
    },
    {
      key: "adr",
      header: "ADR",
      align: "right",
      sortValue: (row) => row.adr,
      cell: (row) => <span className="text-ink-2 tnum">{money(row.adr, { cents: false })}</span>,
    },
    {
      key: "revpar",
      header: "RevPAR",
      align: "right",
      sortValue: (row) => row.revpar,
      cell: (row) => <span className="text-ink-2 tnum">{money(row.revpar, { cents: false })}</span>,
    },
    {
      key: "bookings",
      header: "Bookings",
      align: "right",
      secondary: true,
      sortValue: (row) => row.bookings,
      cell: (row) => <span className="text-ink-2 tnum">{row.bookings}</span>,
    },
    {
      key: "avgStay",
      header: t.guests.averageStay,
      align: "right",
      secondary: true,
      sortValue: (row) => row.avgStay,
      cell: (row) => <span className="text-ink-2 tnum">{row.avgStay.toFixed(1)}n</span>,
    },
  ];

  const ranked = [...apartmentPerformance].sort((a, b) => b.revenue - a.revenue);

  return (
    <>
      <PageHeader
        title={t.reports.title}
        description={
          <>
            {label} · <span className="tnum">{formatDateRange(range.start, range.end)}</span>
          </>
        }
        actions={
          <>
            <Button variant="outline" icon={<Printer className="size-4" />} onClick={() => window.print()}>
              Print
            </Button>
            <Button variant="outline" icon={<FileSpreadsheet className="size-4" />} onClick={exportCurrent}>
              Export CSV
            </Button>
            <Button
              variant="primary"
              icon={<Download className="size-4" />}
              onClick={() => window.print()}
            >
              Save as PDF
            </Button>
          </>
        }
      />

      <FilterBar>
        <Tabs
          className="w-full border-0"
          value={report}
          onChange={setReport}
          tabs={REPORTS}
        />
      </FilterBar>

      {/* --- Financial ------------------------------------------------ */}
      {report === "financial" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <KpiCard label={t.dashboard.revenue} value={money(kpis.revenue, { cents: false })} delta={delta("revenue")} />
            <KpiCard label={t.dashboard.expenses} value={money(kpis.expenses, { cents: false })} delta={delta("expenses")} invertDelta />
            <KpiCard label={t.dashboard.netProfit} value={money(kpis.netProfit, { cents: false })} delta={delta("netProfit")} />
            <KpiCard
              label={t.reports.profitMargin}
              value={kpis.revenue ? percent(kpis.netProfit / kpis.revenue) : "—"}
              hint="net profit over revenue"
            />
            <KpiCard label={t.invoices.collected} value={money(kpis.collected, { cents: false })} delta={delta("collected")} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard
              title={t.reports.revenueExpensesProfit}
              description={t.reports.recognisedPerNight}
              series={[
                { key: "revenue", label: t.dashboard.revenue, color: "var(--series-1)" },
                { key: "expenses", label: t.dashboard.expenses, color: "var(--series-2)" },
                { key: "profit", label: t.dashboard.profit, color: "var(--series-3)" },
              ]}
              isEmpty={trend.every((point) => point.revenue === 0 && point.expenses === 0)}
              table={
                <ChartTable
                  columns={[
                    { key: "label", label: t.dashboard.period },
                    { key: "revenue", label: t.dashboard.revenue, align: "right" },
                    { key: "expenses", label: t.dashboard.expenses, align: "right" },
                    { key: "profit", label: t.dashboard.profit, align: "right" },
                    { key: "margin", label: t.dashboard.margin, align: "right" },
                  ]}
                  rows={trend.map((point) => ({
                    key: point.key,
                    label: point.label,
                    revenue: money(point.revenue),
                    expenses: money(point.expenses),
                    profit: money(point.profit),
                    margin: point.revenue ? percent(point.profit / point.revenue, 0) : "—",
                  }))}
                />
              }
            >
              <TrendChart
                data={trend}
                xKey="label"
                kind="line"
                series={[
                  { key: "revenue", label: t.dashboard.revenue, color: "var(--series-1)" },
                  { key: "expenses", label: t.dashboard.expenses, color: "var(--series-2)" },
                  { key: "profit", label: t.dashboard.profit, color: "var(--series-3)" },
                ]}
                formatValue={(value) => money(value)}
                formatAxis={(value) => money(value, { cents: false })}
              />
            </ChartCard>

            <ChartCard
              title={t.reports.cashFlow}
              description={t.ui.cashReceivedVsPaid}
              series={[
                { key: "inflow", label: t.reports.cashIn, color: "var(--series-3)" },
                { key: "outflow", label: t.reports.cashOut, color: "var(--series-2)" },
              ]}
              isEmpty={cashFlow.every((point) => point.inflow === 0 && point.outflow === 0)}
              table={
                <ChartTable
                  columns={[
                    { key: "label", label: t.dashboard.period },
                    { key: "inflow", label: t.reports.cashIn, align: "right" },
                    { key: "outflow", label: t.reports.cashOut, align: "right" },
                    { key: "net", label: t.reports.net, align: "right" },
                  ]}
                  rows={cashFlow.map((point) => ({
                    key: point.key,
                    label: point.label,
                    inflow: money(point.inflow),
                    outflow: money(point.outflow),
                    net: money(point.net),
                  }))}
                />
              }
            >
              <TrendChart
                data={cashFlow}
                xKey="label"
                kind="bar"
                series={[
                  { key: "inflow", label: t.reports.cashIn, color: "var(--series-3)" },
                  { key: "outflow", label: t.reports.cashOut, color: "var(--series-2)" },
                ]}
                formatValue={(value) => money(value)}
                formatAxis={(value) => money(value, { cents: false })}
              />
            </ChartCard>

            <ChartCard
              title={t.dashboard.expenseBreakdown}
              description={t.expenses.byCategoryThisPeriod}
              series={expenseSlices.map((slice) => ({
                key: slice.key,
                label: slice.label,
                color: categoryColor(slice.key as never),
              }))}
              isEmpty={expenseSlices.length === 0}
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

            <Card>
              <CardHeader
                title={t.reports.periodComparison}
                description={t.reports.thisPeriodAgainst}
              />
              <CardBody>
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-line">
                      <th scope="col" className="py-2 text-left text-[11px] font-medium uppercase tracking-wide text-ink-3">
                        Metric
                      </th>
                      <th scope="col" className="py-2 text-right text-[11px] font-medium uppercase tracking-wide text-ink-3">
                        This period
                      </th>
                      <th scope="col" className="py-2 text-right text-[11px] font-medium uppercase tracking-wide text-ink-3">
                        Previous
                      </th>
                      <th scope="col" className="py-2 text-right text-[11px] font-medium uppercase tracking-wide text-ink-3">
                        Last year
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <CompareRow
                      label={t.dashboard.revenue}
                      current={money(kpis.revenue)}
                      previous={money(previousKpis.revenue)}
                      lastYear={money(lastYearKpis.revenue)}
                    />
                    <CompareRow
                      label={t.dashboard.expenses}
                      current={money(kpis.expenses)}
                      previous={money(previousKpis.expenses)}
                      lastYear={money(lastYearKpis.expenses)}
                    />
                    <CompareRow
                      label={t.dashboard.netProfit}
                      current={money(kpis.netProfit)}
                      previous={money(previousKpis.netProfit)}
                      lastYear={money(lastYearKpis.netProfit)}
                    />
                    <CompareRow
                      label={t.dashboard.occupancy}
                      current={percent(kpis.occupancyRate)}
                      previous={percent(previousKpis.occupancyRate)}
                      lastYear={percent(lastYearKpis.occupancyRate)}
                    />
                    <CompareRow
                      label={t.dashboard.adr}
                      current={money(kpis.adr)}
                      previous={money(previousKpis.adr)}
                      lastYear={money(lastYearKpis.adr)}
                    />
                    <CompareRow
                      label={t.dashboard.revpar}
                      current={money(kpis.revpar)}
                      previous={money(previousKpis.revpar)}
                      lastYear={money(lastYearKpis.revpar)}
                    />
                    <CompareRow
                      label={t.dashboard.bookings}
                      current={number(kpis.bookings)}
                      previous={number(previousKpis.bookings)}
                      lastYear={number(lastYearKpis.bookings)}
                    />
                  </tbody>
                </table>
              </CardBody>
            </Card>
          </div>
        </div>
      ) : null}

      {/* --- Occupancy ------------------------------------------------ */}
      {report === "occupancy" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label={t.dashboard.occupancy} value={percent(kpis.occupancyRate)} delta={delta("occupancyRate")} />
            <KpiCard label={t.dashboard.nightsSold} value={number(kpis.nightsSold)} delta={delta("nightsSold")} />
            <KpiCard label={t.apartments.nightsAvailable} value={number(kpis.nightsAvailable)} />
            <KpiCard label={t.guests.averageStay} value={`${kpis.avgLengthOfStay.toFixed(1)}n`} delta={delta("avgLengthOfStay")} />
          </div>

          <Card>
            <CardHeader
              title={t.reports.dailyOccupancy}
              description={t.reports.eachCellOneNight}
              action={<HeatLegend />}
            />
            <CardBody>
              <HeatStrip
                cells={occupancyCells.map((cell) => ({
                  key: cell.date,
                  value: cell.occupancy,
                  label: `${cell.date} — ${cell.nightsSold}/${cell.nightsAvailable} (${percent(cell.occupancy, 0)})`,
                }))}
              />
            </CardBody>
          </Card>

          <ChartCard
            title={t.reports.occupancyTrend}
            description={t.reports.shareOfNightsSold}
            isEmpty={trend.every((point) => point.nightsSold === 0)}
            table={
              <ChartTable
                columns={[
                  { key: "label", label: t.dashboard.period },
                  { key: "occupancy", label: t.dashboard.occupancy, align: "right" },
                  { key: "sold", label: t.reports.sold, align: "right" },
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
        </div>
      ) : null}

      {/* --- Apartment performance ------------------------------------ */}
      {report === "apartments" ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title={t.reports.topPerformers}
              description={t.reports.highestRevenue}
              isEmpty={ranked.length === 0}
              table={
                <ChartTable
                  columns={[
                    { key: "label", label: t.bookings.colApartment },
                    { key: "revenue", label: t.dashboard.revenue, align: "right" },
                  ]}
                  rows={ranked.slice(0, 6).map((row) => ({
                    key: row.apartment.id,
                    label: row.apartment.name,
                    revenue: money(row.revenue),
                  }))}
                />
              }
            >
              <RankedBars
                rows={ranked.slice(0, 6).map((row) => ({
                  key: row.apartment.id,
                  label: row.apartment.name,
                  value: row.revenue,
                  color: "var(--series-1)",
                  sublabel: percent(row.occupancy, 0),
                }))}
                formatValue={(value) => money(value, { cents: false })}
              />
            </ChartCard>

            <ChartCard
              title={t.reports.lowestPerformers}
              description={t.ui.leastRevenue}
              isEmpty={ranked.length === 0}
              table={
                <ChartTable
                  columns={[
                    { key: "label", label: t.bookings.colApartment },
                    { key: "revenue", label: t.dashboard.revenue, align: "right" },
                  ]}
                  rows={ranked.slice(-6).reverse().map((row) => ({
                    key: row.apartment.id,
                    label: row.apartment.name,
                    revenue: money(row.revenue),
                  }))}
                />
              }
            >
              <RankedBars
                rows={ranked
                  .slice(-6)
                  .reverse()
                  .map((row) => ({
                    key: row.apartment.id,
                    label: row.apartment.name,
                    value: row.revenue,
                    color: "var(--series-2)",
                    sublabel: percent(row.occupancy, 0),
                  }))}
                formatValue={(value) => money(value, { cents: false })}
              />
            </ChartCard>
          </div>

          <DataTable
            rows={apartmentPerformance}
            columns={apartmentColumns}
            rowKey={(row) => row.apartment.id}
            paginate={false}
            maxHeight="calc(100dvh - 420px)"
            emptyTitle={t.reports.noApartmentData}
          />
        </div>
      ) : null}

      {/* --- Booking sources ------------------------------------------ */}
      {report === "sources" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title={t.reports.revenueBySource}
            description={t.reports.whereMoneyCame}
            series={sourceRevenue.map((slice) => ({
              key: slice.key,
              label: slice.label,
              color: sourceColor(slice.key as never),
            }))}
            isEmpty={sourceRevenue.length === 0}
            table={
              <ChartTable
                columns={[
                  { key: "label", label: t.bookings.colSource },
                  { key: "revenue", label: t.dashboard.revenue, align: "right" },
                  { key: "share", label: t.dashboard.share, align: "right" },
                ]}
                rows={sourceRevenue.map((slice) => ({
                  key: slice.key,
                  swatch: sourceColor(slice.key as never),
                  label: slice.label,
                  revenue: money(slice.value),
                  share: percent(slice.share),
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
              centerValue={money(kpis.revenue, { cents: false })}
              centerLabel="total"
            />
          </ChartCard>

          <ChartCard
            title={t.reports.bookingsBySource}
            description={t.reports.reservationCounts}
            series={sourceCounts.map((slice) => ({
              key: slice.key,
              label: slice.label,
              color: sourceColor(slice.key as never),
            }))}
            isEmpty={sourceCounts.length === 0}
            table={
              <ChartTable
                columns={[
                  { key: "label", label: t.bookings.colSource },
                  { key: "count", label: t.dashboard.bookings, align: "right" },
                  { key: "share", label: t.dashboard.share, align: "right" },
                ]}
                rows={sourceCounts.map((slice) => ({
                  key: slice.key,
                  swatch: sourceColor(slice.key as never),
                  label: slice.label,
                  count: number(slice.value),
                  share: percent(slice.share),
                }))}
              />
            }
          >
            <RankedBars
              rows={sourceCounts.map((slice) => ({
                key: slice.key,
                label: slice.label,
                value: slice.value,
                color: sourceColor(slice.key as never),
                sublabel: percent(slice.share, 0),
              }))}
              formatValue={(value) => `${value}`}
            />
          </ChartCard>
        </div>
      ) : null}

      {/* --- Guest statistics ----------------------------------------- */}
      {report === "guests" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label={t.reports.uniqueGuests} value={number(guestStats.unique)} hint="with a stay in this period" />
            <KpiCard label={t.reports.repeatGuests} value={number(guestStats.repeat)} hint="more than one stay" />
            <KpiCard label={t.reports.repeatRate} value={percent(guestStats.repeatRate)} />
            <KpiCard label={t.reports.averageSpend} value={money(guestStats.avgSpend, { cents: false })} hint="per guest" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title={t.reports.topNationalities}
              description={t.reports.whereGuestsFrom}
              isEmpty={guestStats.topNationalities.length === 0}
              table={
                <ChartTable
                  columns={[
                    { key: "label", label: t.guests.nationality },
                    { key: "count", label: t.availability.guests, align: "right" },
                  ]}
                  rows={guestStats.topNationalities.map((entry) => ({
                    key: entry.name,
                    label: entry.name,
                    count: number(entry.count),
                  }))}
                />
              }
            >
              <RankedBars
                rows={guestStats.topNationalities.map((entry) => ({
                  key: entry.name,
                  label: entry.name,
                  value: entry.count,
                  color: "var(--series-1)",
                }))}
                formatValue={(value) => `${value}`}
              />
            </ChartCard>

            <Card>
              <CardHeader title={t.reports.highestValueGuests} description={t.ui.bySpendThisPeriod} />
              <CardBody className="px-0">
                <ul className="divide-y divide-line">
                  {guestStats.topGuests.map((entry, index) => (
                    <li key={entry.guest?.id ?? `guest-${index}`} className="flex items-center gap-3 px-6 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] text-ink">
                          {entry.guest ? `${entry.guest.first_name} ${entry.guest.last_name}` : "—"}
                        </span>
                        <span className="block text-[12px] text-ink-3">
                          {entry.stays} stays · {entry.nights} nights
                        </span>
                      </span>
                      <span className="shrink-0 text-[13.5px] font-medium text-ink tnum">
                        {money(entry.spend)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>
        </div>
      ) : null}

      {/* --- Seasonality ---------------------------------------------- */}
      {report === "seasonality" ? (
        <div className="space-y-4">
          <ChartCard
            title={t.reports.revenueByMonth}
            description={t.reports.aggregatedAcrossYears}
            isEmpty={seasonality.every((point) => point.revenue === 0)}
            table={
              <ChartTable
                columns={[
                  { key: "label", label: t.reports.month },
                  { key: "revenue", label: t.dashboard.revenue, align: "right" },
                  { key: "occupancy", label: t.dashboard.occupancy, align: "right" },
                  { key: "adr", label: t.dashboard.adr, align: "right" },
                ]}
                rows={seasonality.map((point) => ({
                  key: String(point.month),
                  label: point.label,
                  revenue: money(point.revenue),
                  occupancy: percent(point.occupancy),
                  adr: money(point.adr),
                }))}
              />
            }
          >
            <TrendChart
              data={seasonality}
              xKey="label"
              kind="bar"
              series={[{ key: "revenue", label: t.dashboard.revenue, color: "var(--series-1)" }]}
              formatValue={(value) => money(value)}
              formatAxis={(value) => money(value, { cents: false })}
            />
          </ChartCard>

          <ChartCard
            title={t.reports.occupancyAndRate}
            description="Occupancy shown as a percentage; ADR gets its own chart to avoid a second axis."
            isEmpty={seasonality.every((point) => point.occupancy === 0)}
            table={
              <ChartTable
                columns={[
                  { key: "label", label: t.reports.month },
                  { key: "occupancy", label: t.dashboard.occupancy, align: "right" },
                ]}
                rows={seasonality.map((point) => ({
                  key: String(point.month),
                  label: point.label,
                  occupancy: percent(point.occupancy),
                }))}
              />
            }
          >
            <TrendChart
              data={seasonality.map((point) => ({ ...point, occupancyPct: point.occupancy * 100 }))}
              xKey="label"
              kind="line"
              series={[{ key: "occupancyPct", label: t.dashboard.occupancy, color: "var(--series-2)" }]}
              formatValue={(value) => `${value.toFixed(1)}%`}
              formatAxis={(value) => `${Math.round(value)}%`}
            />
          </ChartCard>
        </div>
      ) : null}

      {/* --- Cancellations -------------------------------------------- */}
      {report === "cancellations" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label={t.reports.cancellations} value={number(cancellations.length)} />
            <KpiCard label={t.guests.cancellationRate} value={percent(kpis.cancellationRate)} delta={delta("cancellationRate")} invertDelta />
            <KpiCard
              label={t.reports.valueLost}
              value={money(cancellations.reduce((acc, b) => acc + b.total, 0), { cents: false })}
            />
            <KpiCard
              label={t.reports.nightsReleased}
              value={number(cancellations.reduce((acc, b) => acc + b.nights, 0))}
            />
          </div>

          <DataTable
            rows={cancellations}
            columns={[
              {
                key: "reference",
                header: "Booking",
                sortValue: (row) => row.reference,
                cell: (row) => <span className="font-medium text-ink">{row.reference}</span>,
              },
              {
                key: "guest",
                header: "Guest",
                sortValue: (row) => row.guest.last_name,
                cell: (row) => (
                  <span className="text-ink">
                    {row.guest.first_name} {row.guest.last_name}
                  </span>
                ),
              },
              {
                key: "apartment",
                header: "Apartment",
                sortValue: (row) => row.apartment.name,
                cell: (row) => <span className="text-ink-2">{row.apartment.name}</span>,
              },
              {
                key: "check_in",
                header: t.reports.wasArriving,
                sortValue: (row) => row.check_in,
                cell: (row) => <span className="text-ink tnum">{row.check_in}</span>,
              },
              {
                key: "status",
                header: "Status",
                sortValue: (row) => row.status,
                cell: (row) => <StatusBadge size="sm" meta={BOOKING_STATUS_META[row.status]} />,
              },
              {
                key: "reason",
                header: "Reason",
                secondary: true,
                cell: (row) => (
                  <span className="text-ink-2">{row.cancellation_reason ?? "—"}</span>
                ),
              },
              {
                key: "total",
                header: t.reports.valueLost,
                align: "right",
                sortValue: (row) => row.total,
                cell: (row) => <span className="font-medium text-ink tnum">{money(row.total)}</span>,
              },
            ]}
            rowKey={(row) => row.id}
            emptyTitle={t.reports.noCancellations}
            emptyDescription={t.reports.everyReservationHeld}
            maxHeight="calc(100dvh - 420px)"
          />
        </div>
      ) : null}

      {/* --- Housekeeping --------------------------------------------- */}
      {report === "housekeeping" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <KpiCard label={t.reports.cleaningTasks} value={number(housekeeping.cleaning.length)} icon={<Sparkles />} />
            <KpiCard label={t.reports.maintenanceTasks} value={number(housekeeping.maintenance.length)} icon={<Wrench />} />
            <KpiCard label={t.reports.completed} value={number(housekeeping.done)} />
            <KpiCard label={t.invoices.stillOpen} value={number(housekeeping.open)} />
            <KpiCard label={t.expenses.taskCost} value={money(housekeeping.cost, { cents: false })} />
          </div>

          <DataTable
            rows={housekeeping.all}
            columns={[
              {
                key: "type",
                header: "Type",
                sortValue: (row) => row.type,
                cell: (row) => (
                  <span className="flex items-center gap-2 text-ink">
                    {row.type === "cleaning" ? (
                      <Sparkles className="size-4 text-warning" aria-hidden />
                    ) : (
                      <Wrench className="size-4 text-serious" aria-hidden />
                    )}
                    {row.type === "cleaning" ? "Cleaning" : "Maintenance"}
                  </span>
                ),
              },
              {
                key: "title",
                header: "Task",
                sortValue: (row) => row.title,
                cell: (row) => <span className="text-ink">{row.title}</span>,
              },
              {
                key: "apartment",
                header: "Apartment",
                sortValue: (row) => row.apartment?.name ?? "",
                cell: (row) => <span className="text-ink-2">{row.apartment?.name ?? "—"}</span>,
              },
              {
                key: "assignee",
                header: "Assignee",
                secondary: true,
                sortValue: (row) => row.assignee ?? "",
                cell: (row) => <span className="text-ink-2">{row.assignee ?? "—"}</span>,
              },
              {
                key: "due",
                header: "Due",
                sortValue: (row) => row.due_date ?? "",
                cell: (row) => <span className="text-ink tnum">{row.due_date ?? "—"}</span>,
              },
              {
                key: "status",
                header: "Status",
                sortValue: (row) => row.status,
                cell: (row) => <StatusBadge size="sm" meta={TASK_STATUS_META[row.status]} />,
              },
              {
                key: "cost",
                header: "Cost",
                align: "right",
                sortValue: (row) => row.cost,
                cell: (row) => <span className="text-ink tnum">{money(row.cost)}</span>,
              },
            ]}
            rowKey={(row) => row.id}
            emptyTitle={t.reports.noTasks}
            maxHeight="calc(100dvh - 420px)"
          />
        </div>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */

function CompareRow({
  label,
  current,
  previous,
  lastYear,
}: {
  label: string;
  current: string;
  previous: string;
  lastYear: string;
}) {
  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-2.5 text-ink">{label}</td>
      <td className="py-2.5 text-right font-medium text-ink tnum">{current}</td>
      <td className="py-2.5 text-right text-ink-2 tnum">{previous}</td>
      <td className="py-2.5 text-right text-ink-2 tnum">{lastYear}</td>
    </tr>
  );
}
