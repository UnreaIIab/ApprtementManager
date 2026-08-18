"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/lib/constants";
import { useT } from "@/i18n";
import { Button, IconButton } from "./button";
import { EmptyState, Skeleton } from "./feedback";

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Cell renderer. Keep it presentational — sorting uses `sortValue`. */
  cell: (row: T) => ReactNode;
  /** Sort key. Omit to make the column unsortable. */
  sortValue?: (row: T) => string | number;
  /** CSV value; falls back to `sortValue` then the raw key. */
  exportValue?: (row: T) => string | number;
  align?: "left" | "right" | "center";
  width?: string;
  className?: string;
  headerClassName?: string;
  /** Hidden below `lg` — for columns that are useful but not essential. */
  secondary?: boolean;
}

export interface SortState {
  key: string;
  direction: "asc" | "desc";
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  /** Held at reduced opacity during a refetch instead of flashing a skeleton. */
  refetching?: boolean;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: () => void;
  emptyActionLabel?: string;
  /** Rendered above the header row and stays put while the body scrolls. */
  toolbar?: ReactNode;
  bulkActions?: (selected: string[]) => ReactNode;
  pageSize?: number;
  paginate?: boolean;
  /**
   * Caps body height so the sticky header has something to stick to.
   *
   * Only for a table that *is* the page — a list screen where the shell around
   * it does not scroll. On a page where the table is one block among charts and
   * cards, an inner scroll area swallows the wheel on the way down and the page
   * appears to stop moving. Leave it unset there and let the page scroll as one;
   * pagination already bounds how many rows render.
   */
  maxHeight?: string;
  className?: string;
  rowClassName?: (row: T) => string | undefined;
  footer?: ReactNode;
}

