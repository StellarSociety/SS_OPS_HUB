import { notFound } from "next/navigation";
import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { CosCentreHeader } from "@/components/sales/cos/cos-centre-header";
import { Card } from "@/components/ui/card";
import type { CosCentreSection } from "@/lib/sales/cos-centre-sections";
import { canViewCos, getCosPageContext } from "@/lib/sales/cos-page-context";
import { COST_CENTRES, type CostCentre } from "@/lib/sales/cos-types";

/** Empty cost-centre section (Insights, Purchases, Adjustments) until built. */
export async function CosSectionPlaceholderPage({
  params,
  section,
}: {
  params: Promise<{ centre: string }>;
  section: CosCentreSection;
}) {
  const { centre } = await params;
  if (!(COST_CENTRES as readonly string[]).includes(centre)) notFound();

  const { venue, permissions } = await getCosPageContext();
  if (!canViewCos(permissions, venue.id)) return <AccessDeniedBounce />;

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <CosCentreHeader
        centre={centre as CostCentre}
        section={section}
        subtitle={venue.name}
      />
      <Card className="p-10 text-center text-sm text-black/45">
        Coming soon.
      </Card>
    </div>
  );
}
