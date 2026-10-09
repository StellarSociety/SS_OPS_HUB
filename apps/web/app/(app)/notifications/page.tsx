import { redirect } from "next/navigation";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import {
  NotificationsPage,
  type NotificationsTab,
} from "@/components/notifications/notifications-page";
import {
  getRenderClient,
  getRenderUser,
  getRenderVenue,
} from "@/lib/auth/render-user";
import { listNotificationsForUser } from "@/lib/notifications/store";

const TABS: NotificationsTab[] = [
  "all",
  "people",
  "approvals",
  "candidates",
  "social",
  "others",
  "archive",
];

export default async function NotificationsRoute({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getRenderUser();
  if (!user) redirect("/login");
  const venue = await getRenderVenue();
  if (!venue) redirect("/select-venue");

  const supabase = await getRenderClient();
  const scope = { venueId: venue.id, isGlobalVenue: venue.is_global };
  const [active, archived, { tab }] = await Promise.all([
    listNotificationsForUser(supabase, user.id, {
      ...scope,
      folder: "inbox",
      limit: 500,
    }),
    listNotificationsForUser(supabase, user.id, {
      ...scope,
      folder: "archive",
      limit: 300,
    }),
    searchParams,
  ]);

  const initialTab = TABS.find((t) => t === tab) ?? "all";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <ModulePageTitle>Notifications</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          {venue.is_global
            ? "Everything sent to you across all venues"
            : `Everything sent to you for ${venue.name}`}
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      <NotificationsPage
        initialNotifications={[...active, ...archived]}
        initialTab={initialTab}
      />
    </div>
  );
}
