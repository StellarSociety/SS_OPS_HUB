import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import {
  countUnreadNotifications,
  listNotificationsForUser,
} from "@/lib/notifications/store";
import { isAppAdmin } from "@/lib/role-permissions";
import { getRenderClient, getRenderUser, getRenderVenue } from "@/lib/auth/render-user";
import { canManageProfileAvatar } from "@/lib/user/can-manage-profile-avatar";
import { getUserRoleLabel } from "@/lib/user/display";
import { resolveAvatarUrl } from "@/lib/user/resolve-avatar-url";
import { fetchGroupBrandingState } from "@/lib/group/branding";
import { GLOBAL_BASE, venueBase } from "@/lib/venue/scope-routing";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await getRenderClient();
  const user = await getRenderUser();

  if (!user) {
    redirect("/login");
  }

  const venue = await getRenderVenue();
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
          is_external,
          staff:staff_id ( photo_url, emp_no )
        `,
        )
        .eq("id", user.id)
        .maybeSingle(),
      supabase.from("venues").select("*").order("created_at", { ascending: true }),
    ]);

  type StaffShape = {
    photo_url?: string | null;
    emp_no?: string | null;
  };

  type ProfileShape = {
    email?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
    is_external?: boolean | null;
    staff?: StaffShape | StaffShape[] | null;
  } | null;

  let profile = profileResult.data as ProfileShape;

  if (profileResult.error) {
    const { data: profileFallback } = await supabase
      .from("profiles")
      .select(
        "email, full_name, avatar_url, is_external, staff:staff_id ( photo_url, emp_no )",
      )
      .eq("id", user.id)
      .maybeSingle();
    profile = profileFallback as ProfileShape;
  }

  const staffJoin = profile?.staff;
  const staff =
    staffJoin == null
      ? null
      : Array.isArray(staffJoin)
        ? (staffJoin[0] ?? null)
        : staffJoin;
  const staffPhoto = staff?.photo_url ?? null;
  const email = profile?.email ?? user.email ?? "";
  const preferStaffPhoto = !canManageProfileAvatar({
    is_external: profile?.is_external,
    email,
    staff: staff ? { emp_no: staff.emp_no } : null,
  });

  const perms = permissions ?? [];
  const showSettings = isAppAdmin(perms);
  const venues = (allVenues ?? []).filter((v) => !v.is_global);

  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const avatarUrl = resolveAvatarUrl({
    profileAvatarUrl: profile?.avatar_url,
    staffPhotoUrl: staffPhoto,
    preferStaffPhoto,
    userMetadata: metadata,
  });

  const shellUser = {
    email,
    fullName: profile?.full_name ?? null,
    avatarUrl,
    roleLabel: getUserRoleLabel(perms),
  };

  const venueContext = {
    venueId: venue.id,
    isGlobalVenue: venue.is_global,
  };

  const [notifications, unreadCount, branding] = await Promise.all([
    listNotificationsForUser(supabase, user.id, { ...venueContext, limit: 40 }),
    countUnreadNotifications(supabase, user.id, venueContext),
    fetchGroupBrandingState(),
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
      permissions={perms}
      logoUrl={branding.logoUrl}
      appName={branding.appName}
      groupFaviconUrl={branding.faviconUrl}
    >
      {children}
    </AppShell>
  );
}
