import { type NextRequest, NextResponse } from "next/server";
import {
  ACTIVE_SCOPE_COOKIE,
  ACTIVE_VENUE_COOKIE,
  PUBLIC_ROUTES,
} from "@/lib/constants";
import { createMiddlewareClient } from "@/lib/supabase/middleware";
import {
  isMobileAppPath,
  MOBILE_APP_BASE,
  safeMobileAppPath,
} from "@/lib/mobile/app-path";
import {
  VENUE_APP_ROOTS,
  VENUE_SCOPE_HEADER,
  VENUE_SEGMENT,
  VENUE_SLUG_HEADER,
  DEFAULT_LANDING_PATH,
  canonicalToGlobalPublic,
  isUnscopedPath,
  resolvePublicPath,
  venueBase,
} from "@/lib/venue/scope-routing";

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function isBareAppRoute(pathname: string) {
  return VENUE_APP_ROOTS.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

/** Default scoped landing URL for `canonicalPath`, based on remembered scope. */
function defaultScopedUrl(request: NextRequest, canonicalPath: string): string | null {
  const scopeCookie = request.cookies.get(ACTIVE_SCOPE_COOKIE)?.value;
  if (scopeCookie === "global") {
    return canonicalToGlobalPublic(canonicalPath);
  }
  const slug = request.cookies.get(ACTIVE_VENUE_COOKIE)?.value;
  if (slug) {
    return `${venueBase(slug)}${canonicalPath}`;
  }
  return null;
}

const AUTH_CHECK_TIMEOUT_MS = 3_000;

/** Prevent middleware from hanging when Edge can't reach Supabase JWKS. */
async function resolveMiddlewareUserId(
  supabase: ReturnType<typeof createMiddlewareClient>["supabase"],
): Promise<string | null> {
  try {
    const claimsResult = await Promise.race([
      supabase.auth.getClaims(),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("getClaims timeout")),
          AUTH_CHECK_TIMEOUT_MS,
        );
      }),
    ]);
    return claimsResult.data?.claims?.sub ?? null;
  } catch (error) {
    console.warn(
      "[middleware] getClaims failed:",
      error instanceof Error ? error.message : error,
    );
    try {
      const { data } = await supabase.auth.getSession();
      return data.session?.user?.id ?? null;
    } catch (sessionError) {
      console.warn(
        "[middleware] getSession fallback failed:",
        sessionError instanceof Error ? sessionError.message : sessionError,
      );
      return null;
    }
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Resolve venue/global scope from the URL up front so the active venue is
  // derived per-request (per-tab) rather than from shared browser state.
  const resolution = isUnscopedPath(pathname) ? null : resolvePublicPath(pathname);

  const extraHeaders = resolution
    ? {
        [VENUE_SCOPE_HEADER]: resolution.scope,
        ...(resolution.slug ? { [VENUE_SLUG_HEADER]: resolution.slug } : {}),
      }
    : undefined;

  const rewriteTo = resolution?.needsRewrite
    ? (() => {
        const url = request.nextUrl.clone();
        url.pathname = resolution.canonical;
        return url;
      })()
    : undefined;

  const { supabase, supabaseResponse } = createMiddlewareClient(request, {
    headers: extraHeaders,
    rewriteTo,
  });

  // Verify the session JWT LOCALLY (asymmetric signing keys) instead of making
  // a network round-trip to the Supabase auth server on every request. This is
  // the hot path for every navigation, prefetch and RSC fetch, so it must stay
  // cheap. `getClaims` still refreshes an expired token when needed.
  //
  // When Edge can't reach Supabase JWKS (transient network / Turbopack sandbox
  // fetch failures), fall back to the cookie session so server actions don't
  // get "unexpected response" / Failed to fetch cascades.
  const userId = await resolveMiddlewareUserId(supabase);

  if (pathname.startsWith("/auth/") || pathname.startsWith("/api/")) {
    return supabaseResponse;
  }

  if (!userId && !isPublicRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = isMobileAppPath(pathname)
      ? `${MOBILE_APP_BASE}/login`
      : "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // Enforce the "disabled account" gate. This is a DB round-trip, so skip it for
  // link prefetches (which fire constantly across the sidebar and must never
  // sign anyone out). Real navigations — soft or hard — still enforce it.
  const isPrefetch =
    request.headers.get("next-router-prefetch") === "1" ||
    (request.headers.get("sec-purpose") ?? "").includes("prefetch") ||
    (request.headers.get("purpose") ?? "") === "prefetch";

  if (userId && !isPublicRoute(pathname) && !isPrefetch) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("status")
        .eq("id", userId)
        .maybeSingle();

      if (profile?.status === "disabled") {
        await supabase.auth.signOut();
        const url = request.nextUrl.clone();
        url.pathname = isMobileAppPath(pathname)
          ? `${MOBILE_APP_BASE}/login`
          : "/login";
        url.searchParams.set("error", "deactivated");
        return NextResponse.redirect(url);
      }
    } catch (error) {
      console.warn(
        "[middleware] profile status check failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  if (userId && pathname === `${MOBILE_APP_BASE}/login`) {
    const url = request.nextUrl.clone();
    const next = safeMobileAppPath(request.nextUrl.searchParams.get("next"));
    url.search = "";
    url.pathname = next
      ? new URL(next, request.url).pathname
      : `${MOBILE_APP_BASE}/select-venue`;
    if (next) {
      const nextUrl = new URL(next, request.url);
      url.search = nextUrl.search;
    }
    return NextResponse.redirect(url);
  }

  if (userId && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/select-venue";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (userId && (pathname === MOBILE_APP_BASE || pathname === `${MOBILE_APP_BASE}/`)) {
    const url = request.nextUrl.clone();
    url.pathname = `${MOBILE_APP_BASE}/select-venue`;
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (userId && pathname === "/") {
    const url = request.nextUrl.clone();
    const landing = defaultScopedUrl(request, DEFAULT_LANDING_PATH);
    url.pathname = "/select-venue";
    if (landing) {
      const landingUrl = new URL(landing, request.url);
      url.pathname = landingUrl.pathname;
    }
    return NextResponse.redirect(url);
  }

  // A `/venue` or `/venue/<empty>` URL with no slug cannot be scoped.
  if (
    userId &&
    (pathname === `/${VENUE_SEGMENT}` ||
      pathname === `/${VENUE_SEGMENT}/`) &&
    !resolution
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/select-venue";
    return NextResponse.redirect(url);
  }

  // Bare (unscoped) canonical app routes — redirect to a scoped URL so every
  // navigation carries its venue/global context in the path.
  if (userId && !resolution && isBareAppRoute(pathname)) {
    const landing = defaultScopedUrl(request, pathname);
    const url = request.nextUrl.clone();
    if (landing) {
      const landingUrl = new URL(landing, request.url);
      url.pathname = landingUrl.pathname;
      url.search = search;
    } else {
      url.pathname = "/select-venue";
    }
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Skip WorkDrive upload: middleware body buffering truncates large
     * multipart payloads (default 10mb) and breaks request.formData().
     * Auth for that route is enforced in the route handler.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/hr/workdrive/upload|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
