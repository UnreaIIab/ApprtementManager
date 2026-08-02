"use client";

import { useId, type ReactNode } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import type { SeriesDef } from "./chart-card";

/**
 * Chart primitives.
 *
 * Shared conventions, applied here once rather than at each call site:
 *   * 2px strokes, 4px rounded bar ends, hairline solid grid (never dashed),
 *     no vertical gridlines.
 *   * A 2px surface-colored stroke separates stacked segments and adjacent
 *     bars — the gap is the separator, not an outline.
 *   * One y-axis, always. Two measures at different scales get two charts.
 *   * A hover tooltip is present by default; it enhances the axis reading
 *     rather than being the only way to get a value (see the table twin).
 */

const AXIS_TICK = { fontSize: 11, fill: "var(--ink-3)" };
const GRID_STROKE = "var(--grid)";

/* ------------------------------------------------------------------ */
/* Tooltip                                                             */
/* ------------------------------------------------------------------ */

interface TooltipEntry {
  name?: string;
  dataKey?: string | number;
  value?: number;
  color?: string;
  payload?: Record<string, unknown>;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
}

/**
 * Recharts types the `content` render prop far wider than what it actually
 * passes (names can be numbers, values can be arrays). Narrowing once here
 * keeps the cast out of every chart.
 */
function narrowTooltip(props: unknown): ChartTooltipProps {
  return props as ChartTooltipProps;
}

