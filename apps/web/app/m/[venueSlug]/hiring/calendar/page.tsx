import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
import { MobileHiringScreen } from "@/components/mobile/mobile-hiring-screen";
import { canAccessHiring } from "@/lib/hr/permissions";
import { getMobileAppContext } from "@/lib/mobile/page-context";
import { canAccessMobileApp } from "@/lib/mobile/permissions";
import {
  EMPTY_MOBILE_HIRING_PAGE,
  loadMobileHiringAppointments,
} from "@/lib/mobile/hiring-replies";

type PageProps = {
  params: Promise<{ venueSlug: string }>;
};

export default async function MobileHiringCalendarPage({ params }: PageProps) {
  const { venueSlug } = await params;
  const { venue, permissions } = await getMobileAppContext(venueSlug);

  if (!canAccessMobileApp(permissions, venue.id)) {
    return <MobileAccessDenied />;
  }
  if (!canAccessHiring(permissions, venue.id)) {
    return <MobileAccessDenied />;
  }

  const appointments = await loadMobileHiringAppointments(venue.id);

  return (
    <div className="h-full min-h-0 overflow-hidden mobile-app-canvas">
      <MobileHiringScreen
        tab="calendar"
        venue={venue}
        initial={EMPTY_MOBILE_HIRING_PAGE}
        appointments={appointments}
      />
    </div>
  );
}
