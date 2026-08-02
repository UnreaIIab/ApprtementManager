"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "next-themes";
import {
  Bell, KeyRound, LogOut, Menu as MenuIcon, Moon, Search, Settings, Sun, UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";
import { useT } from "@/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useIsClient } from "@/hooks/use-client";
import { useSearch } from "@/hooks/use-search";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/data/queries";
import { Menu } from "@/components/ui/menu";
import { IconButton } from "@/components/ui/button";
import { Avatar, Kbd } from "@/components/ui/feedback";
import { DateFilter } from "./date-filter";
import { OrgSwitcher } from "./org-switcher";

export function Topbar({
  onOpenSidebar,
  onOpenPalette,
}: {
  onOpenSidebar: () => void;
  onOpenPalette: () => void;
}) {
  const t = useT();
  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-5">
        <IconButton
          label={t.chrome.openNavigation}
          className="lg:hidden"
          onClick={onOpenSidebar}
          icon={<MenuIcon className="size-5" />}
        />

        <OrgSwitcher />

        <GlobalSearch onOpenPalette={onOpenPalette} />

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <DateFilter className="hidden sm:flex" />
          <ThemeToggle />
          <NotificationsMenu />
          <UserMenu />
        </div>
      </div>

      {/* The date filter always stays reachable on narrow screens. */}
      <div className="flex items-center gap-2 border-t border-line px-3 py-2 sm:hidden">
        <DateFilter className="flex-1" />
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */

function GlobalSearch({ onOpenPalette }: { onOpenPalette: () => void }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const hits = useSearch(query, 8);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1 max-w-md">
      <button
        type="button"
        onClick={onOpenPalette}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-xl border border-line bg-surface-2 px-3",
          "text-[13px] text-ink-3 transition-colors hover:bg-surface-3 md:hidden",
        )}
      >
        <Search className="size-4" aria-hidden />
        <span className="truncate">{t.chrome.search}</span>
      </button>

      <div className="relative hidden md:block">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3"
          aria-hidden
        />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "Enter" && hits[0]) {
              router.push(hits[0].href);
              setOpen(false);
              setQuery("");
            }
          }}
          placeholder={t.chrome.searchEverything}
          aria-label={t.chrome.globalSearch}
          className={cn(
            "h-9 w-full rounded-xl border border-line bg-surface-2 pl-9 pr-16 text-[13px] text-ink",
            "placeholder:text-ink-3 transition-colors",
            "hover:bg-surface-3 focus:border-ink focus:bg-surface focus:outline-none focus:ring-2 focus:ring-ink/10",
          )}
        />
        <button
          type="button"
          onClick={onOpenPalette}
          className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5"
          aria-label={t.chrome.openPalette}
        >
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </button>

        <AnimatePresence>
          {open && query.trim() ? (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-lg"
            >
              {hits.length === 0 ? (
                <p className="px-3 py-6 text-center text-[13px] text-ink-3">
                  {t.chrome.noMatches}
                </p>
              ) : (
                hits.map((hit) => (
                  <Link
                    key={`${hit.type}-${hit.id}`}
                    href={hit.href}
                    onClick={() => {
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{hit.title}</span>
                      <span className="block truncate text-[12px] text-ink-3">{hit.subtitle}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-ink-3">
                      {t.chrome.entity[hit.type]}
                    </span>
                  </Link>
                ))
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */

function ThemeToggle() {
  const t = useT();
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useIsClient();

  // Rendered only after hydration — the server has no way to know the OS
  // theme, and guessing produces a mismatch and an icon flash.
  if (!mounted) return <span className="size-8" aria-hidden />;
  const dark = resolvedTheme === "dark";

  return (
    <IconButton
      label={dark ? t.chrome.toLight : t.chrome.toDark}
      onClick={() => setTheme(dark ? "light" : "dark")}
      icon={dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    />
  );
}

/* ------------------------------------------------------------------ */

function NotificationsMenu() {
  const t = useT();
  const { data: notifications } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((notification) => !notification.read_at).length;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const severityDot = {
    info: "var(--info)",
    success: "var(--good)",
    warning: "var(--warning)",
    critical: "var(--critical)",
  } as const;

  return (
    <div ref={panelRef} className="relative">
      <IconButton
        label={unread ? t.chrome.notificationsWithUnread(unread) : t.chrome.notifications}
        onClick={() => setOpen((value) => !value)}
        icon={
          <span className="relative block">
            <Bell className="size-[18px]" />
            {unread > 0 ? (
              <span className="absolute -right-1 -top-1 grid min-w-[15px] place-items-center rounded-full bg-brand px-1 text-[9px] font-bold leading-[15px] text-brand-ink">
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
          </span>
        }
      />

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-11 z-50 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-line bg-surface shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-[14px] font-semibold text-ink">{t.chrome.notifications}</h3>
              {unread > 0 ? (
                <button
                  type="button"
                  onClick={() => markAll.mutate()}
                  className="text-[12px] font-medium text-brand hover:underline"
                >
                  {t.chrome.markAllRead}
                </button>
              ) : null}
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-10 text-center text-[13px] text-ink-3">
                  {t.chrome.allCaughtUp}
                </p>
              ) : (
                notifications.map((notification) => (
                  <Link
                    key={notification.id}
                    href={notification.link ?? "#"}
                    onClick={() => {
                      if (!notification.read_at) markRead.mutate(notification.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex gap-3 border-b border-line px-4 py-3 transition-colors last:border-0",
                      notification.read_at ? "hover:bg-surface-2" : "bg-brand-wash/40 hover:bg-brand-wash",
                    )}
                  >
                    <span
                      aria-hidden
                      className="mt-1.5 size-2 shrink-0 rounded-full"
                      style={{ background: severityDot[notification.severity] }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium leading-snug text-ink">
                        {notification.title}
                      </span>
                      {notification.body ? (
                        <span className="mt-0.5 block text-[12px] leading-snug text-ink-2">
                          {notification.body}
                        </span>
                      ) : null}
                      <span className="mt-1 block text-[11px] text-ink-3">
                        {relativeTime(notification.created_at)}
                      </span>
                    </span>
                  </Link>
                ))
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function UserMenu() {
  const t = useT();
  const { name, email, signOut } = useAuth();
  const router = useRouter();

  return (
    <Menu
      align="end"
      trigger={({ toggle, ref, open }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t.chrome.accountMenu}
          className="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-surface-3"
        >
          <Avatar name={name} size={30} />
        </button>
      )}
      items={[
        { label: name, hint: email, icon: <UserRound />, disabled: true },
        {
          label: t.nav.settings,
          icon: <Settings />,
          separatorBefore: true,
          onSelect: () => router.push("/settings"),
        },
        {
          label: t.chrome.changePassword,
          icon: <KeyRound />,
          onSelect: () => router.push("/settings?tab=security"),
        },
        {
          label: t.chrome.signOut,
          icon: <LogOut />,
          destructive: true,
          separatorBefore: true,
          onSelect: () => void signOut(),
        },
      ]}
    />
  );
}
