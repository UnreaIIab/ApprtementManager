import type { Apartment } from "@/types/domain";

/**
 * Stay pricing — the single implementation of the rate card.
 *
 * The length-of-stay discount ladder, the cleaning fee and the tax base are
 * defined here so the availability quote on the calendar, the booking form and
 * the seeded history can never drift apart. Everything is in minor units.
 */

export interface StayQuote {
  nights: number;
  nightlyRate: number;
  /** Accommodation before any discount. */
  subtotal: number;
  /** The rule that applied, as a percentage (0 when none). */
  discountPct: number;
  discount: number;
  cleaningFee: number;
  extraFees: number;
  tax: number;
  total: number;
  /** What the guest effectively pays per night, all-in. */
  effectiveNightly: number;
}

/**
 * Length-of-stay discount. Monthly beats weekly; both are configured per
 * apartment, and either may be zero.
 */
export function lengthOfStayDiscount(apartment: Apartment, nights: number): number {
  if (nights >= 28) return apartment.monthly_discount;
  if (nights >= 7) return apartment.weekly_discount;
  return 0;
}

export function quoteStay(
  apartment: Apartment,
  nights: number,
  taxRatePct: number,
  options?: { nightlyRate?: number; extraFees?: number; discountOverride?: number },
): StayQuote {
  const safeNights = Math.max(0, Math.round(nights));
  const nightlyRate = options?.nightlyRate ?? apartment.nightly_rate;
  const subtotal = nightlyRate * safeNights;

  const discountPct = lengthOfStayDiscount(apartment, safeNights);
  const discount =
    options?.discountOverride ?? Math.round((subtotal * discountPct) / 100);

  const cleaningFee = safeNights > 0 ? apartment.cleaning_fee : 0;
  const extraFees = options?.extraFees ?? 0;

  const taxable = subtotal - discount + cleaningFee + extraFees;
  const tax = Math.round((taxable * taxRatePct) / 100);
  const total = taxable + tax;

  return {
    nights: safeNights,
    nightlyRate,
    subtotal,
    discountPct,
    discount,
    cleaningFee,
    extraFees,
    tax,
    total,
    effectiveNightly: safeNights > 0 ? Math.round(total / safeNights) : 0,
  };
}
