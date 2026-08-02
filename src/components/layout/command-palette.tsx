"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3, BookOpen, Building2, CalendarDays, CreditCard, FileText,
  LayoutDashboard, Moon, Plus, Receipt, Search, Settings, Sun, Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/constants";
import { strings, useT } from "@/i18n";
import { useSearch } from "@/hooks/use-search";
import { useIsClient } from "@/hooks/use-client";
import { Kbd } from "@/components/ui/feedback";
import type { SearchHit } from "@/types/domain";

const NAV_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, CalendarDays, BookOpen, Building2, Users,
  FileText, CreditCard, Receipt, BarChart3, Settings,
};

const TYPE_ICONS: Record<SearchHit["type"], React.ComponentType<{ className?: string }>> = {
  booking: BookOpen,
  guest: Users,
  apartment: Building2,
  invoice: FileText,
  payment: CreditCard,
  expense: Receipt,
};

const TYPE_LABELS: Record<SearchHit["type"], string> = {
  get booking() { return strings().chrome.entity.booking; },
  get guest() { return strings().chrome.entity.guest; },
  get apartment() { return strings().chrome.entity.apartment; },
  get invoice() { return strings().chrome.entity.invoice; },
  get payment() { return strings().chrome.entity.payment; },
  get expense() { return strings().chrome.entity.expense; },
};

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

/**
 * Command palette (⌘K / Ctrl+K).
 *
 * Combines navigation, quick actions and global search into one list, so the
 * keyboard path to any record is: open, type, Enter.
 *
 * The body is a separate component that only mounts while the palette is open —
 * that is what resets the query and cursor between sessions, rather than an
 * effect writing state back on every `open` change.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isClient = useIsClient();
  if (!isClient) return null;

  return createPortal(
    <AnimatePresence>
      {open ? <PaletteBody onClose={() => onOpenChange(false)} /> : null}
    </AnimatePresence>,
    document.body,
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const hits = useSearch(query, 12);

  const go = useCallback(
    (href: string) => () => {
      router.push(href);
      onClose();
    },
    [router, onClose],
  );

  const commands = useMemo<Command[]>(() => {
    const navigation: Command[] = NAV_ITEMS.map((item) => ({
      id: `nav:${item.href}`,
      label: item.label,
      hint: t.palette.hintGoTo,
      group: t.palette.groupNavigation,
      icon: NAV_ICONS[item.icon] ?? LayoutDashboard,
      run: go(item.href),
    }));

    const actions: Command[] = [
      { id: "action:new-booking", label: t.palette.newBooking, hint: t.palette.hintCreate, group: t.palette.groupActions, icon: Plus, run: go("/bookings?new=1") },
      { id: "action:new-guest", label: t.palette.newGuest, hint: t.palette.hintCreate, group: t.palette.groupActions, icon: Plus, run: go("/guests?new=1") },
      { id: "action:new-expense", label: t.palette.recordExpense, hint: t.palette.hintCreate, group: t.palette.groupActions, icon: Plus, run: go("/expenses?new=1") },
      { id: "action:new-apartment", label: t.palette.addApartment, hint: t.palette.hintCreate, group: t.palette.groupActions, icon: Plus, run: go("/apartments?new=1") },
      {
        id: "action:theme",
        label: resolvedTheme === "dark" ? t.chrome.toLight : t.chrome.toDark,
        hint: t.palette.hintAppearance,
        group: t.palette.groupActions,
        icon: resolvedTheme === "dark" ? Sun : Moon,
        run: () => {
          setTheme(resolvedTheme === "dark" ? "light" : "dark");
          onClose();
        },
      },
    ];

    return [...actions, ...navigation];
  }, [go, resolvedTheme, setTheme, onClose, t]);

  const items = useMemo<Command[]>(() => {
    const trimmed = query.trim();
    if (!trimmed) return commands;

    const needle = trimmed.toLowerCase();
    const matchingCommands = commands.filter((command) =>
      command.label.toLowerCase().includes(needle),
    );
    const records: Command[] = hits.map((hit) => ({
      id: `hit:${hit.type}:${hit.id}`,
      label: hit.title,
      hint: hit.subtitle,
      group: TYPE_LABELS[hit.type],
      icon: TYPE_ICONS[hit.type],
      run: go(hit.href),
    }));
    // Records first when the user is clearly looking for one.
    return [...records, ...matchingCommands];
  }, [query, commands, hits, go]);

  const grouped = useMemo(() => {
    const groups = new Map<string, { command: Command; index: number }[]>();
    items.forEach((command, index) => {
      const list = groups.get(command.group) ?? [];
      list.push({ command, index });
      groups.set(command.group, list);
    });
    return Array.from(groups.entries());
  }, [items]);

  // Clamped during render so a shrinking result list can never leave the
  // cursor pointing past the end.
  const cursor = Math.min(activeIndex, Math.max(0, items.length - 1));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, items.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        items[cursor]?.run();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [items, cursor, onClose]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center px-4 pt-[12vh]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        className="absolute inset-0 backdrop-blur-[3px]"
        style={{ background: "var(--overlay)" }}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={t.palette.label}
        initial={{ opacity: 0, y: -12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-xl"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-ink-3" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              // A new query means a new list; put the cursor back at the top.
              setActiveIndex(0);
            }}
            placeholder={t.palette.placeholder}
            aria-label={t.palette.searchOrRun}
            className="w-full bg-transparent py-4 text-[15px] text-ink placeholder:text-ink-3 focus:outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="px-3 py-10 text-center text-[13px] text-ink-3">
              No matches for “{query}”.
            </p>
          ) : (
            grouped.map(([group, entries]) => (
              <div key={group} className="mb-1 last:mb-0">
                <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-ink-3">
                  {group}
                </p>
                {entries.map(({ command, index }) => {
                  const Icon = command.icon;
                  const active = index === cursor;
                  return (
                    <button
                      key={command.id}
                      type="button"
                      data-index={index}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={command.run}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left",
                        "transition-colors duration-100",
                        active ? "bg-surface-3" : "hover:bg-surface-2",
                      )}
                    >
                      <Icon className="size-4 shrink-0 text-ink-3" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] text-ink">
                          {command.label}
                        </span>
                        {command.hint ? (
                          <span className="block truncate text-[12px] text-ink-3">
                            {command.hint}
                          </span>
                        ) : null}
                      </span>
                      {active ? <Kbd>↵</Kbd> : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-line bg-surface-2 px-4 py-2.5 text-[11px] text-ink-3">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> open
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd> toggle
          </span>
        </div>
      </motion.div>
    </div>
  );
}
