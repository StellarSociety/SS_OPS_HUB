import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import {
  BenefitRunClient,
  type BenefitAllocationView,
} from "@/components/hr/benefit-run-client";
import { buildExportUserLabel } from "@/lib/exports/user-label";
import {
  loadBenefitWorkedDaysByStaff,
  mergeServiceChargeSettings,
  BENEFITS_WORKED_DAYS_RULE,
  type HrServiceChargeSettings,
} from "@/lib/hr/benefits";
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

export default async function HrBenefitsServiceChargeRunPage({
  params,
}: Props) {
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
    .eq("benefit_kind", "service_charge")
    .maybeSingle();

  if (error) {
    console.error("[hr/benefits/service-charge/run]", error.message);
  }
  if (!run) notFound();

  const settings = mergeServiceChargeSettings(
    (run.settings_snapshot ?? {}) as Partial<HrServiceChargeSettings>,
  );

  const [policyStored, payoutData, deductionList, allocationWorkedDaysByStaff] =
    await Promise.all([
      getHrVenueSetting<Partial<HrServiceChargeSettings>>(
        supabase,
        venue.id,
        HR_SETTINGS_KEYS.benefitsServiceCharge,
        {},
      ),
      loadBenefitPayoutMap(supabase, venue.id),
      listBenefitDeductions(supabase, venue.id),
      loadBenefitWorkedDaysByStaff(
        createServiceClient(),
        venue.id,
        String(run.period_start).slice(0, 10),
        String(run.period_end).slice(0, 10),
        BENEFITS_WORKED_DAYS_RULE,
      ).catch((err) => {
        console.error(
          "[hr/benefits/service-charge/run] allocation worked days",
          err,
        );
        return {} as Record<string, number>;
      }),
    ]);
  const policySettings = mergeServiceChargeSettings(policyStored);

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

  return (
    <BenefitRunClient
      kind="service_charge"
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
      pointTiers={policySettings.pointTiers}
      venueName={venue.name ?? "Venue"}
      venueLogoUrl={getVenueLogoUrl(venue)}
      userDisplayName={userDisplayName}
      payouts={payoutData.payouts}
      rosters={payoutData.rosters}
      deductionEntries={deductionList.rows}
      allocationWorkedDaysByStaff={allocationWorkedDaysByStaff}
    />
  );
}
