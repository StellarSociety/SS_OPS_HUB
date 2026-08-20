import { CommunicationsShell } from "@/components/hr/communications-shell";
import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { canViewStaff, hasHrFeatureAccess } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";

export default async function HrCommunicationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getHrPageContext();

  if (
    !hasHrFeatureAccess(permissions, "communications", venue.id) &&
    !canViewStaff(permissions, venue.id)
  ) {
    return <AccessDeniedBounce />;
  }

  return <CommunicationsShell>{children}</CommunicationsShell>;
}
