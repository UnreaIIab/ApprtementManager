"use client";

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

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

/**
 * The rendered inner width of an element, kept current as it resizes.
 *
 * State is only ever set from the observer callback, never in the effect body:
 * `ResizeObserver` delivers the initial size on `observe`, so the first
 * measurement arrives by the same path as every later one.
 *
 * Returns 0 before the first measurement, which callers should read as "not
 * measured yet" and answer with a fixed size rather than laying out at zero.
 */
export function useContainerWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}
