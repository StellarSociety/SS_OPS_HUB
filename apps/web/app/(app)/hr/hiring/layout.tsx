import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { HiringShell } from "@/components/hr/hiring-shell";
import { canAccessHiring } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";

export default async function HrHiringLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getHrPageContext();

  if (!canAccessHiring(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  const venueSubtitle = venue.is_global
    ? "Hiring across venues"
    : `${venue.name ?? "Venue"} hiring`;

  return <HiringShell venueSubtitle={venueSubtitle}>{children}</HiringShell>;
}
