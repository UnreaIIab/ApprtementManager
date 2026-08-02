"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { DeltaBadge } from "@/components/ui/badge";
import { Sparkline } from "@/components/charts/charts";
import { Skeleton } from "@/components/ui/feedback";

/**
 * KPI tile.
 *
 * A single headline number is a stat tile, not a chart — the optional sparkline
 * carries shape only, with no axes or labels competing with the figure. The
 * value uses proportional figures; `tabular-nums` is reserved for columns that
 * must align vertically.
 */
export function KpiCard({
  label,
  value,
  delta,
  deltaLabel = "vs previous period",
  invertDelta,
  hint,
  icon,
  spark,
  sparkColor,
  href,
  loading,
  className,
}: {
  label: string;
  value: string;
  /** Fractional change vs the comparison window; `null` when incomparable. */
  delta?: number | null;
  deltaLabel?: string;
  invertDelta?: boolean;
  hint?: ReactNode;
  icon?: ReactNode;
  spark?: number[];
  sparkColor?: string;
  href?: string;
  loading?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-medium text-ink-2">{label}</p>
        {icon ? <span className="shrink-0 text-ink-3 [&>svg]:size-4">{icon}</span> : null}
      </div>

      {loading ? (
        <Skeleton className="mt-2.5 h-8 w-28" />
      ) : (
        <p className="mt-1.5 text-[27px] font-semibold leading-none tracking-[-0.03em] text-ink">
          {value}
        </p>
      )}

      <div className="mt-2.5 flex min-h-[18px] items-center gap-2">
        {loading ? (
          <Skeleton className="h-3 w-24" />
        ) : delta !== undefined ? (
          <>
            <DeltaBadge value={delta} invert={invertDelta} />
            <span className="truncate text-[11.5px] text-ink-3">{deltaLabel}</span>
          </>
        ) : hint ? (
          <span className="truncate text-[11.5px] text-ink-3">{hint}</span>
        ) : null}
      </div>

      {spark && spark.length > 1 && !loading ? (
        <Sparkline values={spark} color={sparkColor} className="mt-3" />
      ) : null}
    </>
  );

  const classes = cn(
    "group block rounded-card border border-line bg-surface p-4 shadow-sm sm:p-5",
    "transition-[border-color,box-shadow,transform] duration-200",
    href && "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md",
    className,
  );

  return href ? (
    <Link href={href} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

/**
 * Status count tile used by the apartment overview.
 * Clicking filters the list below — the count and the filter are the same action.
 */
export function StatusTile({
  label,
  count,
  color,
  active,
  onClick,
}: {
  label: string;
  count: number;
  color: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-w-0 flex-col items-start gap-1.5 rounded-xl border p-3 text-left",
        "transition-[border-color,background-color,transform] duration-150",
        "hover:-translate-y-0.5",
        active
          ? "border-ink bg-surface-3"
          : "border-line bg-surface hover:border-line-strong",
      )}
    >
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ background: color }}
        />
        <span className="truncate text-[12px] font-medium text-ink-2">{label}</span>
      </span>
      <span className="text-[22px] font-semibold leading-none tracking-[-0.02em] text-ink">
        {count}
      </span>
    </button>
  );
}
