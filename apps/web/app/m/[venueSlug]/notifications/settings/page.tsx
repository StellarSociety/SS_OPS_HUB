import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
import { MobileNotificationSettingsScreen } from "@/components/mobile/mobile-notification-settings-screen";
import { getMobileAppContext } from "@/lib/mobile/page-context";
import { canAccessMobileApp } from "@/lib/mobile/permissions";

type PageProps = {
  params: Promise<{ venueSlug: string }>;
};

export default async function MobileNotificationSettingsPage({
  params,
}: PageProps) {
  const { venueSlug } = await params;
  const { venue, permissions } = await getMobileAppContext(venueSlug);

  if (!canAccessMobileApp(permissions, venue.id)) {
    return <MobileAccessDenied />;
  }

  return (
    <div className="h-full min-h-0 overflow-hidden mobile-app-canvas">
      <MobileNotificationSettingsScreen venue={venue} />
    </div>
  );
}
