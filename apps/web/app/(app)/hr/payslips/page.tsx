import { ModulePageTitle } from "@/components/layout/module-page-title";
import { PayslipsHistoryClient } from "@/components/hr/payslips-history-client";
import { listPayslipsForVenue } from "@/lib/actions/hr-payroll";
import { canViewPayslips } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";

export default async function HrPayslipsPage() {
  const { venue, permissions } = await getHrPageContext();

  if (!canViewPayslips(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Payslips for this venue.
        </p>
      </div>
    );
  }

  let payslips: Awaited<ReturnType<typeof listPayslipsForVenue>> = [];
  let loadError: string | null = null;
  try {
    payslips = await listPayslipsForVenue();
  } catch (err) {
    loadError =
      err instanceof Error ? err.message : "Could not load payslips yet.";
  }

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
          <PayslipsHistoryClient payslips={payslips} />
        )}
      </section>
    </div>
  );
}
