"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * True once the component has hydrated on the client.
 *
 * Portals, `document` access and OS-theme reads all need this guard. Using
 * `useSyncExternalStore` rather than a `useState` + `useEffect` pair keeps it a
 * single render pass — the effect version sets state immediately on mount,
 * which is a cascading render the React Compiler (rightly) rejects.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
