"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./env";
import type { Database } from "@/types/supabase";

export type AppSupabaseClient = SupabaseClient<Database>;

let client: AppSupabaseClient | null = null;

/**
 * Browser Supabase client (singleton).
 *
 * `@supabase/ssr` keeps the session in cookies so the server can read it too,
 * and refreshes the access token automatically before it expires.
 */
export function getBrowserSupabase(): AppSupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then rebuild.",
    );
  }
  client ??= createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}
