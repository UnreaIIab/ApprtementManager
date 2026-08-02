import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { StatusMeta } from "@/lib/constants";

export function Badge({
  children,
  className,
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  tone?: "neutral" | "brand" | "good" | "warning" | "critical" | "info";
}) {
  const tones = {
    neutral: "bg-surface-3 text-ink-2 border-line",
    brand: "bg-brand-wash text-brand border-brand/25",
    good: "bg-good-wash text-ink border-good/30",
    warning: "bg-warning-wash text-ink border-warning/30",
    critical: "bg-critical-wash text-ink border-critical/30",
    info: "bg-info-wash text-ink border-info/30",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
        "text-[11px] font-medium leading-5 whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Status chip.
 *
 * The colored dot is never the only signal — the label always renders beside
 * it, so the state survives colorblindness, greyscale printing and forced-colors
 * mode.
 */
export function StatusBadge({
  meta,
  className,
  size = "md",
}: {
  meta: StatusMeta;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap",
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-[3px] text-[12px]",
        meta.chip,
        className,
      )}
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: meta.color }}
      />
      {meta.label}
    </span>
  );
}

/** Delta pill on a KPI tile — arrow + sign, never color alone. */
export function DeltaBadge({
  value,
  invert = false,
  className,
}: {
  /** Fractional change, e.g. `0.124` for +12.4%. `null` when incomparable. */
  value: number | null;
  /** Set for metrics where down is good (expenses, cancellations). */
  invert?: boolean;
  className?: string;
}) {
  if (value === null || !Number.isFinite(value)) {
    return <span className={cn("text-[12px] text-ink-3", className)}>no prior data</span>;
  }
  const flat = Math.abs(value) < 0.0005;
  const up = value > 0;
  const good = invert ? !up : up;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[12px] font-medium tnum",
        flat ? "text-ink-3" : good ? "text-delta-up" : "text-delta-down",
        className,
      )}
    >
      <span aria-hidden>{flat ? "→" : up ? "↑" : "↓"}</span>
      {flat ? "0%" : `${Math.abs(value * 100).toFixed(1)}%`}
    </span>
  );
}
