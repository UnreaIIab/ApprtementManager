"use client";

import { createContext, useContext, type ReactNode } from "react";
import dayjs from "dayjs";
import "dayjs/locale/fr";
import "dayjs/locale/en-gb";
import { fr, type Dictionary } from "./fr";
import { en } from "./en";

export type { Dictionary } from "./fr";

export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** French is the house language; anything unrecognised falls back to it. */
export const DEFAULT_LOCALE: Locale = "fr";

const DICTIONARIES: Record<Locale, Dictionary> = { fr, en };

/** dayjs ships `fr` and `en-gb`; its keys are not our locale codes. */
const DAYJS_LOCALES: Record<Locale, string> = { fr: "fr", en: "en-gb" };

export function isLocale(value: string | null | undefined): value is Locale {
  return LOCALES.includes(value as Locale);
}

export function normaliseLocale(value: string | null | undefined): Locale {
  if (isLocale(value)) return value;
  // Tolerate anything region-tagged that was stored before this existed —
  // `fr-MA`, `en-GB` — rather than silently reverting those users to French.
  const base = value?.split(/[-_]/)[0]?.toLowerCase();
  return isLocale(base) ? base : DEFAULT_LOCALE;
}

export function dictionaryFor(locale: string | null | undefined): Dictionary {
  return DICTIONARIES[normaliseLocale(locale)];
}

/* ------------------------------------------------------------------ */
/* Module-level active locale                                          */
/* ------------------------------------------------------------------ */

/*
 * The formatting layer — money, dates, "3 nuits" — is called from plain
 * functions all over the app, including outside React. It cannot read a
 * context, so the active dictionary is also kept here, set once per locale
 * change alongside the dayjs locale. Components should use `useT()`; this is
 * for `lib/format.ts` and the label tables in `lib/constants.ts`.
 */
let active: Dictionary = fr;
let activeLocale: Locale = DEFAULT_LOCALE;

export function setActiveLocale(locale: string | null | undefined) {
  activeLocale = normaliseLocale(locale);
  active = DICTIONARIES[activeLocale];
  dayjs.locale(DAYJS_LOCALES[activeLocale]);
}

/** The active dictionary, for non-React code. */
export function strings(): Dictionary {
  return active;
}

export function getActiveLocale(): Locale {
  return activeLocale;
}

// French from the very first render, before any org settings have loaded.
setActiveLocale(DEFAULT_LOCALE);

/* ------------------------------------------------------------------ */
/* React                                                               */
/* ------------------------------------------------------------------ */

const TranslationContext = createContext<Dictionary>(fr);

export function TranslationProvider({
  locale,
  children,
}: {
  locale: string | null | undefined;
  children: ReactNode;
}) {
  return (
    <TranslationContext.Provider value={dictionaryFor(locale)}>
      {children}
    </TranslationContext.Provider>
  );
}

/**
 * The dictionary for the current language.
 *
 * Returns the object rather than a `t("some.key")` lookup so every string is
 * checked by the compiler and autocompletes: a typo is a red squiggle, not a
 * key echoed back at the user in production.
 */
export function useT(): Dictionary {
  return useContext(TranslationContext);
}
