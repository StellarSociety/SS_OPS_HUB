import { notFound } from "next/navigation";
import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { CosCentreHeader } from "@/components/sales/cos/cos-centre-header";
import { CosInsightsCharts } from "@/components/sales/cos/cos-insights-charts";
import { Card } from "@/components/ui/card";
import { dubaiTodayIso } from "@/lib/hr/benefits/flight-ticket";
import { getCosInsightsData } from "@/lib/sales/cos-insights-data";
import { canViewCos, getCosPageContext } from "@/lib/sales/cos-page-context";
import { COST_CENTRES, type CostCentre } from "@/lib/sales/cos-types";

export default async function CosInsightsPage({
  params,
}: {
  params: Promise<{ centre: string }>;
}) {
  const { centre } = await params;
  if (!(COST_CENTRES as readonly string[]).includes(centre)) notFound();
  const costCentre = centre as CostCentre;

  const { venue, permissions, supabase } = await getCosPageContext();
  if (!canViewCos(permissions, venue.id)) return <AccessDeniedBounce />;

  let data: Awaited<ReturnType<typeof getCosInsightsData>> | null = null;
  try {
    data = await getCosInsightsData(
      supabase,
      venue.id,
      costCentre,
      dubaiTodayIso(),
    );
  } catch (error) {
    console.error("[gp-cos/insights]", error);
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <CosCentreHeader
        centre={costCentre}
        section="insights"
        subtitle="Sales, purchases and stock trends"
      />
      {data ? (
        <CosInsightsCharts data={data} />
      ) : (
        <Card className="p-6">
          <h2 className="font-serif text-xl text-[#3D421F]">
            Could not load insights
          </h2>
          <p className="mt-2 text-sm text-black/60">
            Refresh the page or try again in a moment.
          </p>
        </Card>
      )}
    </div>
  );
}
