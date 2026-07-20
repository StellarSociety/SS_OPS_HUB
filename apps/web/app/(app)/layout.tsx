import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import {
  countUnreadNotifications,
  listNotificationsForUser,
} from "@/lib/notifications/store";
import { isAppAdmin } from "@/lib/role-permissions";
import { createClient } from "@/lib/supabase/server";
import { getUserRoleLabel } from "@/lib/user/display";
import { resolveAvatarUrl } from "@/lib/user/resolve-avatar-url";
import { resolveActiveVenue } from "@/lib/venue/active-venue";
import { GLOBAL_BASE, venueBase } from "@/lib/venue/scope-routing";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const venue = await resolveActiveVenue(supabase);
  if (!venue) {
    redirect("/select-venue");
  }

  const scope = venue.is_global ? "global" : "venue";
  const scopeBase = venue.is_global ? GLOBAL_BASE : venueBase(venue.slug);

  const [{ data: permissions }, profileResult, { data: allVenues }] =
    await Promise.all([
      supabase.from("user_permissions").select("*").eq("user_id", user.id),
      supabase
        .from("profiles")
        .select(
          `
          email,
          full_name,
          avatar_url,
          staff:staff_id ( photo_url )
        `,
        )
        .eq("id", user.id)
        .maybeSingle(),
      supabase.from("venues").select("*").order("created_at", { ascending: true }),
    ]);

  type ProfileShape = {
    email?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
    staff?: { photo_url?: string | null } | { photo_url?: string | null }[] | null;
  } | null;

  let profile = profileResult.data as ProfileShape;

  if (profileResult.error) {
    const { data: profileFallback } = await supabase
      .from("profiles")
      .select("email, full_name, staff:staff_id ( photo_url )")
      .eq("id", user.id)
      .maybeSingle();
    profile = profileFallback as ProfileShape;
  }

  const staffJoin = profile?.staff;
  const staffPhoto =
    staffJoin == null
      ? null
      : Array.isArray(staffJoin)
        ? (staffJoin[0]?.photo_url ?? null)
        : (staffJoin.photo_url ?? null);

  const perms = permissions ?? [];
  const showSettings = isAppAdmin(perms);
  const venues = (allVenues ?? []).filter((v) => !v.is_global);

  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const avatarUrl = resolveAvatarUrl({
    profileAvatarUrl: profile?.avatar_url,
    staffPhotoUrl: staffPhoto,
    userMetadata: metadata,
  });

  const shellUser = {
    email: profile?.email ?? user.email ?? "",
    fullName: profile?.full_name ?? null,
    avatarUrl,
    roleLabel: getUserRoleLabel(perms),
  };

  const venueContext = {
    venueId: venue.id,
    isGlobalVenue: venue.is_global,
  };

  const [notifications, unreadCount] = await Promise.all([
    listNotificationsForUser(supabase, user.id, { ...venueContext, limit: 40 }),
    countUnreadNotifications(supabase, user.id, venueContext),
  ]);

  return (
    <AppShell
      venue={venue}
      venues={venues}
      user={shellUser}
      showSettings={showSettings}
      notifications={notifications}
      unreadCount={unreadCount}
      scope={scope}
      scopeSlug={venue.is_global ? null : venue.slug}
      scopeBase={scopeBase}
    >
      {children}
    </AppShell>
  );
}
