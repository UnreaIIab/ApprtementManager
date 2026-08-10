"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatShortDate, relativeTime } from "@/lib/format";
import { useT } from "@/i18n";
import type { DerivedAlert } from "@/lib/alerts";
import type { AppNotification } from "@/types/domain";

const SEVERITY_DOT = {
  info: "var(--info)",
  success: "var(--good)",
  warning: "var(--warning)",
  critical: "var(--critical)",
} as const;

/**
 * The contents of the notification popover.
 *
 * Split out from the bell so it can be rendered — and therefore checked —
 * without the auth, workspace and query providers the topbar needs. It takes
 * both feeds as props and holds no data of its own.
 *
 * Derived alerts come first and carry no read state: they describe work that is
 * still outstanding, so they disappear by being done, not by being dismissed.
 */
export function NotificationList({
  alerts,
  notifications,
  onMarkRead,
  onNavigate,
}: {
  alerts: DerivedAlert[];
  notifications: AppNotification[];
  onMarkRead: (id: string) => void;
  onNavigate: () => void;
}) {
  const t = useT();

  if (alerts.length === 0 && notifications.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-[13px] text-ink-3">{t.chrome.allCaughtUp}</p>
    );
  }

  return (
    <>
      {alerts.length > 0 ? (
        <>
          <p className="border-b border-line bg-surface-2 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-3">
            {t.alerts.needsAction}
          </p>
          {alerts.map((alert) => (
            <Link
              key={alert.id}
              href={alert.href}
              onClick={onNavigate}
              data-testid="alert-row"
              className="flex gap-3 border-b border-line px-4 py-3 transition-colors last:border-0 hover:bg-surface-2"
            >
              <span
                aria-hidden
                className="mt-1.5 size-2 shrink-0 rounded-full"
                style={{ background: SEVERITY_DOT[alert.severity] }}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium leading-snug text-ink">
                  {alert.title}
                </span>
                <span className="mt-0.5 block text-[12px] leading-snug text-ink-2">
                  {alert.body}
                </span>
                <span className="mt-1 block text-[11px] text-ink-3">
                  {formatShortDate(alert.since)}
                </span>
              </span>
            </Link>
          ))}
        </>
      ) : null}

      {notifications.map((notification) => (
        <Link
          key={notification.id}
          href={notification.link ?? "#"}
          onClick={() => {
            if (!notification.read_at) onMarkRead(notification.id);
            onNavigate();
          }}
          className={cn(
            "flex gap-3 border-b border-line px-4 py-3 transition-colors last:border-0",
            notification.read_at ? "hover:bg-surface-2" : "bg-brand-wash/40 hover:bg-brand-wash",
          )}
        >
          <span
            aria-hidden
            className="mt-1.5 size-2 shrink-0 rounded-full"
            style={{ background: SEVERITY_DOT[notification.severity] }}
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
      ))}
    </>
  );
}
