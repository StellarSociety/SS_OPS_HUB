import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
import { MobileEmployeeProfileScreen } from "@/components/mobile/mobile-employee-profile-screen";
import { getMobileAppContext } from "@/lib/mobile/page-context";
import { canAccessMobileApp } from "@/lib/mobile/permissions";
import { loadMobileWelcomeProfile } from "@/lib/mobile/welcome-profile";

type PageProps = {
  params: Promise<{ venueSlug: string }>;
};

export default async function MobileEmployeeProfilePage({ params }: PageProps) {
  const { venueSlug } = await params;
  const { venue, permissions } = await getMobileAppContext(venueSlug);

  if (!canAccessMobileApp(permissions, venue.id)) {
    return <MobileAccessDenied />;
  }

  const profile = await loadMobileWelcomeProfile();

  return (
    <div className="h-dvh overflow-hidden mobile-app-canvas">
      <MobileEmployeeProfileScreen venue={venue} profile={profile} />
    </div>
  );
}
