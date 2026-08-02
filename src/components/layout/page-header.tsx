import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-[-0.025em] text-ink sm:text-[26px]">
            {title}
          </h1>
          {description ? (
            <div className="mt-1 text-[13.5px] text-ink-2">{description}</div>
          ) : null}
        </div>
        {actions ? (
          <div className="no-print flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/**
 * Sticky filter bar.
 *
 * One row above everything it scopes — filters never live inside an individual
 * chart or table card.
 */
export function FilterBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "no-print sticky top-16 z-30 -mx-3 mb-4 flex flex-wrap items-center gap-2 border-b border-line",
        "bg-plane/90 px-3 py-2.5 backdrop-blur-xl sm:-mx-5 sm:px-5 lg:-mx-7 lg:px-7",
        className,
      )}
    >
      {children}
    </div>
  );
}
