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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (pathname.startsWith("/auth/") || pathname.startsWith("/api/")) {
    return supabaseResponse;
  }

  if (!user && !isPublicRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && !isPublicRoute(pathname)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.status === "disabled") {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "deactivated");
      return NextResponse.redirect(url);
    }
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/select-venue";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/") {
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
    user &&
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
  if (user && !resolution && isBareAppRoute(pathname)) {
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
