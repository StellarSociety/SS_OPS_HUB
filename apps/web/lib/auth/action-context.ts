import { cookies, headers } from "next/headers";
import { ACTIVE_SCOPE_COOKIE, ACTIVE_VENUE_COOKIE } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getActiveScope,
  resolveActiveVenue,
} from "@/lib/venue/active-venue";
import {
  VENUE_SCOPE_HEADER,
  VENUE_SLUG_HEADER,
} from "@/lib/venue/scope-routing";
import type { UserPermission } from "@/lib/role-permissions";

export type ActionAuthContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email?: string | null };
  venue: NonNullable<Awaited<ReturnType<typeof resolveActiveVenue>>>;
  permissions: UserPermission[];
};

export type ActionAuthFailure = {
  error: string;
  debug: Record<string, string | null>;
};

/**
 * Like page loaders but never redirects — safe for server actions (redirects
 * hang the client with no toast).
 */
export async function getActionAuthContext(): Promise<
  ActionAuthContext | ActionAuthFailure
> {
  const headerStore = await headers();
  const cookieStore = await cookies();
  const activeScope = await getActiveScope();

  const debug: Record<string, string | null> = {
    headerScope: headerStore.get(VENUE_SCOPE_HEADER),
    headerSlug: headerStore.get(VENUE_SLUG_HEADER),
    cookieScope: cookieStore.get(ACTIVE_SCOPE_COOKIE)?.value ?? null,
    cookieVenue: cookieStore.get(ACTIVE_VENUE_COOKIE)?.value ?? null,
    resolvedScope: activeScope?.scope ?? null,
    resolvedSlug: activeScope?.slug ?? null,
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "Not signed in. Sign in again and retry.",
      debug,
    };
  }

  const venue = await resolveActiveVenue(supabase);
  if (!venue) {
    return {
      error:
        "No active venue for this request. Open HR from a venue URL (e.g. /venue/orilla/hr/staff), not Global-only links.",
      debug,
    };
  }

  debug.venueId = venue.id;
  debug.venueSlug = venue.slug ?? null;

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  return {
    supabase,
    user,
    venue,
    permissions: permissions ?? [],
  };
}

/** Non-secret checks for production troubleshooting (logged-in users only). */
export async function diagnosePersistenceAccess(): Promise<{
  ok: boolean;
  userId: string | null;
  venueSlug: string | null;
  env: {
    hasSupabaseUrl: boolean;
    hasAnonKey: boolean;
    hasServiceRoleKey: boolean;
  };
  serviceClient: { ok: boolean; error: string | null };
  scope: Record<string, string | null>;
}> {
  const ctx = await getActionAuthContext();
  const scope =
    "error" in ctx
      ? ctx.debug
      : {
          venueId: ctx.venue.id,
          venueSlug: ctx.venue.slug ?? null,
        };

  const env = {
    hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()),
    hasAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()),
    hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
  };

  let serviceClient: { ok: boolean; error: string | null } = {
    ok: false,
    error: null,
  };
  if (env.hasServiceRoleKey && env.hasSupabaseUrl) {
    try {
      const service = createServiceClient();
      const { error } = await service.from("venues").select("id").limit(1);
      serviceClient = {
        ok: !error,
        error: error?.message ?? null,
      };
    } catch (err) {
      serviceClient = {
        ok: false,
        error: err instanceof Error ? err.message : "Service client failed",
      };
    }
  } else {
    serviceClient = {
      ok: false,
      error: "Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL on the server.",
    };
  }

  const ok =
    !("error" in ctx) && env.hasServiceRoleKey && serviceClient.ok;

  return {
    ok,
    userId: "error" in ctx ? null : ctx.user.id,
    venueSlug:
      "error" in ctx
        ? (scope.resolvedSlug ?? scope.cookieVenue ?? null)
        : (ctx.venue.slug ?? null),
    env,
    serviceClient,
    scope: scope as Record<string, string | null>,
  };
}
