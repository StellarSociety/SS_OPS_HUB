import { Gift } from "lucide-react";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import {
  canAccessPayroll,
  canAccessStaff,
} from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";

type BenefitRow = {
  id: string;
  period_start: string;
  period_end: string;
  benefit_type: string;
  points: number | null;
  amount: number;
  status: string;
  staff_id: string;
};

export default async function HrBenefitsPage() {
  const { supabase, venue, permissions } = await getHrPageContext();

  if (
    !canAccessPayroll(permissions, venue.id) &&
    !canAccessStaff(permissions, venue.id)
  ) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Benefits for this venue.
        </p>
      </div>
    );
  }

  const { data, error } = await supabase
    .from("hr_benefit_allocations")
    .select(
      "id, period_start, period_end, benefit_type, points, amount, status, staff_id",
    )
    .eq("venue_id", venue.id)
    .order("period_start", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[hr/benefits] list:", error.message);
  }

  const rows = (data ?? []) as BenefitRow[];
  const venueSubtitle = venue.is_global
    ? "Benefits across venues"
    : `${venue.name} benefits`;

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModulePageTitle>Benefits</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">{venueSubtitle}</p>
        <hr className="mt-4 border-black/10" />
      </div>

      <div className="rounded-xl border border-dashed border-[#d8d9c8] bg-white/40 px-6 py-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <Gift
            className="h-8 w-8 text-[var(--venue-primary,#818a40)]"
            strokeWidth={1.5}
            aria-hidden
          />
          <div className="max-w-md space-y-1">
            <p className="font-serif text-lg text-[#3D421F]">
              Tips, service charge &amp; points
            </p>
            <p className="text-sm text-muted-foreground">
              Allocation rules and period settlements for tips, service charge,
              and points will land here. For now this page lists any stored
              benefit allocations.
            </p>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="font-serif text-lg text-[#3D421F]">Allocations</h2>
        <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
              <tr>
                <th className="px-3 py-2.5 font-medium">Period</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 font-medium text-right">Points</th>
                <th className="px-3 py-2.5 font-medium text-right">Amount</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-12 text-center text-sm text-black/45"
                  >
                    No benefit allocations yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2.5 text-black/70">
                      {row.period_start.slice(0, 10)} →{" "}
                      {row.period_end.slice(0, 10)}
                    </td>
                    <td className="px-3 py-2.5 capitalize">
                      {row.benefit_type.replace(/_/g, " ")}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {row.points ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {Number(row.amount).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 capitalize text-black/60">
                      {row.status.replace(/_/g, " ")}
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
