import { BenefitsShell } from "@/components/hr/benefits-shell";
import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { canAccessBenefits } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";

export default async function HrBenefitsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getHrPageContext();

  if (!canAccessBenefits(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  const venueSubtitle = venue.is_global
    ? "Benefits across venues"
    : `${venue.name} benefits`;

  return (
    <BenefitsShell venueSubtitle={venueSubtitle}>{children}</BenefitsShell>
  );
}
