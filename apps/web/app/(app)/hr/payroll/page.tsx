import { ModulePageTitle } from "@/components/layout/module-page-title";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { CreatePayrollRunForm } from "@/components/hr/create-payroll-run-form";
import {
  canAccessPayroll,
  canEditPayroll,
  canViewSalary,
} from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import {
  formatPayrollMonthLabel,
  PAYROLL_STATUS_LABELS,
  type PayrollStatus,
} from "@/lib/hr/payroll";
import type { PayrollRunTotals } from "@/lib/hr/payroll";

function formatMoney(
  amount: number | null | undefined,
  show: boolean,
): string {
  if (!show) return "—";
  if (amount == null || Number.isNaN(Number(amount))) return "—";
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

function statusLabel(status: string): string {
  return (
    PAYROLL_STATUS_LABELS[status as PayrollStatus] ??
    status.replace(/_/g, " ")
  );
}

type RunRow = {
  id: string;
  payroll_month: string;
  period_start: string;
  period_end: string;
  payment_date: string | null;
  status: string;
  totals: PayrollRunTotals | Record<string, unknown> | null;
};

export default async function HrPayrollPage() {
  const { supabase, venue, permissions } = await getHrPageContext();

  if (!canAccessPayroll(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Payroll for this venue.
        </p>
      </div>
    );
  }

  const showSalary = canViewSalary(permissions, venue.id);
  const canEdit = canEditPayroll(permissions, venue.id);

  const { data: runs, error } = await supabase
    .from("hr_payroll_runs")
    .select(
      "id, payroll_month, period_start, period_end, payment_date, status, totals",
    )
    .eq("venue_id", venue.id)
    .order("payroll_month", { ascending: false });

  const migrationRequired = Boolean(
    error &&
      /hr_payroll_runs|schema cache|does not exist/i.test(error.message),
  );
  if (error) {
    console.error("[hr/payroll] list runs:", error.message);
  }

  const rows = (runs ?? []) as RunRow[];
  const venueSubtitle = venue.is_global
    ? "Payroll across venues"
    : `${venue.name} payroll`;

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModulePageTitle>Payroll</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">{venueSubtitle}</p>
        <hr className="mt-4 border-black/10" />
      </div>

      {migrationRequired ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">Database migration required</p>
          <p className="mt-1 text-amber-900/80">
            Apply{" "}
            <code className="rounded bg-white/70 px-1">
              supabase/migrations/20260724170000_hr_payroll.sql
            </code>{" "}
            in the Supabase SQL editor (or run{" "}
            <code className="rounded bg-white/70 px-1">
              node scripts/apply-hr-payroll-migration.mjs
            </code>
            ), then refresh this page.
          </p>
        </div>
      ) : null}

      <CreatePayrollRunForm canEdit={canEdit && !migrationRequired} />

      <section className="space-y-3">
        <div>
          <h2 className="font-serif text-lg text-[#3D421F]">Payroll runs</h2>
          <p className="text-sm text-black/55">
            Open a run to review employees, exceptions, adjustments, and
            payments.
          </p>
        </div>

        <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
              <tr>
                <th className="px-3 py-2.5 font-medium">Month</th>
                <th className="px-3 py-2.5 font-medium">Period</th>
                <th className="px-3 py-2.5 font-medium">Payment date</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium text-right">Included</th>
                <th className="px-3 py-2.5 font-medium text-right">Net</th>
                <th className="px-3 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-12 text-center text-sm text-black/45"
                  >
                    No payroll runs yet. Create one for a month above.
                  </td>
                </tr>
              ) : (
                rows.map((run) => {
                  const totals = (run.totals ?? {}) as Partial<PayrollRunTotals>;
                  return (
                    <tr
                      key={run.id}
                      className="hover:bg-[var(--venue-secondary,#F0F3DD)]/25"
                    >
                      <td className="px-3 py-2.5 font-medium text-[#3D421F]">
                        {formatPayrollMonthLabel(run.payroll_month)}
                      </td>
                      <td className="px-3 py-2.5 text-black/60">
                        {run.period_start.slice(0, 10)} →{" "}
                        {run.period_end.slice(0, 10)}
                      </td>
                      <td className="px-3 py-2.5 text-black/60">
                        {run.payment_date?.slice(0, 10) ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex rounded-full border border-black/10 bg-[var(--venue-secondary,#F0F3DD)] px-2.5 py-0.5 text-xs font-medium text-[#3D421F]">
                          {statusLabel(run.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {totals.includedCount ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatMoney(totals.netPayroll, showSalary)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Link
                          href={`/hr/payroll/${run.id}?tab=run`}
                          className="text-sm font-medium text-[var(--venue-primary,#818a40)] underline-offset-2 hover:underline"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
