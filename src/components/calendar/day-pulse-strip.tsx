"use client";

import { BedDouble, DoorOpen, LogIn, LogOut, Percent } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { percent } from "@/lib/format";
import type { DayPulse } from "@/lib/availability";

export type PulseFocus = "arrivals" | "departures" | "in_house" | "free" | null;

/**
 * Today at a glance.
 *
 * Deliberately not scoped by the global reporting filter — "who arrives today"
 * is an operational fact, not a reporting window, and the front desk needs it
 * regardless of which period the financials are showing.
 *
 * Each tile is a filter: selecting one narrows the timeline below to just those
 * apartments, so the count and the action are the same control.
 */
export function DayPulseStrip({
  pulse,
  focus,
  onFocusChange,
  className,
}: {
  pulse: DayPulse;
  focus: PulseFocus;
  onFocusChange: (next: PulseFocus) => void;
  className?: string;
}) {
  const t = useT();
  const tiles: {
    key: Exclude<PulseFocus, null>;
    label: string;
    value: number;
    icon: ReactNode;
    tone: string;
  }[] = [
    {
      key: "arrivals",
      label: t.pulse.arriving,
      value: pulse.arrivals.length,
      icon: <LogIn className="size-4" />,
      tone: "text-info",
    },
    {
      key: "departures",
      label: t.pulse.departing,
      value: pulse.departures.length,
      icon: <LogOut className="size-4" />,
      tone: "text-serious",
    },
    {
      key: "in_house",
      label: t.pulse.inHouse,
      value: pulse.inHouse.length,
      icon: <BedDouble className="size-4" />,
      tone: "text-ink-2",
    },
    {
      key: "free",
      label: t.pulse.freeTonight,
      value: pulse.freeTonight.length,
      icon: <DoorOpen className="size-4" />,
      tone: "text-good",
    },
  ];

  return (
    <div className={cn("no-print flex flex-wrap items-stretch gap-2", className)}>
      {tiles.map((tile) => {
        const active = focus === tile.key;
        return (
          <button
            key={tile.key}
            type="button"
            aria-pressed={active}
            onClick={() => onFocusChange(active ? null : tile.key)}
            className={cn(
              "flex items-center gap-2.5 rounded-xl border px-3.5 py-2 text-left",
              "transition-[border-color,background-color,transform] duration-150",
              "hover:-translate-y-0.5 hover:border-line-strong",
              active ? "border-ink bg-surface-3" : "border-line bg-surface",
            )}
          >
            <span className={cn("shrink-0", tile.tone)} aria-hidden>
              {tile.icon}
            </span>
            <span>
              <span className="block text-[17px] font-semibold leading-none text-ink tnum">
                {tile.value}
              </span>
              <span className="mt-0.5 block text-[11.5px] text-ink-3">{tile.label}</span>
            </span>
          </button>
        );
      })}

      <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2">
        <Percent className="size-4 shrink-0 text-ink-3" aria-hidden />
        <span>
          <span className="block text-[17px] font-semibold leading-none text-ink tnum">
            {percent(pulse.occupancy, 0)}
          </span>
          <span className="mt-0.5 block text-[11.5px] text-ink-3">{t.pulse.occupiedTonight}</span>
        </span>
      </div>
    </div>
  );
}
