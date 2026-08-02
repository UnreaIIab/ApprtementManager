"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useIsClient } from "@/hooks/use-client";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface MenuItem {
  label: string;
  /** Secondary line under the label — e.g. the signed-in email. */
  hint?: string;
  icon?: ReactNode;
  onSelect?: () => void;
  href?: string;
  destructive?: boolean;
  disabled?: boolean;
  shortcut?: string;
  /** Renders a hairline above this item instead of a separate separator node. */
  separatorBefore?: boolean;
}

/**
 * Dropdown menu, portalled to the body so it is never clipped by a table's
 * `overflow: auto` container — the failure mode that makes row action menus
 * unusable in dense tables.
 */
export function Menu({
  trigger,
  items,
  align = "end",
  className,
  menuClassName,
}: {
  trigger: (props: { open: boolean; toggle: () => void; ref: React.Ref<HTMLButtonElement> }) => ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  className?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const mounted = useIsClient();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = menuRef.current?.offsetWidth ?? 220;
    const height = menuRef.current?.offsetHeight ?? 200;

    // Flip above / clamp inside the viewport rather than overflowing it.
    const top =
      rect.bottom + height + 8 > window.innerHeight && rect.top - height - 8 > 0
        ? rect.top - height - 6
        : rect.bottom + 6;
    const left = Math.min(
      Math.max(8, align === "end" ? rect.right - width : rect.left),
      window.innerWidth - width - 8,
    );
    setPosition({ top, left });
  }, [open, align, items.length]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const close = () => setOpen(false);

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return (
    <div className={cn("relative inline-flex", className)}>
      {trigger({ open, toggle: () => setOpen((value) => !value), ref: triggerRef })}
      {mounted
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <motion.div
                  ref={menuRef}
                  role="menu"
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  style={{ top: position.top, left: position.left }}
                  className={cn(
                    "fixed z-[90] min-w-[210px] origin-top overflow-hidden rounded-xl",
                    "border border-line bg-surface p-1 shadow-lg",
                    menuClassName,
                  )}
                >
                  {items.map((item, index) => {
                    const content = (
                      <>
                        {item.icon ? (
                          <span className="shrink-0 text-ink-3 [&>svg]:size-4">{item.icon}</span>
                        ) : null}
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block truncate">{item.label}</span>
                          {item.hint ? (
                            <span className="block truncate text-[11px] text-ink-3">
                              {item.hint}
                            </span>
                          ) : null}
                        </span>
                        {item.shortcut ? (
                          <kbd className="text-[11px] text-ink-3">{item.shortcut}</kbd>
                        ) : null}
                      </>
                    );
                    const classes = cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px]",
                      "transition-colors duration-100",
                      item.disabled
                        ? "cursor-not-allowed text-ink-3"
                        : item.destructive
                          ? "text-critical hover:bg-critical-wash"
                          : "text-ink hover:bg-surface-3",
                    );

                    return (
                      <div key={`${item.label}-${index}`}>
                        {item.separatorBefore ? (
                          <div className="my-1 h-px bg-line" role="separator" />
                        ) : null}
                        {item.href && !item.disabled ? (
                          <a href={item.href} role="menuitem" className={classes} onClick={() => setOpen(false)}>
                            {content}
                          </a>
                        ) : (
                          <button
                            type="button"
                            role="menuitem"
                            disabled={item.disabled}
                            className={classes}
                            onClick={() => {
                              setOpen(false);
                              item.onSelect?.();
                            }}
                          >
                            {content}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  );
}
