import { AttendanceShell } from "@/components/hr/attendance-shell";
import { canAccessStaff } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";

export default async function AttendanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getHrPageContext();

  if (!canAccessStaff(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Human Resources for this venue.
        </p>
      </div>
    );
  }

  const venueSubtitle = venue.is_global
    ? "Fingerprint attendance across venues"
    : `${venue.name} fingerprint attendance`;

  return (
    <AttendanceShell venueSubtitle={venueSubtitle}>{children}</AttendanceShell>
  );
}
