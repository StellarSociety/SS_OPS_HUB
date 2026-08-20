import { AttendanceShell } from "@/components/hr/attendance-shell";
import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { canAccessAttendance } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";

export default async function AttendanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getHrPageContext();

  if (!canAccessAttendance(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  const venueSubtitle = venue.is_global
    ? "Fingerprint attendance across venues"
    : `${venue.name} fingerprint attendance`;

  return (
    <AttendanceShell venueSubtitle={venueSubtitle}>{children}</AttendanceShell>
  );
}
