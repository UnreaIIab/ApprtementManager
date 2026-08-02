import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./env";

/**
 * Anonymous, session-free Supabase client for public pages.
 *
 * The shared listing page is read by people who are not signed in, so it must
 * not touch cookies: doing so would opt the route out of static rendering and
 * make every visit a dynamic request, for data that is identical for everyone.
 */
export function createPublicClient() {
  if (!isSupabaseConfigured) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Guest-safe fields returned by `get_public_listing`. */
export interface PublicListing {
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  bedrooms: number;
  bathrooms: number;
  beds: number;
  capacity: number;
  size_sqm: number | null;
  amenities: string[];
  images: string[];
  cover_image: string | null;
  nightly_rate: number;
  cleaning_fee: number;
  min_nights: number;
  currency: string;
  company: string;
  company_email: string | null;
  company_phone: string | null;
}

/**
 * Fetches a shared apartment by its token.
 *
 * Returns null for an unknown token, a revoked one, or an apartment whose
 * sharing has been switched off — the caller renders the same "not found" page
 * for all three, so the token itself never leaks whether it once existed.
 */
export async function fetchPublicListing(token: string): Promise<PublicListing | null> {
  const supabase = createPublicClient();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("get_public_listing", { token });
  if (error || !data) return null;
  return data as unknown as PublicListing;
}
