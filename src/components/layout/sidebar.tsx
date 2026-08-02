"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  BarChart3, BookOpen, Building2, CalendarDays, CreditCard, FileText,
  LayoutDashboard, PanelLeftClose, PanelLeftOpen, Receipt, Settings, Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/constants";
import { useT } from "@/i18n";
import { IconButton } from "@/components/ui/button";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, CalendarDays, BookOpen, Building2, Users,
  FileText, CreditCard, Receipt, BarChart3, Settings,
};

export function SidebarNav({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const t = useT();
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5 px-2" aria-label={t.nav.main}>
      {NAV_ITEMS.map((item) => {
        const Icon = ICONS[item.icon];
        // `/` must not light up for every route; deeper routes match by prefix.
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium",
              "transition-colors duration-150",
              collapsed && "justify-center px-0",
              active ? "text-ink" : "text-ink-2 hover:bg-surface-3 hover:text-ink",
            )}
          >
            {active ? (
              <motion.span
                layoutId="sidebar-active"
                className="absolute inset-0 rounded-xl bg-surface-3"
                transition={{ type: "spring", stiffness: 400, damping: 34 }}
              />
            ) : null}
            <Icon
              className={cn(
                "relative z-10 size-[18px] shrink-0",
                active ? "text-brand" : "text-ink-3 group-hover:text-ink-2",
              )}
              aria-hidden
            />
            {!collapsed ? <span className="relative z-10 truncate">{item.label}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const t = useT();
  return (
    <aside
      className={cn(
        "no-print sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface lg:flex",
        "transition-[width] duration-200 ease-out",
        collapsed ? "w-[68px]" : "w-[236px]",
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center gap-2.5 px-4",
          collapsed && "justify-center px-0",
        )}
      >
        <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
          <BrandMark />
          {!collapsed ? (
            <span className="truncate text-[15px] font-semibold tracking-[-0.02em] text-ink">
              Atlas<span className="text-brand">Stays</span>
            </span>
          ) : null}
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        <SidebarNav collapsed={collapsed} />
      </div>

      <div className={cn("border-t border-line p-2", collapsed && "flex justify-center")}>
        <IconButton
          label={collapsed ? t.nav.expand : t.nav.collapse}
          onClick={onToggleCollapsed}
          icon={
            collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )
          }
        />
      </div>
    </aside>
  );
}

export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[10px] font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.46,
        background: "linear-gradient(135deg, var(--brand) 0%, #ff7a5c 100%)",
      }}
      aria-hidden
    >
      A
    </span>
  );
}
