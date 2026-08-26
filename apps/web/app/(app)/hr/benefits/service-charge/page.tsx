import {
  BenefitRunsHistory,
  type BenefitRunListRow,
} from "@/components/hr/benefit-runs-history";
import { CreateBenefitRunForm } from "@/components/hr/create-benefit-run-form";
import {
  mergeServiceChargeSettings,
  type HrServiceChargeSettings,
} from "@/lib/hr/benefits";
import { canEditBenefits } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import { getHrVenueSetting } from "@/lib/hr/store";
import { HR_SETTINGS_KEYS } from "@/lib/hr/types";

export default async function HrBenefitsServiceChargePage() {
  const { supabase, venue, permissions } = await getHrPageContext();
  const canEdit = canEditBenefits(permissions, venue.id);

  const [settingsRaw, runsResult] = await Promise.all([
    getHrVenueSetting<Partial<HrServiceChargeSettings>>(
      supabase,
      venue.id,
      HR_SETTINGS_KEYS.benefitsServiceCharge,
      {},
    ),
    supabase
      .from("hr_benefit_runs")
      .select(
        "id, benefit_month, period_start, period_end, distribution_date, status, totals",
      )
      .eq("venue_id", venue.id)
      .eq("benefit_kind", "service_charge")
      .order("benefit_month", { ascending: false }),
  ]);

  const settings = mergeServiceChargeSettings(settingsRaw);
  const { data: runs, error } = runsResult;

  const migrationRequired = Boolean(
    error &&
      /hr_benefit_runs|schema cache|does not exist/i.test(error.message),
  );
  if (error && !migrationRequired) {
    console.error("[hr/benefits/service-charge] list runs:", error.message);
  }

  const rows = (runs ?? []) as BenefitRunListRow[];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-lg text-[#3D421F]">Service Charge</h2>
        <p className="text-sm text-black/55">
          Monthly service charge settlement. Half of collections go to staff by
          points × worked days; the other half is held for venue expenses.
          Source amounts come from Sales.
        </p>
      </div>

      {migrationRequired ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">Database migration required</p>
          <p className="mt-1 text-amber-900/80">
            Apply{" "}
            <code className="rounded bg-white/70 px-1">
              supabase/migrations/20260728040000_hr_benefit_runs.sql
            </code>{" "}
            then refresh this page.
          </p>
        </div>
      ) : null}

      <CreateBenefitRunForm
        kind="service_charge"
        canEdit={canEdit && !migrationRequired}
        periodStartDay={settings.periodStartDay}
        periodEndDay={settings.periodEndDay}
      />

      <BenefitRunsHistory
        kind="service_charge"
        rows={rows}
        canEdit={canEdit && !migrationRequired}
      />
    </div>
  );
}
