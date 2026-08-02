import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Routes reachable without a session.
 *
 * `/listing` is how a manager shares an apartment with a client over WhatsApp,
 * so it must not redirect to sign-in. It reads through a database function that
 * returns only guest-safe fields for apartments explicitly marked shareable.
 */
const PUBLIC_PATHS = ["/login", "/auth", "/listing"];

/**
 * Session refresh + route protection (Next.js `proxy` convention, the
 * successor to `middleware`).
 *
 * Runs on every matched request so the access token is rotated before it
 * expires — without this, a user who leaves a tab open overnight comes back to
 * failing queries. Unauthenticated requests to app routes are redirected to
 * `/login` carrying the original path, so sign-in lands where they meant to go.
 *
 * With no credentials configured there is nothing to authenticate against, so
 * the proxy stands down and the app renders its setup screen instead.
 */
export async function proxy(request: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // `getUser()` revalidates the token with Supabase and triggers the refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (user && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image optimisation, which never
     * need a session and would only add latency.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
