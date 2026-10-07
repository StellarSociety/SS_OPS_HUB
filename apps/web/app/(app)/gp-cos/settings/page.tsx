import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { CosSettingsPanel } from "@/components/sales/cos/cos-settings-panel";
import {
  getCosPageContext,
  canViewCos,
  canEditCosSettings,
} from "@/lib/sales/cos-page-context";
import { listVenueCosSettings } from "@/lib/sales/cos-store";
import { COST_CENTRES, type VenueCosSettings } from "@/lib/sales/cos-types";

export default async function CosSettingsPage() {
  const { venue, permissions, supabase } = await getCosPageContext();
  if (!canViewCos(permissions, venue.id)) return <AccessDeniedBounce />;

  const stored = await listVenueCosSettings(supabase, venue.id);
  const byCentre = new Map<string, VenueCosSettings>();
  for (const s of stored) byCentre.set(s.cost_centre, s);

  const rows = COST_CENTRES.map((centre) => {
    const s = byCentre.get(centre);
    return {
      cost_centre: centre,
      target_cost_pct: s?.target_cost_pct ?? 27,
      purchase_target_gs: s?.purchase_target_gs ?? 0,
      closing_stock_target_gs: s?.closing_stock_target_gs ?? 0,
      auto_adjustment_pct: s?.auto_adjustment_pct ?? (centre === "other" ? 30 : 0),
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
        canEdit={canEditCosSettings(permissions, venue.id)}
      />
    </div>
  );
}
