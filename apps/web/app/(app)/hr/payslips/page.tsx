import { ModulePageTitle } from "@/components/layout/module-page-title";
import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { PayslipsHistoryClient } from "@/components/hr/payslips-history-client";
import { listPayslipsForVenue } from "@/lib/actions/hr-payroll";
import { canEditPayroll, canViewPayslips } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import { mergePayrollSettings } from "@/lib/hr/payroll";
import { getHrVenueSetting } from "@/lib/hr/store";
import { HR_SETTINGS_KEYS } from "@/lib/hr/types";

export default async function HrPayslipsPage() {
  const { supabase, venue, permissions } = await getHrPageContext();

  if (!canViewPayslips(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  const canGenerate = canEditPayroll(permissions, venue.id);

  let payslips: Awaited<ReturnType<typeof listPayslipsForVenue>> = [];
  let loadError: string | null = null;
  try {
    payslips = await listPayslipsForVenue();
  } catch (err) {
    loadError =
      err instanceof Error ? err.message : "Could not load payslips yet.";
  }

  const [payrollSettingsRaw, runsResult] = await Promise.all([
    getHrVenueSetting(supabase, venue.id, HR_SETTINGS_KEYS.payroll, {}),
    canGenerate
      ? supabase
          .from("hr_payroll_runs")
          .select("id, payroll_month, status")
          .eq("venue_id", venue.id)
          .order("payroll_month", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; payroll_month: string; status: string }[], error: null }),
  ]);

  const payrollSettings = mergePayrollSettings(payrollSettingsRaw);
  if (runsResult.error) {
    console.error("[hr/payslips] list runs:", runsResult.error.message);
  }
  const runs = (runsResult.data ?? []).map((row) => ({
    id: row.id as string,
    payroll_month: row.payroll_month as string,
    status: row.status as string,
  }));

  const venueSubtitle = venue.is_global
    ? "Payslips across venues"
    : `${venue.name} payslips`;

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModulePageTitle>Payslips</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">{venueSubtitle}</p>
        <hr className="mt-4 border-black/10" />
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="font-serif text-lg text-[#3D421F]">
            Reports &amp; history
          </h2>
          <p className="text-sm text-black/55">
            Find generated payslip versions by employee, department, or payroll
            month. PDF download uses the stored snapshot for each version.
          </p>
        </div>

        {loadError ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900/80">
            {loadError}
          </p>
        ) : (
          <PayslipsHistoryClient
            payslips={payslips}
            runs={runs}
            canGenerate={canGenerate}
            periodStartDay={payrollSettings.periodStartDay}
            periodEndDay={payrollSettings.periodEndDay}
          />
        )}
      </section>
    </div>
  );
}
