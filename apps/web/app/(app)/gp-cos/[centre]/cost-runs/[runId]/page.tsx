import { notFound } from "next/navigation";
import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { CostRunEntryForm } from "@/components/sales/cos/cost-run-entry-form";
import {
  getCosPageContext,
  canViewCos,
  canEditCos,
} from "@/lib/sales/cos-page-context";
import {
  getVenueCosRun,
  getVenueCosSettings,
  listVenueCosRuns,
} from "@/lib/sales/cos-store";
import {
  COST_CENTRES,
  COST_CENTRE_LABELS,
  type CostCentre,
} from "@/lib/sales/cos-types";

function isCostCentre(v: string): v is CostCentre {
  return (COST_CENTRES as readonly string[]).includes(v);
}

// Retail week 1 start dates (Monday-based), matching the COS spreadsheet Dates sheet.
const YEAR_WK1: Record<number, string> = {
  2025: "2024-12-30",
  2026: "2025-12-29",
  2027: "2026-12-28",
};

function weekDates(year: number, weekNo: number): { start: string; end: string } {
  const base = YEAR_WK1[year] ?? `${year}-01-01`;
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (weekNo - 1) * 7);
  const start = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  const end = d.toISOString().slice(0, 10);
  return { start, end };
}

export default async function CostRunEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ centre: string; runId: string }>;
  searchParams: Promise<{ year?: string; week?: string }>;
}) {
  const { centre, runId } = await params;
  if (!isCostCentre(centre)) notFound();

  const { venue, permissions, supabase } = await getCosPageContext();
  if (!canViewCos(permissions, venue.id)) return <AccessDeniedBounce />;
  const editable = canEditCos(permissions, venue.id);

  const sp = await searchParams;
  const isNew = runId === "new";
  const fiscalYear = Number(sp.year) || new Date().getFullYear();
  const label = COST_CENTRE_LABELS[centre];

  const [settings, existing, allRuns] = await Promise.all([
    getVenueCosSettings(supabase, venue.id, centre),
    isNew ? Promise.resolve(null) : getVenueCosRun(supabase, venue.id, runId),
    listVenueCosRuns(supabase, venue.id, centre, fiscalYear),
  ]);

  if (!isNew && !existing) notFound();

  // Determine the week for a new entry: ?week= or the next empty week.
  let weekNo = existing?.week_no ?? (Number(sp.week) || 0);
  if (isNew && !weekNo) {
    const used = new Set(allRuns.map((r) => r.week_no));
    weekNo = 1;
    while (used.has(weekNo) && weekNo < 52) weekNo += 1;
  }

  const { start, end } = weekDates(fiscalYear, weekNo);

  // Opening stock default = previous week's closing stock.
  const prevRun = allRuns.find((r) => r.week_no === weekNo - 1);
  const defaultOpening = existing?.opening_stock_gs ?? (prevRun?.closing_stock_gs ?? 0);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <ModulePageTitle>
          {label} — {isNew ? "New Cost Run" : `Week ${weekNo}`}
        </ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          {venue.name} · {fiscalYear} · Week {weekNo}
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      <CostRunEntryForm
        costCentre={centre}
        fiscalYear={fiscalYear}
        weekNo={weekNo}
        weekStart={start}
        weekEnd={end}
        existing={existing}
        defaultOpeningStock={defaultOpening}
        targetCostPct={settings?.target_cost_pct ?? 27}
        purchaseTargetGs={settings?.purchase_target_gs ?? 0}
        closingStockTargetGs={settings?.closing_stock_target_gs ?? 0}
        autoAdjustmentPct={settings?.auto_adjustment_pct ?? 0}
        approverUserId={settings?.approver_user_id ?? null}
        canEdit={editable}
      />
    </div>
  );
}
