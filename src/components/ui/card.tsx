import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-surface border border-line rounded-card shadow-sm",
        "transition-shadow duration-200",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 px-5 pt-5 pb-3 sm:px-6 sm:pt-6",
        className,
      )}
    >
      <div className="min-w-0">
        {title ? (
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        ) : null}
        {description ? (
          <p className="mt-0.5 text-[13px] text-ink-2">{description}</p>
        ) : null}
        {children}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5 sm:px-6 sm:pb-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-t border-line px-5 py-3 sm:px-6",
        className,
      )}
      {...props}
    />
  );
}

/** Section heading used between card groups on long pages. */
export function SectionTitle({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.015em] text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-ink-2">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
