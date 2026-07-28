import { BenefitsShell } from "@/components/hr/benefits-shell";
import { canAccessBenefits } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";

export default async function HrBenefitsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getHrPageContext();

  if (!canAccessBenefits(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Benefits for this venue.
        </p>
      </div>
    );
  }

  const venueSubtitle = venue.is_global
    ? "Benefits across venues"
    : `${venue.name} benefits`;

  return (
    <BenefitsShell venueSubtitle={venueSubtitle}>{children}</BenefitsShell>
  );
}
