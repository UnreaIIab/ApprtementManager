"use client";

import { useId, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface TabDef<T extends string = string> {
  value: T;
  label: string;
  count?: number;
  icon?: ReactNode;
}

/** Underlined tab bar with a shared sliding indicator. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: TabDef<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const layoutId = useId();

  return (
    <div
      role="tablist"
      className={cn(
        "no-scrollbar flex gap-1 overflow-x-auto border-b border-line",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              "relative flex shrink-0 items-center gap-2 px-3 pb-2.5 pt-2 text-[13px] font-medium",
              "transition-colors duration-150",
              active ? "text-ink" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {tab.icon ? <span className="[&>svg]:size-4">{tab.icon}</span> : null}
            {tab.label}
            {tab.count !== undefined ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px] tnum",
                  active ? "bg-ink text-plane" : "bg-surface-3 text-ink-3",
                )}
              >
                {tab.count}
              </span>
            ) : null}
            {active ? (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-ink"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Compact pill switch — used for chart view toggles and calendar scales. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
  ariaLabel,
}: {
  options: { value: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}) {
  const layoutId = useId();

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-xl border border-line bg-surface-2 p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative flex items-center gap-1.5 rounded-[10px] font-medium transition-colors duration-150",
              size === "sm" ? "px-2.5 py-1 text-[12px]" : "px-3 py-1.5 text-[13px]",
              active ? "text-ink" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-[10px] bg-surface shadow-xs"
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
              />
            ) : null}
            <span className="relative z-10 flex items-center gap-1.5 [&>svg]:size-3.5">
              {option.icon}
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
