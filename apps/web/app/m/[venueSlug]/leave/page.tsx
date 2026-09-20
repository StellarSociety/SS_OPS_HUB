import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
import { MobileEmployeeLeaveScreen } from "@/components/mobile/mobile-employee-leave-screen";
import { loadMobileEmployeeLeavePage } from "@/lib/mobile/employee-leave";
import {
  employeeHubIsOpen,
  loadEmployeeHubLevel,
} from "@/lib/mobile/employee-hub-access";
import { getMobileAppContext } from "@/lib/mobile/page-context";
import { canAccessMobileApp } from "@/lib/mobile/permissions";
import { loadMobileWelcomeProfile } from "@/lib/mobile/welcome-profile";

type PageProps = {
  params: Promise<{ venueSlug: string }>;
};

export default async function MobileEmployeeLeavePage({ params }: PageProps) {
  const { venueSlug } = await params;
  const { venue, permissions, user, supabase } = await getMobileAppContext(venueSlug);

  if (!canAccessMobileApp(permissions, venue.id)) {
    return <MobileAccessDenied />;
  }

  const hubLevel = await loadEmployeeHubLevel(supabase, user.id, venue.id);
  if (!employeeHubIsOpen(hubLevel)) {
    return <MobileAccessDenied />;
  }

  const [initial, profile] = await Promise.all([
    loadMobileEmployeeLeavePage({
      userId: user.id,
      venueId: venue.id,
    }),
    loadMobileWelcomeProfile({ venueId: venue.id }),
  ]);

  return (
    <div className="h-full min-h-0 overflow-hidden mobile-app-canvas">
      <MobileEmployeeLeaveScreen
        venue={venue}
        initial={initial}
        employeeName={profile.fullName}
      />
    </div>
  );
}
