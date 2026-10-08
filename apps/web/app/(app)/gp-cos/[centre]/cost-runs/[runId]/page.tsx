import { notFound } from "next/navigation";
import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { CostRunEntryForm } from "@/components/sales/cos/cost-run-entry-form";
import {
  getCosPageContext,
  canViewCos,
  canEditCos,
} from "@/lib/sales/cos-page-context";
import { getCosLedgerPurchasesNet } from "@/lib/sales/cos-purchases-data";
import { monthIndexForWeek } from "@/lib/sales/cos-calculations";
import { createServiceClient } from "@/lib/supabase/service";
import { isAppAdmin } from "@/lib/role-permissions";
import {
  listCosAdjustmentKinds,
  listCosTransfers,
  listVenueCosMonthlyTargets,
  resolveCosTargets,
  getVenueCosRun,
  getVenueCosSettings,
  listVenueCosRuns,
} from "@/lib/sales/cos-store";
import {
  COST_CENTRES,
  COST_CENTRE_LABELS,
  DEFAULT_AUTO_ADJUSTMENT_PCT,
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

  const { venue, permissions, supabase, user } = await getCosPageContext();
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

  // Targets for this run's month (monthly override, else centre default).
  const monthIndex = monthIndexForWeek(weekNo);
  const monthlyTargets = await listVenueCosMonthlyTargets(supabase, venue.id, {
    costCentre: centre,
    fiscalYear,
  });
  const targets = resolveCosTargets(
    settings,
    monthlyTargets.find((t) => t.month_index === monthIndex),
  );

  // Adjustment kinds (dropdown) and this week's transfers for the centre.
  const [kinds, weekTransfers] = await Promise.all([
    listCosAdjustmentKinds(supabase, venue.id),
    listCosTransfers(supabase, venue.id, { from: start, to: end }),
  ]);
  const activeKinds = kinds.filter((k) => k.active);
  const ledgerIdsForKinds = activeKinds
    .map((k) => k.ledger_account_id)
    .filter((id): id is string => Boolean(id));
  const ledgerCodeById = new Map<string, string>();
  if (ledgerIdsForKinds.length > 0) {
    const { data } = await createServiceClient()
      .from("accounts")
      .select("id, code")
      .in("id", ledgerIdsForKinds);
    for (const a of data ?? []) ledgerCodeById.set(a.id as string, String(a.code));
  }
  const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const transferAdjustments = weekTransfers
    .filter((t) => t.to_centre === centre || t.from_centre === centre)
    .map((t) =>
      t.to_centre === centre
        ? {
            reason: `Transfer in from ${COST_CENTRE_LABELS[t.from_centre]} (${ddmm(t.transfer_date)})${t.note ? ` — ${t.note}` : ""}`,
            amount_gs: t.amount_net,
          }
        : {
            reason: `Transfer out to ${COST_CENTRE_LABELS[t.to_centre]} (${ddmm(t.transfer_date)})${t.note ? ` — ${t.note}` : ""}`,
            amount_gs: -t.amount_net,
          },
    );

  // Accounts-app purchases on this centre's linked ledgers for the week.
  const ledgerIds = settings?.ledger_account_ids ?? [];
  let accountsPurchasesNet: number | null = null;
  try {
    accountsPurchasesNet = await getCosLedgerPurchasesNet(
      venue.id,
      ledgerIds,
      start,
      end,
    );
  } catch (error) {
    console.error("[gp-cos/cost-run] accounts purchases:", error);
  }

  // Opening stock default = previous week's closing stock.
  const prevRun = allRuns.find((r) => r.week_no === weekNo - 1);
  const defaultOpening = existing?.opening_stock_gs ?? (prevRun?.closing_stock_gs ?? 0);

  return (
    <div className="mx-auto w-[clamp(min(100%,1100px),83.333%,100%)] space-y-6">
      {/*
        2.5/3 of the page on wide screens; never narrower than the form needs
        (1100px) so side space shrinks first; full width on small windows.
      */}
      <div>
        <ModulePageTitle>
          {label} — {isNew ? "New Cost Run" : `Week ${weekNo}`}
        </ModulePageTitle>
      </div>

      <CostRunEntryForm
        costCentre={centre}
        fiscalYear={fiscalYear}
        weekNo={weekNo}
        weekStart={start}
        weekEnd={end}
        existing={existing}
        defaultOpeningStock={defaultOpening}
        targetCostPct={targets.targetCostPct}
        purchaseTargetGs={targets.purchaseTargetGs}
        closingStockTargetGs={targets.closingStockTargetGs}
        autoAdjustmentPct={
          settings?.auto_adjustment_pct ?? DEFAULT_AUTO_ADJUSTMENT_PCT[centre]
        }
        approverUserId={settings?.approver_user_id ?? null}
        canEdit={editable}
        ledgerLinked={ledgerIds.length > 0}
        accountsPurchasesNet={accountsPurchasesNet}
        adjustmentKinds={activeKinds.map((k) => ({
          name: k.name,
          ledgerCode: k.ledger_account_id
            ? (ledgerCodeById.get(k.ledger_account_id) ?? "")
            : "",
          side: k.default_side,
        }))}
        transferAdjustments={transferAdjustments}
        canApprove={
          editable &&
          ((settings?.approver_user_ids ?? []).length === 0 ||
            (settings?.approver_user_ids ?? []).includes(user.id) ||
            isAppAdmin(permissions))
        }
      />
    </div>
  );
}