function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
  labelFormatter,
}: ChartTooltipProps & {
  formatValue: (value: number, key: string) => string;
  labelFormatter?: (label: string | number) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 shadow-lg">
      <p className="mb-1.5 text-[12px] font-medium text-ink">
        {labelFormatter ? labelFormatter(label ?? "") : label}
      </p>
      <ul className="space-y-1">
        {payload.map((entry, index) => (
          <li key={index} className="flex items-center gap-2 text-[12px]">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-[2px]"
              style={{ background: entry.color }}
            />
            <span className="text-ink-2">{entry.name}</span>
            <span className="ml-auto pl-3 font-medium text-ink tnum">
              {formatValue(entry.value ?? 0, String(entry.dataKey ?? ""))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Trend chart — area / line / bar over time                           */
/* ------------------------------------------------------------------ */

export type TrendKind = "area" | "line" | "bar";

export function TrendChart<T extends object>({
  data,
  series,
  xKey,
  kind = "area",
  height = 260,
  formatValue,
  formatAxis,
  stacked = false,
}: {
  data: T[];
  series: SeriesDef[];
  xKey: string;
  kind?: TrendKind;
  height?: number;
  formatValue: (value: number, key: string) => string;
  formatAxis: (value: number) => string;
  stacked?: boolean;
}) {
  const gradientId = useId().replace(/:/g, "");
  // Dense series get fewer ticks so labels never collide.
  const tickInterval = data.length > 24 ? Math.floor(data.length / 8) : 0;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
        <defs>
          {series.map((entry, index) => (
            <linearGradient
              key={entry.key}
              id={`${gradientId}-${index}`}
              x1="0" y1="0" x2="0" y2="1"
            >
              <stop offset="0%" stopColor={entry.color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={entry.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>

        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: "var(--axis)" }}
          interval={tickInterval}
          minTickGap={8}
          tickMargin={8}
        />
        <YAxis
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={52}
          tickFormatter={formatAxis}
        />
        <Tooltip
          cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
          content={(props) => <ChartTooltip {...narrowTooltip(props)} formatValue={formatValue} />}
        />

        {series.map((entry, index) => {
          if (kind === "bar") {
            return (
              <Bar
                key={entry.key}
                dataKey={entry.key}
                name={entry.label}
                fill={entry.color}
                stackId={stacked ? "stack" : undefined}
                radius={stacked ? 0 : [4, 4, 0, 0]}
                maxBarSize={38}
                // Surface-colored stroke *is* the 2px gap between segments.
                stroke={stacked ? "var(--surface)" : undefined}
                strokeWidth={stacked ? 2 : 0}
              />
            );
          }
          if (kind === "line") {
            return (
              <Line
                key={entry.key}
                type="monotone"
                dataKey={entry.key}
                name={entry.label}
                stroke={entry.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
              />
            );
          }
          return (
            <Area
              key={entry.key}
              type="monotone"
              dataKey={entry.key}
              name={entry.label}
              stroke={entry.color}
              strokeWidth={2}
              fill={`url(#${gradientId}-${index})`}
              stackId={stacked ? "stack" : undefined}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
            />
          );
        })}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ */
/* Ranked horizontal bars                                              */
/* ------------------------------------------------------------------ */

/**
 * Ranked comparison. Values are direct-labelled at the bar end, which is what
 * makes this readable without hovering — and what satisfies the relief rule for
 * the light-mode palette steps that fall below 3:1 contrast.
 */
export function RankedBars({
  rows,
  formatValue,
  max,
  className,
}: {
  rows: { key: string; label: string; value: number; color: string; sublabel?: string }[];
  formatValue: (value: number) => string;
  max?: number;
  className?: string;
}) {
  const peak = max ?? Math.max(...rows.map((row) => Math.abs(row.value)), 1);

  return (
    <ul className={cn("space-y-2.5 px-3 py-2", className)}>
      {rows.map((row) => (
        <li key={row.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[13px] text-ink">{row.label}</span>
            <span className="shrink-0 text-[13px] font-medium text-ink tnum">
              {formatValue(row.value)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.max(2, (Math.abs(row.value) / peak) * 100)}%`,
                  background: row.color,
                }}
              />
            </div>
            {row.sublabel ? (
              <span className="w-14 shrink-0 text-right text-[11px] text-ink-3 tnum">
                {row.sublabel}
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Donut                                                               */
/* ------------------------------------------------------------------ */

/**
 * Part-to-whole at a glance, capped at six segments — past that the slices stop
 * being comparable and the caller should fold the tail into "Other".
 */
export function DonutChart({
  slices,
  formatValue,
  height = 240,
  centerLabel,
  centerValue,
}: {
  slices: { key: string; label: string; value: number; color: string }[];
  formatValue: (value: number) => string;
  height?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="label"
            innerRadius="62%"
            outerRadius="88%"
            paddingAngle={2}
            startAngle={90}
            endAngle={-270}
            stroke="var(--surface)"
            strokeWidth={2}
          >
            {slices.map((slice) => (
              <Cell key={slice.key} fill={slice.color} />
            ))}
          </Pie>
          <Tooltip
            content={(props) => (
              <ChartTooltip {...narrowTooltip(props)} formatValue={(value) => formatValue(value)} />
            )}
          />
        </PieChart>
      </ResponsiveContainer>

      {centerValue ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[19px] font-semibold tracking-[-0.02em] text-ink">
            {centerValue}
          </span>
          {centerLabel ? (
            <span className="mt-0.5 text-[11px] text-ink-3">{centerLabel}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sparkline                                                           */
/* ------------------------------------------------------------------ */

/** Bare trend shape for KPI tiles — no axes, no tooltip, no legend. */
export function Sparkline({
  values,
  color = "var(--series-1)",
  height = 34,
  className,
}: {
  values: number[];
  color?: string;
  height?: number;
  className?: string;
}) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = 100 / (values.length - 1);
  const points = values
    .map((value, index) => `${index * step},${100 - ((value - min) / span) * 100}`)
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      height={height}
      className={cn("w-full", className)}
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Occupancy heat strip                                                */
/* ------------------------------------------------------------------ */

/**
 * Sequential magnitude on one hue, light → dark. The numeric value stays
 * available in the tooltip and the table twin, so color is never the only
 * channel carrying it.
 */
export function HeatStrip({
  cells,
  formatLabel,
  className,
}: {
  cells: { key: string; value: number; label: string }[];
  formatLabel?: (cell: { key: string; value: number; label: string }) => string;
  className?: string;
}) {
  const steps = [
    "var(--seq-1)", "var(--seq-2)", "var(--seq-3)",
    "var(--seq-4)", "var(--seq-5)", "var(--seq-6)",
  ];

  return (
    <div className={cn("flex flex-wrap gap-[3px]", className)}>
      {cells.map((cell) => {
        const index = Math.min(steps.length - 1, Math.floor(cell.value * steps.length));
        return (
          <span
            key={cell.key}
            title={formatLabel?.(cell) ?? cell.label}
            className="h-6 min-w-[10px] flex-1 rounded-[3px]"
            style={{ background: cell.value <= 0 ? "var(--surface-3)" : steps[index] }}
          />
        );
      })}
    </div>
  );
}

export function HeatLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-[11px] text-ink-3", className)}>
      <span>0%</span>
      <span className="flex gap-[2px]">
        {["var(--seq-1)", "var(--seq-2)", "var(--seq-3)", "var(--seq-4)", "var(--seq-5)", "var(--seq-6)"].map(
          (step) => (
            <span key={step} className="size-3 rounded-[2px]" style={{ background: step }} />
          ),
        )}
      </span>
      <span>100%</span>
    </div>
  );
}

export type { ReactNode };
