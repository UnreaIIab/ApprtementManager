"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "subtle";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-brand-ink hover:bg-brand-hover shadow-xs active:scale-[0.98]",
  secondary:
    "bg-ink text-plane hover:opacity-90 shadow-xs active:scale-[0.98]",
  outline:
    "bg-surface text-ink border border-line hover:bg-surface-3 hover:border-line-strong active:scale-[0.98]",
  ghost: "text-ink-2 hover:bg-surface-3 hover:text-ink",
  subtle: "bg-surface-3 text-ink hover:bg-line active:scale-[0.98]",
  danger:
    "bg-critical text-white hover:opacity-90 shadow-xs active:scale-[0.98]",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-[15px] gap-2 rounded-xl",
  icon: "h-10 w-10 rounded-xl",
  "icon-sm": "h-8 w-8 rounded-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "outline", size = "md", loading, icon, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium whitespace-nowrap",
        "transition-[background-color,color,border-color,transform,opacity] duration-150",
        "disabled:pointer-events-none disabled:opacity-45",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
      ) : (
        icon
      )}
      {children}
    </button>
  );
});

/** Icon-only button: the label becomes the accessible name and the tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(
  function IconButton({ label, className, size = "icon-sm", variant = "ghost", ...props }, ref) {
    return (
      <Button
        ref={ref}
        aria-label={label}
        title={label}
        size={size}
        variant={variant}
        className={className}
        {...props}
      />
    );
  },
);
