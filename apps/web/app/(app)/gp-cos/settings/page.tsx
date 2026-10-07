import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { CosSettingsPanel } from "@/components/sales/cos/cos-settings-panel";
import {
  getCosPageContext,
  canViewCos,
  canEditCosSettings,
} from "@/lib/sales/cos-page-context";
import {
  listVenueCosMonthlyTargets,
  listVenueCosSettings,
} from "@/lib/sales/cos-store";
import { dubaiTodayIso } from "@/lib/hr/benefits/flight-ticket";
import { listLedgerAccountOptions } from "@/lib/sales/cos-purchases-data";
import {
  COST_CENTRES,
  DEFAULT_AUTO_ADJUSTMENT_PCT,
  type VenueCosSettings,
} from "@/lib/sales/cos-types";

export default async function CosSettingsPage() {
  const { venue, permissions, supabase } = await getCosPageContext();
  if (!canViewCos(permissions, venue.id)) return <AccessDeniedBounce />;

  const [stored, ledgerAccounts, monthly] = await Promise.all([
    listVenueCosSettings(supabase, venue.id),
    listLedgerAccountOptions(),
    listVenueCosMonthlyTargets(supabase, venue.id),
  ]);
  const byCentre = new Map<string, VenueCosSettings>();
  for (const s of stored) byCentre.set(s.cost_centre, s);

  const rows = COST_CENTRES.map((centre) => {
    const s = byCentre.get(centre);
    return {
      cost_centre: centre,
      target_cost_pct: s?.target_cost_pct ?? 27,
      purchase_target_gs: s?.purchase_target_gs ?? 0,
      closing_stock_target_gs: s?.closing_stock_target_gs ?? 0,
      auto_adjustment_pct:
        s?.auto_adjustment_pct ?? DEFAULT_AUTO_ADJUSTMENT_PCT[centre],
      ledger_account_ids: s?.ledger_account_ids ?? [],
    };
  });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <ModulePageTitle>GP &amp; COS — Settings</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Targets &amp; automatic adjustments per cost centre — {venue.name}
        </p>
        <hr className="mt-4 border-black/10" />
      </div>
      <CosSettingsPanel
        rows={rows}
        ledgerAccounts={ledgerAccounts}
        monthly={monthly}
        currentYear={Number(dubaiTodayIso().slice(0, 4))}
        canEdit={canEditCosSettings(permissions, venue.id)}
      />
    </div>
  );
}
