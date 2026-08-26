import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import {
  BenefitRunClient,
  type BenefitAllocationView,
} from "@/components/hr/benefit-run-client";
import { buildExportUserLabel } from "@/lib/exports/user-label";
import {
  applyStaffOverrides,
  loadBenefitWorkedDaysByStaff,
  loadForecastVenueAsphForMonth,
  loadWaiterGratuityCollectionDaysByStaff,
  mergeGratuitySettings,
  missedGratuityPoolRecipientWarning,
  readStaffOverridesFromSnapshot,
  BENEFITS_WORKED_DAYS_RULE,
  type BenefitContributor,
  type HrGratuitySettings,
} from "@/lib/hr/benefits";
import { loadStaffForBenefits } from "@/lib/hr/benefits/persist-run";
import { listBenefitDeductions, loadBenefitPayoutMap } from "@/lib/hr/benefits/deduction-payouts";
import { canAccessBenefits, canEditBenefits } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import { getHrVenueSetting } from "@/lib/hr/store";
import { HR_SETTINGS_KEYS } from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";
import { getVenueLogoUrl } from "@/lib/venue/branding";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ runId: string }>;
};

export const dynamic = "force-dynamic";

export default async function HrBenefitsGratuityRunPage({ params }: Props) {
  const { runId } = await params;
  const { supabase, venue, permissions, user } = await getHrPageContext();

  if (!canAccessBenefits(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  const canEdit = canEditBenefits(permissions, venue.id);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();
  const userDisplayName = buildExportUserLabel(
    profile?.full_name,
    profile?.email ?? user.email,
  );

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

  const [
    policyStored,
    payoutData,
    deductionList,
    collectionDays,
    allocationWorkedDaysByStaff,
    rosterStaff,
  ] = await Promise.all([
      getHrVenueSetting<Partial<HrGratuitySettings>>(
        supabase,
        venue.id,
        HR_SETTINGS_KEYS.benefitsGratuity,
        {},
      ),
      loadBenefitPayoutMap(supabase, venue.id),
      listBenefitDeductions(supabase, venue.id),
      loadWaiterGratuityCollectionDaysByStaff(
        createServiceClient(),
        venue.id,
        String(run.period_start).slice(0, 10),
        String(run.period_end).slice(0, 10),
      ).catch((err) => {
        console.error("[hr/benefits/gratuity/run] collection days", err);
        return { byStaffId: {}, byNormalizedName: {} };
      }),
      loadBenefitWorkedDaysByStaff(
        createServiceClient(),
        venue.id,
        String(run.period_start).slice(0, 10),
        String(run.period_end).slice(0, 10),
        BENEFITS_WORKED_DAYS_RULE,
      ).catch((err) => {
        console.error("[hr/benefits/gratuity/run] allocation worked days", err);
        return {} as Record<string, number>;
      }),
      loadStaffForBenefits(createServiceClient(), venue.id).catch((err) => {
        console.error("[hr/benefits/gratuity/run] roster staff", err);
        return [];
      }),
    ]);
  const policySettings = mergeGratuitySettings(policyStored);

  const { data: allocationRows } = await supabase
    .from("hr_benefit_allocations")
    .select(
      "id, staff_id, amount, points, worked_days, status, meta, staff:staff_id(full_name, emp_no, photo_url, department_id, position_id, department:departments(name), position:positions(name))",
    )
    .eq("venue_id", venue.id)
    .eq("run_id", runId)
    .order("amount", { ascending: false });

  const allocations: BenefitAllocationView[] = (allocationRows ?? []).map(
    (row) => {
      const staffRaw = row.staff as
        | {
            full_name?: string;
            emp_no?: string;
            photo_url?: string | null;
            department_id?: string | null;
            position_id?: string | null;
            department?: { name?: string } | { name?: string }[] | null;
            position?: { name?: string } | { name?: string }[] | null;
          }
        | Array<{
            full_name?: string;
            emp_no?: string;
            photo_url?: string | null;
            department_id?: string | null;
            position_id?: string | null;
            department?: { name?: string } | { name?: string }[] | null;
            position?: { name?: string } | { name?: string }[] | null;
          }>
        | null;
      const staff = Array.isArray(staffRaw) ? (staffRaw[0] ?? null) : staffRaw;
      const department = staff?.department;
      const position = staff?.position;
      const departmentName = Array.isArray(department)
        ? department[0]?.name
        : department?.name;
      const positionName = Array.isArray(position)
        ? position[0]?.name
        : position?.name;
      return {
        id: row.id as string,
        staff_id: row.staff_id as string,
        full_name: staff?.full_name ?? null,
        emp_no: staff?.emp_no ?? null,
        photo_url: staff?.photo_url ?? null,
        department_id: staff?.department_id ?? null,
        department_name: departmentName ?? null,
        position_id: staff?.position_id ?? null,
        position_name: positionName ?? null,
        amount: Number(row.amount) || 0,
        points: row.points == null ? null : Number(row.points),
        worked_days: row.worked_days == null ? null : Number(row.worked_days),
        status: String(row.status),
        meta: (row.meta ?? null) as Record<string, unknown> | null,
      };
    },
  );

  const storedTotals =
    run.totals && typeof run.totals === "object"
      ? (run.totals as Record<string, unknown>)
      : {};
  const storedWarnings = Array.isArray(storedTotals.warnings)
    ? storedTotals.warnings.filter(
        (w): w is string => typeof w === "string" && w.trim().length > 0,
      )
    : [];
  const contributorIds = (
    (storedTotals.contributors as BenefitContributor[] | undefined) ?? []
  )
    .map((row) => row.staffId)
    .filter((id): id is string => Boolean(id));
  let totalsWarnings = storedWarnings;
  if (!storedWarnings.some((w) => /left off Allocations/i.test(w))) {
    const liveMissed = missedGratuityPoolRecipientWarning({
      staff: applyStaffOverrides(
        rosterStaff,
        readStaffOverridesFromSnapshot(run.settings_snapshot),
      ),
      settings,
      workedDaysFor: (staffId) =>
        Number(allocationWorkedDaysByStaff[staffId]) || 0,
      skipStaffIds: [
        ...allocations.map((row) => row.staff_id),
        ...contributorIds,
      ],
    });
    if (liveMissed) totalsWarnings = [...storedWarnings, liveMissed];
  }

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
        totals: { ...storedTotals, warnings: totalsWarnings },
        notes: run.notes,
      }}
      allocations={allocations}
      disciplinaryOptions={settings.disciplinaryDeductions}
      pointTiers={policySettings.pointTiers}
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
      venueName={venue.name ?? "Venue"}
      venueLogoUrl={getVenueLogoUrl(venue)}
      userDisplayName={userDisplayName}
      payouts={payoutData.payouts}
      rosters={payoutData.rosters}
      deductionEntries={deductionList.rows}
      waiterCollectionDays={collectionDays}
      allocationWorkedDaysByStaff={allocationWorkedDaysByStaff}
      waiveWithheldRetain={snapshot.waiveWithheldRetain === true}
      withheldRetainToPool={snapshot.withheldRetainToPool === true}
    />
  );
}
