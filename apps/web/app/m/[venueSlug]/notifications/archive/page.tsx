import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
import { MobileNotificationsScreen } from "@/components/mobile/mobile-notifications-screen";
import { getMobileAppContext } from "@/lib/mobile/page-context";
import { canAccessMobileApp } from "@/lib/mobile/permissions";
import { loadMobileNotifications } from "@/lib/mobile/welcome-notifications";

type PageProps = {
  params: Promise<{ venueSlug: string }>;
};

export default async function MobileNotificationArchivePage({
  params,
}: PageProps) {
  const { venueSlug } = await params;
  const { venue, permissions } = await getMobileAppContext(venueSlug);

  if (!canAccessMobileApp(permissions, venue.id)) {
    return <MobileAccessDenied />;
  }

  const { notifications } = await loadMobileNotifications(venue, "archive");

  return (
    <div className="h-full min-h-0 overflow-hidden mobile-app-canvas">
      <MobileNotificationsScreen
        venue={venue}
        notifications={notifications}
        folder="archive"
      />
    </div>
  );
}
