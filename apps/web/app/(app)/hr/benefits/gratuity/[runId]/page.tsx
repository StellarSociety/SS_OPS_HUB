import {
  BenefitRunClient,
  type BenefitAllocationView,
} from "@/components/hr/benefit-run-client";
import {
  loadForecastVenueAsphForMonth,
  mergeGratuitySettings,
  type HrGratuitySettings,
} from "@/lib/hr/benefits";
import { canAccessBenefits, canEditBenefits } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import { getHrVenueSetting } from "@/lib/hr/store";
import { HR_SETTINGS_KEYS } from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ runId: string }>;
};

export const dynamic = "force-dynamic";

export default async function HrBenefitsGratuityRunPage({ params }: Props) {
  const { runId } = await params;
  const { supabase, venue, permissions } = await getHrPageContext();

  if (!canAccessBenefits(permissions, venue.id)) {
    return (
      <p className="text-sm text-black/60">
        You do not have access to Benefits for this venue.
      </p>
    );
  }

  const canEdit = canEditBenefits(permissions, venue.id);

  const { data: run, error } = await supabase
    .from("hr_benefit_runs")
    .select(
      "id, benefit_kind, benefit_month, period_start, period_end, distribution_date, status, totals, notes, settings_snapshot",
    )
    .eq("venue_id", venue.id)
    .eq("id", runId)
    .eq("benefit_kind", "gratuity")
    .maybeSingle();

  if (error) {
    console.error("[hr/benefits/gratuity/run]", error.message);
  }
  if (!run) notFound();

  const settings = mergeGratuitySettings(
    (run.settings_snapshot ?? {}) as Partial<HrGratuitySettings>,
  );
  const snapshot =
    (run.settings_snapshot as Record<string, unknown> | null) ?? {};
  const forecastAsph =
    typeof snapshot.forecastAsphKpiThreshold === "number"
      ? Number(snapshot.forecastAsphKpiThreshold)
      : await loadForecastVenueAsphForMonth(
          createServiceClient(),
          venue.id,
          String(run.benefit_month),
        );
  const asphKpiThreshold =
    typeof snapshot.asphKpiThreshold === "number"
      ? Number(snapshot.asphKpiThreshold)
      : snapshot.asphKpiThreshold === null
        ? null
        : forecastAsph;

  const policyStored = await getHrVenueSetting<Partial<HrGratuitySettings>>(
    supabase,
    venue.id,
    HR_SETTINGS_KEYS.benefitsGratuity,
    {},
  );
  const policySettings = mergeGratuitySettings(policyStored);

  const { data: allocationRows } = await supabase
    .from("hr_benefit_allocations")
    .select(
      "id, staff_id, amount, points, worked_days, status, meta, staff:staff_id(full_name, emp_no, department:departments(name), position:positions(name))",
    )
    .eq("venue_id", venue.id)
    .eq("run_id", runId)
    .order("amount", { ascending: false });

  const allocations: BenefitAllocationView[] = (allocationRows ?? []).map(
    (row) => {
      const staff = row.staff as
        | {
            full_name?: string;
            emp_no?: string;
            department?: { name?: string } | null;
            position?: { name?: string } | null;
          }
        | null;
      return {
        id: row.id as string,
        staff_id: row.staff_id as string,
        full_name: staff?.full_name ?? null,
        emp_no: staff?.emp_no ?? null,
        department_name: staff?.department?.name ?? null,
        position_name: staff?.position?.name ?? null,
        amount: Number(row.amount) || 0,
        points: row.points == null ? null : Number(row.points),
        worked_days: row.worked_days == null ? null : Number(row.worked_days),
        status: String(row.status),
        meta: (row.meta ?? null) as Record<string, unknown> | null,
      };
    },
  );

  return (
    <BenefitRunClient
      kind="gratuity"
      canEdit={canEdit}
      run={{
        id: run.id,
        benefit_month: run.benefit_month,
        period_start: run.period_start,
        period_end: run.period_end,
        distribution_date: run.distribution_date,
        status: run.status,
        totals: run.totals,
        notes: run.notes,
      }}
      allocations={allocations}
      disciplinaryOptions={settings.disciplinaryDeductions}
      departmentOrder={settings.departmentShares.map((d) => ({
        key: d.key,
        label: d.label,
        percent: d.percent,
      }))}
      policyDepartmentPercents={Object.fromEntries(
        policySettings.departmentShares.map((d) => [
          d.key,
          Number(d.percent) || 0,
        ]),
      )}
      poolContributionRule={{
        waiterCashPoolPercent: settings.waiterCashPoolPercent,
        waiterCcTipOutMode: settings.waiterCcTipOutMode,
        waiterCcCollectionTipOutPercent:
          settings.waiterCcCollectionTipOutPercent,
        waiterCcTipOutPctWhenKpiMet: settings.waiterCcTipOutPctWhenKpiMet,
        waiterCcTipOutPctWhenKpiMissed: settings.waiterCcTipOutPctWhenKpiMissed,
        asphKpiEnabled: settings.asphKpiEnabled,
        barCcPoolPercent: settings.barCcPoolPercent,
        barCcBarStaffPercent: settings.barCcBarStaffPercent,
        barCashEqualSplit: settings.barCashEqualSplit,
      }}
      poolDeductionRule={{
        osePercent: settings.poolOseDeductPercent,
        activitiesPercent: settings.poolStaffActivitiesDeductPercent,
        runnerHousekeeperPercent: settings.runnerHousekeeperDeductPercent,
      }}
      policyDeductionPercents={{
        osePercent: policySettings.poolOseDeductPercent,
        activitiesPercent: policySettings.poolStaffActivitiesDeductPercent,
        runnerHousekeeperPercent:
          policySettings.runnerHousekeeperDeductPercent,
      }}
      departmentAllocationMode={
        (() => {
          const mode = (
            run.settings_snapshot as {
              departmentAllocationMode?: string;
            } | null
          )?.departmentAllocationMode;
          if (mode === "equal_point_value" || mode === "bypass_department") {
            return mode;
          }
          return "fixed_percent";
        })()
      }
      asphKpiThreshold={asphKpiThreshold}
      forecastAsphKpiThreshold={forecastAsph}
    />
  );
}
