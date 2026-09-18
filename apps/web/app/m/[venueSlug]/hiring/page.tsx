import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
import { MobileHiringScreen } from "@/components/mobile/mobile-hiring-screen";
import { canAccessHiring } from "@/lib/hr/permissions";
import { getMobileAppContext } from "@/lib/mobile/page-context";
import { canAccessMobileApp } from "@/lib/mobile/permissions";
import { loadMobileHiringPage } from "@/lib/mobile/hiring-replies";

type PageProps = {
  params: Promise<{ venueSlug: string }>;
};

export default async function MobileHiringPage({ params }: PageProps) {
  const { venueSlug } = await params;
  const { venue, permissions } = await getMobileAppContext(venueSlug);

  if (!canAccessMobileApp(permissions, venue.id)) {
    return <MobileAccessDenied />;
  }
  if (!canAccessHiring(permissions, venue.id)) {
    return <MobileAccessDenied />;
  }

  const initial = await loadMobileHiringPage(venue.id);

  return (
    <div className="h-full min-h-0 overflow-hidden mobile-app-canvas">
      <MobileHiringScreen tab="replies" venue={venue} initial={initial} />
    </div>
  );
}