/**
 * The list primitive behind every table in the app.
 *
 * Sorting and pagination are local because the whole working set is already in
 * memory (see `repository.snapshot`), which keeps interactions instant. Header
 * cells are sticky, selection is preserved across sorting, and the empty and
 * loading states are built in so no page reimplements them.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading,
  refetching,
  onRowClick,
  selectable,
  selected,
  onSelectedChange,
  sort,
  onSortChange,
  emptyTitle,
  emptyDescription,
  emptyAction,
  emptyActionLabel,
  toolbar,
  bulkActions,
  pageSize: initialPageSize = DEFAULT_PAGE_SIZE,
  paginate = true,
  maxHeight,
  className,
  rowClassName,
  footer,
}: DataTableProps<T>) {
  const t = useT();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((candidate) => candidate.key === sort.key);
    if (!column?.sortValue) return rows;
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = column.sortValue!(a);
      const bv = column.sortValue!(b);
      if (av === bv) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av < bv ? -1 : 1) * factor;
    });
  }, [rows, sort, columns]);

  const pageCount = paginate ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  // Clamped during render, so a filter that shortens the list can never strand
  // the user on a page that no longer exists — no reset effect needed.
  const current = Math.min(page, pageCount - 1);
  const visible = paginate
    ? sorted.slice(current * pageSize, current * pageSize + pageSize)
    : sorted;

  const visibleKeys = visible.map(rowKey);
  const allVisibleSelected =
    visibleKeys.length > 0 && visibleKeys.every((key) => selected?.has(key));

  const toggleAll = () => {
    if (!onSelectedChange) return;
    const next = new Set(selected);
    if (allVisibleSelected) visibleKeys.forEach((key) => next.delete(key));
    else visibleKeys.forEach((key) => next.add(key));
    onSelectedChange(next);
  };

  const toggleRow = (key: string) => {
    if (!onSelectedChange) return;
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectedChange(next);
  };

  const requestSort = (column: Column<T>) => {
    if (!column.sortValue || !onSortChange) return;
    if (sort?.key !== column.key) onSortChange({ key: column.key, direction: "asc" });
    else if (sort.direction === "asc") onSortChange({ key: column.key, direction: "desc" });
    else onSortChange(null);
  };

  const selectedList = Array.from(selected ?? []);

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface",
        className,
      )}
    >
      {toolbar ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5 sm:px-4">
          {toolbar}
        </div>
      ) : null}

      {selectable && selectedList.length > 0 && bulkActions ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-brand-wash px-3 py-2 sm:px-4">
          <span className="text-[13px] font-medium text-ink">
            {t.ui.rowsSelected(selectedList.length)}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {bulkActions(selectedList)}
            <Button size="sm" variant="ghost" onClick={() => onSelectedChange?.(new Set())}>
              {t.common.clear}
            </Button>
          </div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className={cn("min-w-0 overflow-auto", refetching && "is-refetching")}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table className="w-full border-collapse text-sm">
          <thead className="sticky-head">
            <tr className="border-b border-line">
              {selectable ? (
                <th scope="col" className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label={t.ui.selectAllRows}
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    className="size-4 cursor-pointer rounded border-line accent-[var(--brand)]"
                  />
                </th>
              ) : null}
              {columns.map((column) => {
                const active = sort?.key === column.key;
                const sortable = Boolean(column.sortValue && onSortChange);
                return (
                  <th
                    key={column.key}
                    scope="col"
                    style={column.width ? { width: column.width } : undefined}
                    aria-sort={
                      active ? (sort!.direction === "asc" ? "ascending" : "descending") : undefined
                    }
                    className={cn(
                      "px-3 py-2.5 text-[12px] font-medium tracking-wide text-ink-3 uppercase",
                      column.align === "right" && "text-right",
                      column.align === "center" && "text-center",
                      !column.align && "text-left",
                      column.secondary && "hidden lg:table-cell",
                      column.headerClassName,
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => requestSort(column)}
                        className={cn(
                          "inline-flex items-center gap-1 transition-colors hover:text-ink",
                          active && "text-ink",
                          column.align === "right" && "flex-row-reverse",
                        )}
                      >
                        {column.header}
                        {active ? (
                          sort!.direction === "asc" ? (
                            <ArrowUp className="size-3" aria-hidden />
                          ) : (
                            <ArrowDown className="size-3" aria-hidden />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-40" aria-hidden />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {loading
              ? Array.from({ length: 8 }).map((_, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-line last:border-0">
                    {selectable ? <td className="px-3 py-3.5" /> : null}
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn("px-3 py-3.5", column.secondary && "hidden lg:table-cell")}
                      >
                        <Skeleton className="h-3.5 w-full max-w-[140px]" />
                      </td>
                    ))}
                  </tr>
                ))
              : visible.map((row) => {
                  const key = rowKey(row);
                  const isSelected = selected?.has(key);
                  return (
                    <tr
                      key={key}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={cn(
                        "border-b border-line transition-colors duration-100 last:border-0",
                        onRowClick && "cursor-pointer",
                        isSelected ? "bg-brand-wash" : "hover:bg-surface-2",
                        rowClassName?.(row),
                      )}
                    >
                      {selectable ? (
                        <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={t.ui.selectRow}
                            checked={Boolean(isSelected)}
                            onChange={() => toggleRow(key)}
                            className="size-4 cursor-pointer rounded border-line accent-[var(--brand)]"
                          />
                        </td>
                      ) : null}
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={cn(
                            "px-3 py-3 align-middle text-ink",
                            column.align === "right" && "text-right",
                            column.align === "center" && "text-center",
                            column.secondary && "hidden lg:table-cell",
                            column.className,
                          )}
                        >
                          {column.cell(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
          </tbody>
        </table>

        {!loading && visible.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title={emptyTitle ?? t.ui.nothingHere}
            description={emptyDescription}
            action={emptyAction}
            actionLabel={emptyActionLabel}
          />
        ) : null}
      </div>

      {footer}

      {paginate && !loading && sorted.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-2 text-[12px] text-ink-3">
            <span className="tnum">
              {current * pageSize + 1}–{Math.min(sorted.length, (current + 1) * pageSize)} of{" "}
              {sorted.length}
            </span>
            <select
              aria-label={t.ui.rowsPerPage}
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              className="cursor-pointer rounded-lg border border-line bg-surface px-1.5 py-1 text-[12px] text-ink-2"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} / page
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <IconButton
              label={t.ui.previousPage}
              disabled={current === 0}
              onClick={() => {
                setPage(current - 1);
                scrollRef.current?.scrollTo({ top: 0 });
              }}
            >
              ‹
            </IconButton>
            <span className="px-2 text-[12px] text-ink-2 tnum">
              {current + 1} / {pageCount}
            </span>
            <IconButton
              label={t.ui.nextPage}
              disabled={current >= pageCount - 1}
              onClick={() => {
                setPage(current + 1);
                scrollRef.current?.scrollTo({ top: 0 });
              }}
            >
              ›
            </IconButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
