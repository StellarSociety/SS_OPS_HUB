import { notFound } from "next/navigation";
import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { Card } from "@/components/ui/card";
import { CostRunsPanel } from "@/components/sales/cos/cost-runs-panel";
import {
  getCosPageContext,
  canViewCos,
  canEditCos,
} from "@/lib/sales/cos-page-context";
import {
  listVenueCosRuns,
  getVenueCosSettings,
  isCosSchemaMissingError,
} from "@/lib/sales/cos-store";
import {
  COST_CENTRES,
  COST_CENTRE_LABELS,
  type CostCentre,
} from "@/lib/sales/cos-types";

function isCostCentre(value: string): value is CostCentre {
  return (COST_CENTRES as readonly string[]).includes(value);
}

export default async function CostRunsPage({
  params,
  searchParams,
}: {
  params: Promise<{ centre: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { centre } = await params;
  if (!isCostCentre(centre)) notFound();

  const { venue, permissions, supabase } = await getCosPageContext();
  if (!canViewCos(permissions, venue.id)) return <AccessDeniedBounce />;

  const { year } = await searchParams;
  const fiscalYear = Number(year) || new Date().getFullYear();
  const label = COST_CENTRE_LABELS[centre];

  let loaded:
    | { ok: true; runs: Awaited<ReturnType<typeof listVenueCosRuns>>; targetCostPct: number }
    | { ok: false; kind: "schema" | "error" };
  try {
    const [runs, settings] = await Promise.all([
      listVenueCosRuns(supabase, venue.id, centre, fiscalYear),
      getVenueCosSettings(supabase, venue.id, centre),
    ]);
    loaded = { ok: true, runs, targetCostPct: settings?.target_cost_pct ?? 27 };
  } catch (error) {
    if (isCosSchemaMissingError(error as { code?: string; message?: string })) {
      loaded = { ok: false, kind: "schema" };
    } else {
      console.error("[gp-cos/cost-runs]", error);
      loaded = { ok: false, kind: "error" };
    }
  }

  if (!loaded.ok) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <ModulePageTitle>{label} — Cost Runs</ModulePageTitle>
          <p className="mt-1 text-sm text-black/60">{venue.name}</p>
          <hr className="mt-4 border-black/10" />
        </div>
        <Card className="p-6">
          {loaded.kind === "schema" ? (
            <>
              <h2 className="font-serif text-xl text-[#3D421F]">
                Database setup required
              </h2>
              <p className="mt-2 text-sm text-black/60">
                The GP &amp; COS tables haven&apos;t been created yet. Run the
                migration <code>20261007040000_gp_cos_module.sql</code> and reload.
              </p>
            </>
          ) : (
            <>
              <h2 className="font-serif text-xl text-[#3D421F]">
                Could not load cost runs
              </h2>
              <p className="mt-2 text-sm text-black/60">
                Something went wrong. Refresh the page or try again in a moment.
              </p>
            </>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModulePageTitle>{label} — Cost Runs</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Weekly cost of sales &amp; gross profit — {venue.name} · {fiscalYear}
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      <CostRunsPanel
        costCentre={centre}
        fiscalYear={fiscalYear}
        runs={loaded.runs}
        targetCostPct={loaded.targetCostPct}
        canEdit={canEditCos(permissions, venue.id)}
      />
    </div>
  );
}
