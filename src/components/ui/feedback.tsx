import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/* ------------------------------------------------------------------ */
/* Skeletons                                                           */
/* ------------------------------------------------------------------ */

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return <div className={cn("shimmer rounded-lg", className)} style={style} aria-hidden />;
}

export function KpiSkeleton() {
  return (
    <div className="rounded-card border border-line bg-surface p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-8 w-32" />
      <Skeleton className="mt-3 h-3 w-20" />
    </div>
  );
}

export function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div className="rounded-card border border-line bg-surface p-6">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-2 h-3 w-56" />
      <Skeleton className="mt-6 w-full" style={{ height }} />
    </div>
  );
}

export function TableSkeleton({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex gap-4 border-b border-line bg-surface-2 px-4 py-3">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 border-b border-line px-4 py-3.5 last:border-0">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-3.5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state                                                         */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon,
  title,
  description,
  action,
  actionLabel,
  className,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: () => void;
  actionLabel?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-4 py-10" : "px-6 py-16",
        className,
      )}
    >
      {icon ? (
        <div
          className={cn(
            "mb-4 grid place-items-center rounded-2xl bg-surface-3 text-ink-3",
            compact ? "size-10 [&>svg]:size-5" : "size-14 [&>svg]:size-6",
          )}
        >
          {icon}
        </div>
      ) : null}
      <h3 className={cn("font-semibold text-ink", compact ? "text-sm" : "text-base")}>{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-2">{description}</p>
      ) : null}
      {action && actionLabel ? (
        <Button variant="primary" size="sm" className="mt-5" onClick={action}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export function Progress({
  value,
  className,
  tone = "brand",
  label,
}: {
  /** 0..1 */
  value: number;
  className?: string;
  tone?: "brand" | "good" | "warning" | "critical" | "info";
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const tones = {
    brand: "bg-brand",
    good: "bg-good",
    warning: "bg-warning",
    critical: "bg-critical",
    info: "bg-info",
  } as const;

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", tones[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Avatar({
  name,
  src,
  size = 36,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const letters = name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Deterministic hue per person so the same guest keeps the same avatar.
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hue = hash % 360;

  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.36),
        background: src ? undefined : `hsl(${hue} 62% 92%)`,
        color: src ? undefined : `hsl(${hue} 58% 28%)`,
      }}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        letters || "?"
      )}
    </span>
  );
}

/** Small key hint rendered in menus, tooltips and the palette footer. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-line",
        "bg-surface-2 px-1.5 font-sans text-[11px] font-medium text-ink-2",
      )}
    >
      {children}
    </kbd>
  );
}
