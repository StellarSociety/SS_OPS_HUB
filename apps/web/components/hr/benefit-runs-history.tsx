"use client";

import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { BenefitReopenControl } from "@/components/hr/benefit-reopen-control";
import {
  BENEFIT_RUN_STATUS_LABELS,
  canReopenBenefitRun,
  formatBenefitMonthLabel,
  isBenefitRunLocked,
  type BenefitKind,
  type BenefitRunStatus,
  type BenefitRunTotals,
} from "@/lib/hr/benefits";

function formatMoney(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(Number(amount))) return "—";
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function asAmount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Bar + waiter cash + waiter CC. Falls back to stored totalTips. */
function totalTipsOf(
  totals: Partial<BenefitRunTotals> & Record<string, unknown>,
): number | null {
  const stored = Number(totals.totalTips);
  const waiterCash = totals.waiterCashCollected;
  const waiterCc = totals.waiterCcCollected;
  const barCash = totals.barCashCollected;
  const barCc = totals.barCcCollected;
  if (
    waiterCash == null &&
    waiterCc == null &&
    barCash == null &&
    barCc == null
  ) {
    return Number.isFinite(stored) ? stored : null;
  }
  return round2(
    asAmount(waiterCash) +
      asAmount(waiterCc) +
      asAmount(barCash) +
      asAmount(barCc),
  );
}

/** Paid after the AED 5 floor and benefit deductions — same as Total distributed. */
function paidDistributedOf(
  totals: Partial<BenefitRunTotals> & Record<string, unknown>,
): number | null {
  const storedPaid = Number(totals.totalDistributedPaid);
  if (Number.isFinite(storedPaid)) return storedPaid;
  const exact = Number(totals.totalDistributed);
  if (!Number.isFinite(exact)) return null;
  const pool = totals.pool as { roundingCollected?: unknown } | undefined;
  const rounding = asAmount(pool?.roundingCollected);
  return round2(Math.max(0, exact - rounding));
}

/** OS&E + activities + rounding + withheld retain + deducted — Collections total. */
function collectionsTotalOf(
  totals: Partial<BenefitRunTotals> & Record<string, unknown>,
): number | null {
  const stored = Number(totals.collectionsTotal);
  if (Number.isFinite(stored)) return stored;
  const pool = (totals.pool ?? {}) as Record<string, unknown>;
  const parts = [
    pool.ose,
    pool.activities,
    pool.roundingCollected,
    pool.withheldRetain,
    pool.benefitDeductions,
  ];
  if (parts.every((n) => n == null)) return null;
  return round2(parts.reduce<number>((sum, n) => sum + asAmount(n), 0));
}

function statusLabel(status: string): string {
  return (
    BENEFIT_RUN_STATUS_LABELS[status as BenefitRunStatus] ??
    status.replace(/_/g, " ")
  );
}

export type BenefitRunListRow = {
  id: string;
  benefit_month: string;
  period_start: string;
  period_end: string;
  distribution_date: string | null;
  status: string;
  totals: BenefitRunTotals | Record<string, unknown> | null;
};

const KIND_COPY: Record<
  BenefitKind,
  { title: string; empty: string; hrefBase: string }
> = {
  gratuity: {
    title: "Gratuity runs",
    empty: "No gratuity runs yet. Create one for a tips month above.",
    hrefBase: "/hr/benefits/gratuity",
  },
  service_charge: {
    title: "Service charge runs",
    empty: "No service charge runs yet. Create one for a month above.",
    hrefBase: "/hr/benefits/service-charge",
  },
};

export function BenefitRunsHistory({
  kind,
  rows,
  canEdit = false,
}: {
  kind: BenefitKind;
  rows: BenefitRunListRow[];
  canEdit?: boolean;
}) {
  const copy = KIND_COPY[kind];

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-serif text-lg text-[#3D421F]">{copy.title}</h2>
        <p className="text-sm text-black/55">
          Open a run to review pool totals, staff allocations, and distribution.
          After it is sent to payroll, view it or reopen to apply alterations.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
            <tr>
              <th className="px-3 py-2.5 font-medium">Month</th>
              <th className="px-3 py-2.5 font-medium">Period</th>
              <th className="px-3 py-2.5 font-medium">Distribution</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium text-right">Recipients</th>
              {kind === "gratuity" ? (
                <th className="px-3 py-2.5 font-medium text-right">
                  Total tips
                </th>
              ) : null}
              {kind === "gratuity" ? (
                <th className="px-3 py-2.5 font-medium text-right">
                  Collections
                </th>
              ) : null}
              <th className="px-3 py-2.5 font-medium text-right">Distributed</th>
              <th className="px-3 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={kind === "gratuity" ? 9 : 7}
                  className="px-3 py-12 text-center text-sm text-black/45"
                >
                  {copy.empty}
                </td>
              </tr>
            ) : (
              rows.map((run) => {
                const totals = (run.totals ?? {}) as Partial<BenefitRunTotals> &
                  Record<string, unknown>;
                const totalTips = totalTipsOf(totals);
                const collectionsTotal = collectionsTotalOf(totals);
                const paidDistributed = paidDistributedOf(totals);
                return (
                  <tr
                    key={run.id}
                    className="hover:bg-[var(--venue-secondary,#F0F3DD)]/25"
                  >
                    <td className="px-3 py-2.5 font-medium text-[#3D421F]">
                      {formatBenefitMonthLabel(run.benefit_month)}
                    </td>
                    <td className="px-3 py-2.5 text-black/60">
                      {run.period_start.slice(0, 10)} →{" "}
                      {run.period_end.slice(0, 10)}
                    </td>
                    <td className="px-3 py-2.5 text-black/60">
                      {run.distribution_date?.slice(0, 10) ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex rounded-full border border-black/10 bg-[var(--venue-secondary,#F0F3DD)] px-2.5 py-0.5 text-xs font-medium text-[#3D421F]">
                        {statusLabel(run.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {totals.recipientCount ?? "—"}
                    </td>
                    {kind === "gratuity" ? (
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatMoney(totalTips)}
                      </td>
                    ) : null}
                    {kind === "gratuity" ? (
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatMoney(collectionsTotal)}
                      </td>
                    ) : null}
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatMoney(paidDistributed ?? totals.totalDistributed)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                        <Link
                          href={`${copy.hrefBase}/${run.id}`}
                          className="text-sm font-medium text-[var(--venue-primary,#818a40)] underline-offset-2 hover:underline"
                        >
                          {isBenefitRunLocked(run.status) ? "View" : "Open"}
                        </Link>
                        {canEdit && canReopenBenefitRun(run.status) ? (
                          <BenefitReopenControl
                            kind={kind}
                            runId={run.id}
                            appliedToPayroll={run.status === "applied_to_payroll"}
                            appearance="link"
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
