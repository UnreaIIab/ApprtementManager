"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

const CONTROL_BASE =
  "w-full bg-surface text-ink placeholder:text-ink-3 border border-line rounded-xl " +
  "transition-[border-color,box-shadow] duration-150 " +
  "hover:border-line-strong focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

const CONTROL_SIZE = "h-10 px-3 text-sm";

/** Label + control + error/hint wrapper used by every form in the app. */
export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {label ? (
        <label
          htmlFor={htmlFor}
          className="mb-1.5 block text-[13px] font-medium text-ink-2"
        >
          {label}
          {required ? <span className="ml-0.5 text-critical">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 text-[12px] font-medium text-critical">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          CONTROL_BASE,
          CONTROL_SIZE,
          invalid && "border-critical focus:border-critical focus:ring-critical/15",
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, rows = 3, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL_BASE,
        "px-3 py-2.5 text-sm resize-y",
        invalid && "border-critical focus:border-critical focus:ring-critical/15",
        className,
      )}
      {...props}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, invalid, children, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          CONTROL_BASE,
          CONTROL_SIZE,
          "appearance-none pr-9 cursor-pointer",
          invalid && "border-critical focus:border-critical focus:ring-critical/15",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-3"
      />
    </div>
  );
});

/** Money input that speaks major units to the user, minor units to the app. */
export const MoneyInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
    /** Value in minor units (cents). */
    value: number;
    onValueChange: (minorUnits: number) => void;
    symbol?: string;
    invalid?: boolean;
  }
>(function MoneyInput({ value, onValueChange, symbol = "€", className, invalid, ...props }, ref) {
  /*
   * Laid out as an input group rather than an absolutely-positioned prefix over
   * a padded field. Fixed padding only works for a one-character symbol — with
   * a three-letter code like MAD or CHF the amount renders on top of it. Here
   * the symbol takes its natural width and the input claims the rest, so any
   * currency fits.
   *
   * The border and focus ring live on the wrapper via `focus-within`, so the
   * group still reads and behaves as a single control.
   */
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-xl border bg-surface px-3",
        "h-10 transition-[border-color,box-shadow] duration-150",
        "focus-within:ring-2 focus-within:ring-ink/10",
        invalid
          ? "border-critical focus-within:border-critical focus-within:ring-critical/15"
          : "border-line hover:border-line-strong focus-within:border-ink",
        className,
      )}
    >
      <span className="shrink-0 select-none text-sm text-ink-3">{symbol}</span>
      <input
        ref={ref}
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        value={Number.isFinite(value) ? (value / 100).toString() : ""}
        onChange={(event) => {
          const parsed = Number.parseFloat(event.target.value);
          onValueChange(Number.isFinite(parsed) ? Math.round(parsed * 100) : 0);
        }}
        aria-invalid={invalid || undefined}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-sm text-ink tnum",
          "placeholder:text-ink-3 focus:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Stepper arrows move money by one cent at a time, which is never
          // what anyone wants, and they crowd the field.
          "[appearance:textfield]",
          "[&::-webkit-outer-spin-button]:appearance-none",
          "[&::-webkit-inner-spin-button]:appearance-none",
        )}
        {...props}
      />
    </div>
  );
});

export function Checkbox({
  label,
  description,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <label
      htmlFor={props.id ?? id}
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-lg py-1 select-none",
        className,
      )}
    >
      <input
        id={props.id ?? id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-line accent-[var(--brand)]"
        {...props}
      />
      <span className="min-w-0">
        <span className="block text-sm text-ink">{label}</span>
        {description ? (
          <span className="block text-[12px] text-ink-3">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
      {label ? (
        <span className="min-w-0">
          <span className="block text-sm font-medium text-ink">{label}</span>
          {description ? (
            <span className="block text-[12px] text-ink-3">{description}</span>
          ) : null}
        </span>
      ) : null}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === "string" ? label : t.ui.toggle}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          checked ? "bg-brand" : "bg-line-strong",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-200",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
    </label>
  );
}
