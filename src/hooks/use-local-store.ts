"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Reactive `localStorage` binding.
 *
 * `localStorage` *is* the state — there is no mirrored React state to keep in
 * sync, so there is no restore-on-mount effect and no hydration flash beyond
 * the first paint. Subscribers are notified in-tab (a `useState` mirror would
 * miss that) and across tabs via the native `storage` event.
 */

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();

function notify(key: string) {
  listeners.get(key)?.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key) notify(event.key);
  });
}

function subscribe(key: string) {
  return (listener: Listener) => {
    const set = listeners.get(key) ?? new Set();
    set.add(listener);
    listeners.set(key, set);
    return () => {
      set.delete(listener);
    };
  };
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private browsing or a disabled storage quota — fall back to the default.
    return null;
  }
}

export function useLocalStore<T>(
  key: string,
  fallback: T,
  parse: (raw: string) => T,
  serialize: (value: T) => string,
): [T, (value: T) => void] {
  const raw = useSyncExternalStore(
    useMemo(() => subscribe(key), [key]),
    () => read(key),
    // The server has no storage; rendering the fallback keeps hydration stable.
    () => null,
  );

  const value = useMemo(() => {
    if (raw == null) return fallback;
    try {
      return parse(raw);
    } catch {
      return fallback;
    }
    // `fallback` is intentionally excluded: callers pass object literals, and
    // re-parsing on every render would defeat the memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, parse]);

  const set = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, serialize(next));
      } catch {
        // Non-fatal: the value simply won't survive a reload.
      }
      notify(key);
    },
    [key, serialize],
  );

  return [value, set];
}

/** JSON-encoded variant for structured values. */
export function useLocalJson<T>(key: string, fallback: T): [T, (value: T) => void] {
  const parse = useCallback((raw: string) => JSON.parse(raw) as T, []);
  const serialize = useCallback((value: T) => JSON.stringify(value), []);
  return useLocalStore(key, fallback, parse, serialize);
}
