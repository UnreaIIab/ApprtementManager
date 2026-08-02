import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Stable client-side id, used for optimistic rows before the server responds. */
export function uid(prefix = ""): string {
  const raw =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix ? `${prefix}_${raw}` : raw;
}

export function initials(...parts: (string | null | undefined)[]) {
  return parts
    .filter(Boolean)
    .map((p) => p!.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function sum<T>(rows: T[], pick: (row: T) => number): number {
  let total = 0;
  for (const row of rows) total += pick(row) || 0;
  return total;
}

export function groupBy<T, K extends string>(
  rows: T[],
  key: (row: T) => K,
): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const row of rows) {
    const k = key(row);
    (out[k] ??= []).push(row);
  }
  return out;
}

export function sortBy<T>(
  rows: T[],
  pick: (row: T) => number | string,
  dir: "asc" | "desc" = "asc",
): T[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = pick(a);
    const bv = pick(b);
    if (av === bv) return 0;
    return (av < bv ? -1 : 1) * factor;
  });
}

/** Percentage change from `previous` to `current`, guarding divide-by-zero. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return (current - previous) / Math.abs(previous);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Case- and diacritic-insensitive substring match used by every search box. */
export function matches(haystack: unknown, needle: string): boolean {
  if (!needle) return true;
  return normalize(String(haystack ?? "")).includes(normalize(needle));
}

export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function unique<T>(rows: T[]): T[] {
  return Array.from(new Set(rows));
}

export function downloadBlob(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * CSV export shared by every table and report.
 * Quotes are doubled and any field containing a delimiter is wrapped, so values
 * with commas or newlines survive a round trip through Excel.
 */
export function toCsv(
  rows: Record<string, unknown>[],
  columns?: { key: string; label: string }[],
): string {
  if (!rows.length) return "";
  const cols =
    columns ?? Object.keys(rows[0]).map((key) => ({ key, label: key }));
  const escape = (value: unknown) => {
    const str = value == null ? "" : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const head = cols.map((c) => escape(c.label)).join(",");
  const body = rows
    .map((row) => cols.map((c) => escape(row[c.key])).join(","))
    .join("\n");
  return `${head}\n${body}`;
}

export function exportCsv(
  filename: string,
  rows: Record<string, unknown>[],
  columns?: { key: string; label: string }[],
) {
  // BOM so Excel opens UTF-8 accented names correctly.
  downloadBlob(`﻿${toCsv(rows, columns)}`, filename, "text/csv;charset=utf-8");
}
