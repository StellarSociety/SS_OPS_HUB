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

async function getActiveVenue() {
  const cookieStore = await cookies();
  const slug = cookieStore.get(ACTIVE_VENUE_COOKIE)?.value;
  if (!slug) return null;

  const supabase = await createClient();
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const venue = await getActiveVenue();
  if (!venue) {
    redirect("/select-venue");
  }

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  const showSettings = isAppAdmin(permissions ?? []);

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
      showSettings={showSettings}
      notifications={notifications}
      unreadCount={unreadCount}
    >
      {children}
    </AppShell>
  );
}
