"use client";

import { useState } from "react";
import { CalendarRange, Check, ChevronDown } from "lucide-react";
import { DATE_PRESETS, PRESET_LABELS, type DatePreset } from "@/lib/date-range";
import { useT } from "@/i18n";
import { useDateFilter } from "@/hooks/use-date-filter";
import { formatDateRange } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Menu } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/overlay";
import { Field, Input } from "@/components/ui/field";

/**
 * The single date control for the whole application.
 *
 * There are intentionally no per-card date pickers: this one control scopes
 * every KPI, chart, table and report, so two numbers on a screen can never be
 * describing different periods.
 */
export function DateFilter({ className }: { className?: string }) {
  const t = useT();
  const { preset, range, label, setPreset, setCustomRange } = useDateFilter();
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState(range);

  const presets = DATE_PRESETS.filter((value) => value !== "custom");

  return (
    <>
      <Menu
        align="end"
        className={className}
        trigger={({ toggle, ref, open }) => (
          <button
            ref={ref}
            type="button"
            onClick={toggle}
            aria-haspopup="menu"
            aria-expanded={open}
            className={cn(
              "flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3",
              "text-[13px] font-medium text-ink transition-colors hover:bg-surface-3",
            )}
          >
            <CalendarRange className="size-4 shrink-0 text-ink-3" aria-hidden />
            <span className="max-w-[190px] truncate">{label}</span>
            <ChevronDown className="size-3.5 shrink-0 text-ink-3" aria-hidden />
          </button>
        )}
        items={[
          ...presets.map((value) => ({
            label: PRESET_LABELS[value],
            icon: preset === value ? <Check /> : <span className="block size-4" />,
            onSelect: () => setPreset(value as DatePreset),
          })),
          {
            label: `${t.datePreset.custom}…`,
            separatorBefore: true,
            icon: preset === "custom" ? <Check /> : <span className="block size-4" />,
            onSelect: () => {
              setDraft(range);
              setCustomOpen(true);
            },
          },
        ]}
      />

      <Dialog
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        title={t.datePreset.custom}
        description={t.dateFilter.appliesEverywhere}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCustomOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setCustomRange(draft);
                setCustomOpen(false);
              }}
            >
              Apply range
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.dateFilter.startDate} htmlFor="range-start">
            <Input
              id="range-start"
              type="date"
              value={draft.start}
              max={draft.end}
              onChange={(event) => setDraft((d) => ({ ...d, start: event.target.value }))}
            />
          </Field>
          <Field label={t.dateFilter.endDate} htmlFor="range-end">
            <Input
              id="range-end"
              type="date"
              value={draft.end}
              min={draft.start}
              onChange={(event) => setDraft((d) => ({ ...d, end: event.target.value }))}
            />
          </Field>
        </div>
        <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2">
          Selected: <span className="font-medium text-ink">{formatDateRange(draft.start, draft.end)}</span>
        </p>
      </Dialog>
    </>
  );
}

/** Compact read-out of the active window, for print headers and report titles. */
export function ActiveRangeLabel({ className }: { className?: string }) {
  const { range, label } = useDateFilter();
  return (
    <span className={cn("text-[13px] text-ink-2", className)}>
      {label} · <span className="tnum">{formatDateRange(range.start, range.end)}</span>
    </span>
  );
}
