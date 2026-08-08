"use client";

import { useState, type ReactNode } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/tabs";
import { EmptyState, Skeleton } from "@/components/ui/feedback";

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
}

/**
 * The frame every chart in the app renders inside.
 *
 * It guarantees three things the charts themselves shouldn't have to remember:
 *
 *  * **A legend whenever there is more than one series** — identity is never
 *    carried by color alone. A single-series chart gets none; its title names it.
 *  * **A table-view twin.** Three of the light-mode palette steps sit below 3:1
 *    against the card surface, so the accessible fallback is not optional — every
 *    value must be readable as text.
 *  * **No per-card date control.** Scope comes from the one global filter.
 */
export function ChartCard({
  title,
  description,
  series = [],
  action,
  children,
  table,
  loading,
  refetching,
  isEmpty,
  emptyMessage,
  className,
  footnote,
}: {
  title: string;
  description?: string;
  series?: SeriesDef[];
  action?: ReactNode;
  children: ReactNode;
  /** Rendered in table view; also the WCAG-clean reading of the same numbers. */
  table: ReactNode;
  loading?: boolean;
  refetching?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  className?: string;
  footnote?: ReactNode;
}) {
  const t = useT();
  const [view, setView] = useState<"chart" | "table">("chart");

  return (
    <Card className={cn("flex min-w-0 flex-col", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-2 pt-5 sm:px-6 sm:pt-6">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
          {description ? <p className="mt-0.5 text-[13px] text-ink-2">{description}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          <Segmented
            size="sm"
            ariaLabel={`${title} view`}
            value={view}
            onChange={setView}
            options={[
              { value: "chart", label: t.ui.chartView, icon: <BarChart3 /> },
              { value: "table", label: t.ui.tableView, icon: <Table2 /> },
            ]}
          />
        </div>
      </div>

      {series.length > 1 && view === "chart" ? (
        <Legend series={series} className="px-5 pb-1 sm:px-6" />
      ) : null}

      <div className={cn("min-w-0 flex-1 px-2 pb-4 sm:px-3", refetching && "is-refetching")}>
        {loading ? (
          <div className="px-3 py-4">
            <Skeleton className="h-[240px] w-full" />
          </div>
        ) : isEmpty ? (
          <EmptyState compact title={t.ui.nothingToChart} description={emptyMessage ?? t.ui.noDataInPeriod} />
        ) : view === "chart" ? (
          children
        ) : (
          <div className="max-h-[340px] overflow-auto px-3 pt-1">{table}</div>
        )}
      </div>

      {footnote ? (
        <p className="border-t border-line px-5 py-2.5 text-[12px] text-ink-3 sm:px-6">{footnote}</p>
      ) : null}
    </Card>
  );
}

export function Legend({ series, className }: { series: SeriesDef[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {series.map((entry) => (
        <li key={entry.key} className="flex items-center gap-1.5 text-[12px] text-ink-2">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-[3px]"
            style={{ background: entry.color }}
          />
          {entry.label}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */

/** The table twin. Values wear ink tokens; the series color rides a swatch. */
export function ChartTable({
  columns,
  rows,
}: {
  columns: { key: string; label: string; align?: "left" | "right" }[];
  rows: (Record<string, ReactNode> & { key: string; swatch?: string })[];
}) {
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead className="sticky-head">
        <tr className="border-b border-line">
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              className={cn(
                "px-2 py-2 text-[11px] font-medium uppercase tracking-wide text-ink-3",
                column.align === "right" ? "text-right" : "text-left",
              )}
            >
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-b border-line last:border-0">
            {columns.map((column, index) => (
              <td
                key={column.key}
                className={cn(
                  "px-2 py-2 text-ink",
                  column.align === "right" ? "text-right tnum" : "text-left",
                )}
              >
                {index === 0 && row.swatch ? (
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-[3px]"
                      style={{ background: row.swatch }}
                    />
                    {row[column.key]}
                  </span>
                ) : (
                  row[column.key]
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
