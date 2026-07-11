import { type NextRequest, NextResponse } from "next/server";
import { ACTIVE_VENUE_COOKIE, PUBLIC_ROUTES } from "@/lib/constants";
import { createMiddlewareClient } from "@/lib/supabase/middleware";

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { supabase, supabaseResponse } = createMiddlewareClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

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
    url.pathname = request.cookies.get(ACTIVE_VENUE_COOKIE)
      ? "/dashboard"
      : "/select-venue";
    return NextResponse.redirect(url);
  }

  const appRoutes = ["/dashboard", "/modules", "/settings", "/global", "/hr"];
  const isAppRoute = appRoutes.some((route) => pathname.startsWith(route));

  if (user && isAppRoute && !request.cookies.get(ACTIVE_VENUE_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/select-venue";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
