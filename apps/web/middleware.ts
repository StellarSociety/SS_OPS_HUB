import { type NextRequest, NextResponse } from "next/server";
import {
  ACTIVE_SCOPE_COOKIE,
  ACTIVE_VENUE_COOKIE,
  PUBLIC_ROUTES,
} from "@/lib/constants";
import { createMiddlewareClient } from "@/lib/supabase/middleware";
import {
  VENUE_APP_ROOTS,
  VENUE_SCOPE_HEADER,
  VENUE_SEGMENT,
  VENUE_SLUG_HEADER,
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
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub ?? null;

  if (pathname.startsWith("/auth/") || pathname.startsWith("/api/")) {
    return supabaseResponse;
  }

  if (!userId && !isPublicRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
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
    const { data: profile } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.status === "disabled") {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "deactivated");
      return NextResponse.redirect(url);
    }
  }

  if (userId && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/select-venue";
    return NextResponse.redirect(url);
  }

  if (userId && pathname === "/") {
    const url = request.nextUrl.clone();
    const landing = defaultScopedUrl(request, "/dashboard");
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
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
