"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, CircleDollarSign, Percent, Plus, Receipt, TrendingUp } from "lucide-react";
import { useAnalytics } from "@/hooks/use-analytics";
import { useDateFilter } from "@/hooks/use-date-filter";
import { formatDateRange, money, moneyCompact, number, percent } from "@/lib/format";
import { useT } from "@/i18n";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { TodaysOperations } from "@/components/dashboard/todays-operations";
import { ChartCard, ChartTable } from "@/components/charts/chart-card";
import { TrendChart } from "@/components/charts/charts";
import { Button } from "@/components/ui/button";

/**
 * Dashboard.
 *
 * Answers two questions and no others: *are we making money* and *what happens
 * today*. Everything that answers **why** — booking sources, expenses by
 * category, ADR, RevPAR, per-apartment performance — lives in Reports, which is
 * one click away and where you go when a number here surprises you.
 *
 * Four figures, not thirteen. A tile that nobody acts on costs the same screen
 * space as one that changes a decision, and the crowd is what makes the page
 * hard to read: with everything emphasised, nothing is.
 */
export default function DashboardPage() {
  const t = useT();
  const router = useRouter();
  const { range, label } = useDateFilter();
  const { kpis, trend, delta, loading, refetching } = useAnalytics();

  const revenueSpark = trend.map((point) => point.revenue);
  const expenseSpark = trend.map((point) => point.expenses);
  const profitSpark = trend.map((point) => point.profit);
  const occupancySpark = trend.map((point) => point.occupancy);

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

      {/* --- The four numbers ---------------------------------------- */}
      {/*
        Money in, money out, what is left, and how full the portfolio was. Each
        tile carries the same shape of information — figure, change against the
        previous period, and a sparkline for the trend behind it — so the row
        reads as one comparison rather than four unrelated cards.
      */}
      <section aria-label={t.dashboard.kpiSection} className="mb-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
            label={t.dashboard.expenses}
            value={money(kpis.expenses, { cents: false })}
            delta={delta("expenses")}
            // Costs going up is not good news, so the badge's colour flips.
            invertDelta
            icon={<Receipt />}
            spark={expenseSpark}
            sparkColor="var(--series-2)"
            loading={loading}
            href="/expenses"
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
            label={t.dashboard.occupancyRate}
            value={percent(kpis.occupancyRate)}
            delta={delta("occupancyRate")}
            icon={<Percent />}
            spark={occupancySpark}
            sparkColor="var(--series-4)"
            loading={loading}
          />
        </div>
      </section>

      {/* --- The two charts ------------------------------------------ */}
      {/*
        Money and occupancy are different units, so they are two plots on two
        axes rather than one plot with two scales — a dual axis would invent a
        correlation the data does not contain.
      */}
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
            series={[
              { key: "occupancyPct", label: t.dashboard.occupancy, color: "var(--series-4)" },
            ]}
            formatValue={(value) => `${value.toFixed(1)}%`}
            formatAxis={(value) => `${Math.round(value)}%`}
          />
        </ChartCard>
      </section>

      {/* --- Today ---------------------------------------------------- */}
      <section>
        <TodaysOperations />
      </section>

      {/* --- Where the rest went -------------------------------------- */}
      {/*
        Removing a figure from a dashboard is only an improvement if the reader
        can still find it. This says where it went instead of leaving people to
        wonder whether it was lost.
      */}
      <section className="mt-4">
        <Link
          href="/reports"
          className="flex flex-col items-start gap-2 rounded-card border border-line bg-surface-2 px-5 py-3.5 transition-colors hover:bg-surface-3 sm:flex-row sm:items-center sm:gap-3"
        >
          <BarChart3 className="size-4 shrink-0 text-ink-3" aria-hidden />
          <span className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-ink-2">
            {t.dashboard.moreInReports}
          </span>
          <span className="shrink-0 text-[12.5px] font-medium text-brand">
            {t.dashboard.openReports}
          </span>
        </Link>
      </section>
    </>
  );
}
