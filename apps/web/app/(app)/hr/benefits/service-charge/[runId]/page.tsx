import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import {
  BenefitRunClient,
  type BenefitAllocationView,
} from "@/components/hr/benefit-run-client";
import { buildExportUserLabel } from "@/lib/exports/user-label";
import {
  mergeServiceChargeSettings,
  type HrServiceChargeSettings,
} from "@/lib/hr/benefits";
import { canAccessBenefits, canEditBenefits } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
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

  const { data: allocationRows } = await supabase
    .from("hr_benefit_allocations")
    .select(
      "id, staff_id, amount, points, worked_days, status, meta, staff:staff_id(full_name, emp_no, photo_url, department:departments(name), position:positions(name))",
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
            photo_url?: string | null;
            department?: { name?: string } | null;
            position?: { name?: string } | null;
          }
        | null;
      return {
        id: row.id as string,
        staff_id: row.staff_id as string,
        full_name: staff?.full_name ?? null,
        emp_no: staff?.emp_no ?? null,
        photo_url: staff?.photo_url ?? null,
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
      venueName={venue.name ?? "Venue"}
      venueLogoUrl={getVenueLogoUrl(venue)}
      userDisplayName={userDisplayName}
    />
  );
}
