"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useIsClient } from "@/hooks/use-client";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { Button, IconButton } from "./button";

/* ------------------------------------------------------------------ */
/* Shared overlay behaviour                                            */
/* ------------------------------------------------------------------ */

/**
 * Escape-to-close, background scroll lock and a focus trap.
 *
 * Hand-rolled rather than pulled from a UI kit so the dialog, drawer and
 * command palette all share exactly one implementation of these rules.
 */
function useOverlayBehaviour(open: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !containerRef.current) return;

      const focusable = containerRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    // Focus the first control once the entrance animation has committed.
    const timer = window.setTimeout(() => {
      const target = containerRef.current?.querySelector<HTMLElement>(
        "[data-autofocus],input:not([type=hidden]),textarea,select,button",
      );
      target?.focus();
    }, 60);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      window.clearTimeout(timer);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  return containerRef;
}

function Portal({ children }: { children: ReactNode }) {
  const isClient = useIsClient();
  if (!isClient) return null;
  return createPortal(children, document.body);
}

const backdrop = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

/* ------------------------------------------------------------------ */
/* Dialog                                                              */
/* ------------------------------------------------------------------ */

export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const t = useT();
  const ref = useOverlayBehaviour(open, onClose);
  const widths = {
    sm: "max-w-md",
    md: "max-w-xl",
    lg: "max-w-3xl",
    xl: "max-w-5xl",
  } as const;

  return (
    <Portal>
      <AnimatePresence>
        {open ? (
          <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
            <motion.div
              {...backdrop}
              transition={{ duration: 0.15 }}
              onClick={onClose}
              className="absolute inset-0 backdrop-blur-[2px]"
              style={{ background: "var(--overlay)" }}
            />
            <motion.div
              ref={ref}
              role="dialog"
              aria-modal="true"
              aria-label={typeof title === "string" ? title : undefined}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className={cn(
                "relative flex max-h-[92vh] w-full flex-col overflow-hidden bg-surface shadow-xl",
                "rounded-t-2xl sm:rounded-2xl border border-line",
                widths[size],
              )}
            >
              <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">{title}</h2>
                  {description ? (
                    <p className="mt-0.5 text-[13px] text-ink-2">{description}</p>
                  ) : null}
                </div>
                <IconButton label={t.common.close} onClick={onClose} icon={<X className="size-4" />} />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

              {footer ? (
                <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2 px-6 py-3.5">
                  {footer}
                </div>
              ) : null}
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </Portal>
  );
}

/* ------------------------------------------------------------------ */
/* Drawer                                                              */
/* ------------------------------------------------------------------ */

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  header,
  footer,
  children,
  width = "lg",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  width?: "md" | "lg" | "xl";
}) {
  const t = useT();
  const ref = useOverlayBehaviour(open, onClose);
  const widths = {
    md: "sm:max-w-lg",
    lg: "sm:max-w-2xl",
    xl: "sm:max-w-4xl",
  } as const;

  return (
    <Portal>
      <AnimatePresence>
        {open ? (
          <div className="fixed inset-0 z-[70]">
            <motion.div
              {...backdrop}
              transition={{ duration: 0.15 }}
              onClick={onClose}
              className="absolute inset-0"
              style={{ background: "var(--overlay)" }}
            />
            <motion.aside
              ref={ref}
              role="dialog"
              aria-modal="true"
              aria-label={typeof title === "string" ? title : t.ui.details}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 340, damping: 34 }}
              className={cn(
                "absolute inset-y-0 right-0 flex w-full flex-col bg-surface shadow-xl",
                "border-l border-line",
                widths[width],
              )}
            >
              <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  {title ? (
                    <h2 className="truncate text-base font-semibold tracking-[-0.01em] text-ink">
                      {title}
                    </h2>
                  ) : null}
                  {subtitle ? <div className="mt-0.5 text-[13px] text-ink-2">{subtitle}</div> : null}
                  {header}
                </div>
                <IconButton label={t.common.close} onClick={onClose} icon={<X className="size-4" />} />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

              {footer ? (
                <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-2 px-5 py-3.5 sm:px-6">
                  {footer}
                </div>
              ) : null}
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>
    </Portal>
  );
}

/* ------------------------------------------------------------------ */
/* Confirmation                                                        */
/* ------------------------------------------------------------------ */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
}) {
  const t = useT();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {cancelLabel ?? t.common.cancel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
            data-autofocus
          >
            {confirmLabel ?? t.common.confirm}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-2">{message}</p>
    </Dialog>
  );
}

/** Imperative confirmation, so a table row action is a one-liner. */
export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean;
    title: string;
    message: ReactNode;
    confirmLabel?: string;
    destructive?: boolean;
    resolve?: (value: boolean) => void;
  }>({ open: false, title: "", message: "" });

  const confirm = useCallback(
    (options: {
      title: string;
      message: ReactNode;
      confirmLabel?: string;
      destructive?: boolean;
    }) =>
      new Promise<boolean>((resolve) => {
        setState({ ...options, open: true, resolve });
      }),
    [],
  );

  const settle = useCallback(
    (value: boolean) => {
      state.resolve?.(value);
      setState((current) => ({ ...current, open: false, resolve: undefined }));
    },
    [state],
  );

  const dialog = (
    <ConfirmDialog
      open={state.open}
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      destructive={state.destructive}
      onClose={() => settle(false)}
      onConfirm={() => settle(true)}
    />
  );

  return { confirm, dialog };
}
