import { ModulePageTitle } from "@/components/layout/module-page-title";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { PayslipDownloadButton } from "@/components/hr/payslip-download-button";
import { listPayslipsForVenue } from "@/lib/actions/hr-payroll";
import { canViewPayslips } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import { formatPayrollMonthLabel } from "@/lib/hr/payroll";

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
            Generated payslip versions by payroll month and employee. PDF
            download uses the stored snapshot for each version.
          </p>
        </div>

        {loadError ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900/80">
            {loadError}
          </p>
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
              <tr>
                <th className="px-3 py-2.5 font-medium">Month</th>
                <th className="px-3 py-2.5 font-medium">Employee</th>
                <th className="px-3 py-2.5 font-medium text-right">Version</th>
                <th className="px-3 py-2.5 font-medium">Email</th>
                <th className="px-3 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {payslips.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-12 text-center text-sm text-black/45"
                  >
                    No payslips yet. Generate them from a payroll run.
                  </td>
                </tr>
              ) : (
                payslips.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2.5 text-[#3D421F]">
                      {row.payroll_month
                        ? formatPayrollMonthLabel(row.payroll_month)
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {row.emp_no
                        ? `${row.emp_no} — ${row.full_name ?? ""}`
                        : (row.full_name ?? "—")}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      v{row.version}
                    </td>
                    <td className="px-3 py-2.5 capitalize text-black/60">
                      {row.email_status.replace(/_/g, " ")}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="inline-flex items-center gap-3">
                        <PayslipDownloadButton payslipId={row.id} />
                        <Link
                          href={`/hr/payroll/${row.run_id}?tab=run`}
                          className="text-sm font-medium text-black/55 underline-offset-2 hover:underline"
                        >
                          Run
                        </Link>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
