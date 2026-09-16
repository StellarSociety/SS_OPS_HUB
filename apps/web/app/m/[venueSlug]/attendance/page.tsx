import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
import { MobileEmployeeAttendanceScreen } from "@/components/mobile/mobile-employee-attendance-screen";
import { currentMonthKey, isValidMonthKey } from "@/lib/hr/attendance-months";
import { loadCurrentUserAttendanceMonth } from "@/lib/mobile/employee-attendance";
import { getMobileAppContext } from "@/lib/mobile/page-context";
import { canAccessMobileApp } from "@/lib/mobile/permissions";
import { loadMobileWelcomeProfile } from "@/lib/mobile/welcome-profile";

type PageProps = {
  params: Promise<{ venueSlug: string }>;
  searchParams: Promise<{ month?: string }>;
};

export default async function MobileEmployeeAttendancePage({
  params,
  searchParams,
}: PageProps) {
  const { venueSlug } = await params;
  const query = await searchParams;
  const { venue, permissions } = await getMobileAppContext(venueSlug);

  if (!canAccessMobileApp(permissions, venue.id)) {
    return <MobileAccessDenied />;
  }

  const monthKey = isValidMonthKey(query.month ?? "")
    ? query.month!
    : currentMonthKey();
  const [initial, profile] = await Promise.all([
    loadCurrentUserAttendanceMonth({
      venueId: venue.id,
      monthKey,
    }),
    loadMobileWelcomeProfile({ venueId: venue.id }),
  ]);

  return (
    <div className="h-full min-h-0 overflow-hidden mobile-app-canvas">
      <MobileEmployeeAttendanceScreen
        venue={venue}
        initial={initial}
        employeeName={profile.fullName}
      />
    </div>
  );
}
