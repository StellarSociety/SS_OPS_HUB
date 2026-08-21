import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
import { MobileNotificationsScreen } from "@/components/mobile/mobile-notifications-screen";
import { getMobileAppContext } from "@/lib/mobile/page-context";
import { canAccessMobileApp } from "@/lib/mobile/permissions";
import { loadMobileNotifications } from "@/lib/mobile/welcome-notifications";

type PageProps = {
  params: Promise<{ venueSlug: string }>;
};

export default async function MobileNotificationsPage({ params }: PageProps) {
  const { venueSlug } = await params;
  const { venue, permissions } = await getMobileAppContext(venueSlug);

  if (!canAccessMobileApp(permissions, venue.id)) {
    return <MobileAccessDenied />;
  }

  const { notifications } = await loadMobileNotifications(venue);

  return (
    <div className="h-dvh overflow-hidden mobile-app-canvas">
      <MobileNotificationsScreen venue={venue} notifications={notifications} />
    </div>
  );
}
