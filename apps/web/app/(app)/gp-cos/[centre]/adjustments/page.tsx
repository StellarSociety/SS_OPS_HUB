import { notFound } from "next/navigation";
import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { CosAdjustmentsTable } from "@/components/sales/cos/cos-adjustments-table";
import { CosCentreHeader } from "@/components/sales/cos/cos-centre-header";
import { Card } from "@/components/ui/card";
import { dubaiTodayIso } from "@/lib/hr/benefits/flight-ticket";
import { weeksInMonth } from "@/lib/sales/cos-calculations";
import { cosWeekRange } from "@/lib/sales/cos-overview-data";
import { canViewCos, getCosPageContext } from "@/lib/sales/cos-page-context";
import { listVenueCosRuns } from "@/lib/sales/cos-store";
import { COST_CENTRES, type CostCentre } from "@/lib/sales/cos-types";

export default async function CosAdjustmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ centre: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { centre } = await params;
  if (!(COST_CENTRES as readonly string[]).includes(centre)) notFound();
  const costCentre = centre as CostCentre;

  const { venue, permissions, supabase } = await getCosPageContext();
  if (!canViewCos(permissions, venue.id)) return <AccessDeniedBounce />;

  const sp = await searchParams;
  const fiscalYear = Number(sp.year) || Number(dubaiTodayIso().slice(0, 4));

  // Accounting month spans (first week's start → last week's end).
  const monthSpans = Array.from({ length: 12 }, (_, i) => {
    const wks = weeksInMonth(i);
    return {
      start: cosWeekRange(fiscalYear, wks[0]).start,
      end: cosWeekRange(fiscalYear, wks[wks.length - 1]).end,
    };
  });

  let runs: Awaited<ReturnType<typeof listVenueCosRuns>> | null = null;
  try {
    runs = await listVenueCosRuns(supabase, venue.id, costCentre, fiscalYear);
  } catch (error) {
    console.error("[gp-cos/adjustments]", error);
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <CosCentreHeader
        centre={costCentre}
        section="adjustments"
        subtitle="Adjustments recorded on cost runs"
      />
      {runs ? (
        <CosAdjustmentsTable
          centre={costCentre}
          fiscalYear={fiscalYear}
          runs={runs}
          monthSpans={monthSpans}
        />
      ) : (
        <Card className="p-6">
          <h2 className="font-serif text-xl text-[#3D421F]">
            Could not load adjustments
          </h2>
          <p className="mt-2 text-sm text-black/60">
            Refresh the page or try again in a moment.
          </p>
        </Card>
      )}
    </div>
  );
}
