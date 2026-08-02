"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Read-and-clear access to a URL query parameter.
 *
 * Deep links like `/bookings?booking=<id>` and `/expenses?new=1` drive UI state
 * directly from the URL rather than copying it into React state inside an
 * effect. Reading during render means the panel is open on first paint, and
 * `clear` strips the parameter so closing the panel is reflected in the URL —
 * which also makes the state shareable and back-button friendly.
 */
export function useQueryParam(name: string): [string | null, () => void] {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const value = searchParams.get(name);

  const clear = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete(name);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [name, pathname, router, searchParams]);

  return [value, clear];
}
