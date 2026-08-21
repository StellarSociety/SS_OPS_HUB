import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
import { MobileTermsScreen } from "@/components/mobile/mobile-terms-screen";
import { getMobileAppContext } from "@/lib/mobile/page-context";
import { canAccessMobileApp } from "@/lib/mobile/permissions";

type PageProps = {
  params: Promise<{ venueSlug: string }>;
};

export default async function MobileTermsPage({ params }: PageProps) {
  const { venueSlug } = await params;
  const { venue, permissions } = await getMobileAppContext(venueSlug);

  if (!canAccessMobileApp(permissions, venue.id)) {
    return <MobileAccessDenied />;
  }

  return (
    <div className="h-dvh overflow-hidden mobile-app-canvas">
      <MobileTermsScreen venue={venue} />
    </div>
  );
}
