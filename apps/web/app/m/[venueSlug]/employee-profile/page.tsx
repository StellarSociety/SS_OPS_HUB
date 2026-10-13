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
  const { venue, permissions, phone } =
    await getMobileAppContext(venueSlug);

  // Personal Employee Hub, and this page of it, must be switched on.
  if (
    !canAccessMobileApp(permissions, venue.id) ||
    !phone.hubPages.includes("profile")
  ) {
    return <MobileAccessDenied />;
  }


  const profile = await loadMobileWelcomeProfile({ venueId: venue.id });

  return (
    <div className="h-full min-h-0 overflow-hidden mobile-app-canvas">
      <MobileEmployeeProfileScreen venue={venue} profile={profile} />
    </div>
  );
}
