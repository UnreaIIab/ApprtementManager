/**
 * Supabase configuration.
 *
 * These two values are the app's only backend configuration. They are
 * `NEXT_PUBLIC_*`, so they are inlined at build time — set them before
 * `npm run build` and rebuild whenever they change.
 *
 * Only ever the **anon** key belongs here. The `service_role` key bypasses
 * row-level security, and anything prefixed `NEXT_PUBLIC_` is shipped to every
 * browser. Data is protected by the RLS policies in `supabase/migrations`, not
 * by keeping the anon key secret.
 *
 * When the values are absent the app renders a setup screen rather than
 * starting: silently substituting placeholder data would let a
 * misconfigured deployment look healthy while showing numbers that are not real.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Which of the two is missing, for the setup screen to name precisely. */
export function missingSupabaseVars(): string[] {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!SUPABASE_ANON_KEY) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return missing;
}
