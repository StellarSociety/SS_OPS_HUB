import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ACTIVE_VENUE_COOKIE } from "@/lib/constants";
import {
  countUnreadNotifications,
  listNotificationsForUser,
} from "@/lib/notifications/store";
import { isAppAdmin } from "@/lib/role-permissions";
import { createClient } from "@/lib/supabase/server";
import { getUserRoleLabel } from "@/lib/user/display";

async function getActiveVenue(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cookieStore: Awaited<ReturnType<typeof cookies>>,
) {
  const slug = cookieStore.get(ACTIVE_VENUE_COOKIE)?.value;
  if (!slug) return null;

  const { data } = await supabase
    .from("venues")
    .select("*")
    .eq("slug", slug)
    .single();

  return data;
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const venue = await getActiveVenue(supabase, cookieStore);
  if (!venue) {
    redirect("/select-venue");
  }

  const [{ data: permissions }, { data: profile }, { data: allVenues }] =
    await Promise.all([
      supabase.from("user_permissions").select("*").eq("user_id", user.id),
      supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", user.id)
        .single(),
      supabase.from("venues").select("*").order("created_at", { ascending: true }),
    ]);

  const perms = permissions ?? [];
  const showSettings = isAppAdmin(perms);
  const venues = (allVenues ?? []).filter((v) => !v.is_global);

  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const avatarUrl =
    (typeof metadata?.avatar_url === "string" && metadata.avatar_url) ||
    (typeof metadata?.picture === "string" && metadata.picture) ||
    null;

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
    >
      {children}
    </AppShell>
  );
}
