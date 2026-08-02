"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useIsClient } from "@/hooks/use-client";
import { useLocalStore } from "@/hooks/use-local-store";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { NAV_ITEMS } from "@/lib/constants";
import { TranslationProvider, useT } from "@/i18n";
import { useOrganization, useSnapshot } from "@/data/queries";
import { useWorkspace } from "@/hooks/use-workspace";
import { WorkspaceError } from "./workspace-error";
import { NO_WORKSPACE } from "@/data/repository";
import { IconButton } from "@/components/ui/button";
import { BrandMark, Sidebar, SidebarNav } from "./sidebar";
import { Topbar } from "./topbar";
import { CommandPalette } from "./command-palette";

const SIDEBAR_KEY = "aptmanager.sidebar-collapsed";

const parseCollapsed = (raw: string) => raw === "1";
const serializeCollapsed = (value: boolean) => (value ? "1" : "0");

/**
 * Application chrome: sidebar, top bar, command palette and the global
 * keyboard layer. Every authenticated route renders inside this.
 */
export function AppShell({ children }: { children: ReactNode }) {
  // Persisted in localStorage rather than React state, so the sidebar comes
  // back collapsed on the first paint instead of snapping shut after mount.
  const [collapsed, setCollapsed] = useLocalStore(
    SIDEBAR_KEY,
    false,
    parseCollapsed,
    serializeCollapsed,
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  // Same query key as every page, so this is deduplicated rather than an
  // extra fetch. Surfacing the failure once here keeps each screen from
  // having to render its own version of "the workspace could not load".
  const { error } = useSnapshot();
  const organization = useOrganization();
  const locale = organization?.locale;
  // Belonging to no company is decided by the membership list, not by a failed
  // snapshot — the snapshot never even runs in that case.
  const { none: noWorkspace } = useWorkspace();

  const toggleCollapsed = useCallback(
    () => setCollapsed(!collapsed),
    [collapsed, setCollapsed],
  );

  useGlobalShortcuts({
    onPalette: () => setPaletteOpen((value) => !value),
    onNavigate: (href) => {
      // Closing here rather than in an effect on `pathname` keeps the drawer
      // dismissal tied to the action that caused it.
      setMobileOpen(false);
      router.push(href);
    },
  });

  /*
   * Keyed on the locale so switching language remounts the tree. The label
   * tables in `lib/constants.ts` are getters over module state, which React has
   * no way to observe; a remount is what guarantees every one of them is read
   * again rather than served from a memoised render.
   */
  return (
    <TranslationProvider locale={locale}>
    <div key={locale ?? "fr"} className="flex min-h-dvh">
      <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onOpenSidebar={() => setMobileOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
        />
        <main className="min-w-0 flex-1 px-3 py-5 sm:px-5 sm:py-6 lg:px-7">
          {noWorkspace ? (
            <WorkspaceError error={new Error(NO_WORKSPACE)} />
          ) : error ? (
            <WorkspaceError error={error as Error} />
          ) : (
            <PageTransition key={pathname}>{children}</PageTransition>
          )}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
    </TranslationProvider>
  );
}

function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto w-full max-w-[1560px]"
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */

function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const mounted = useIsClient();

  useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[75] lg:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="absolute inset-0"
            style={{ background: "var(--overlay)" }}
          />
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
            className="absolute inset-y-0 left-0 flex w-[270px] flex-col border-r border-line bg-surface"
            aria-label={t.ui.navigation}
          >
            <div className="flex h-16 items-center justify-between px-4">
              <Link href="/" className="flex items-center gap-2.5">
                <BrandMark />
                <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink">
                  Atlas<span className="text-brand">Stays</span>
                </span>
              </Link>
              <IconButton label={t.ui.closeNavigation} onClick={onClose} icon={<X className="size-4" />} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-2">
              <SidebarNav onNavigate={onClose} />
            </div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */

/**
 * Global keyboard layer.
 *
 * ⌘K / Ctrl+K opens the palette; `g` followed by a letter jumps to a section
 * (`g b` → Bookings), the convention power users expect. Shortcuts stand down
 * while focus is in a text field so typing "g" into a search box does not
 * navigate away.
 */
function useGlobalShortcuts({
  onPalette,
  onNavigate,
}: {
  onPalette: () => void;
  onNavigate: (href: string) => void;
}) {
  useEffect(() => {
    let awaitingSecondKey = false;
    let timer: number | undefined;

    const isTyping = () => {
      const element = document.activeElement as HTMLElement | null;
      if (!element) return false;
      return (
        element.tagName === "INPUT" ||
        element.tagName === "TEXTAREA" ||
        element.tagName === "SELECT" ||
        element.isContentEditable
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onPalette();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping()) return;

      if (awaitingSecondKey) {
        awaitingSecondKey = false;
        window.clearTimeout(timer);
        const target = NAV_ITEMS.find(
          (item) => item.shortcut.split(" ")[1].toLowerCase() === event.key.toLowerCase(),
        );
        if (target) {
          event.preventDefault();
          onNavigate(target.href);
        }
        return;
      }

      if (event.key.toLowerCase() === "g") {
        awaitingSecondKey = true;
        // A stale prefix shouldn't hijack a keystroke seconds later.
        timer = window.setTimeout(() => {
          awaitingSecondKey = false;
        }, 1200);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(timer);
    };
  }, [onPalette, onNavigate]);
}
