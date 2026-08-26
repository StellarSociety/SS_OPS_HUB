"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Download } from "lucide-react";
import { BenefitPoolCollectionsExportDialog } from "@/components/hr/benefit-pool-collections-export-dialog";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { PayrollMonthPicker } from "@/components/hr/payroll-month-picker";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { Button } from "@/components/ui/button";
import {
  deleteBenefitPoolCollections,
  saveBenefitPoolCollections,
} from "@/lib/actions/hr-benefits";
import {
  BENEFIT_RUN_STATUS_LABELS,
  formatBenefitMonthLabel,
  isBenefitRunLocked,
  suggestedPoolCollectionsFromGratuityRun,
  type BenefitPoolCollectionsRow,
  type BenefitRunStatus,
  type GratuityRunPoolHint,
} from "@/lib/hr/benefits";
import { buildPoolCollectionsExportMonths } from "@/lib/hr/benefits/pool-collections-export";
import { toScopedHref } from "@/lib/venue/scope-routing";

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function defaultMonthKey(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthKeyFromDate(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** Prefer the live gratuity-run total when the saved collections row is still 0. */
function deductedAmountFromSources(
  stored: number | null | undefined,
  suggested: number | null | undefined,
): string {
  if (suggested != null && !(Number(stored) > 0)) {
    return String(suggested);
  }
  if (stored != null) return String(stored);
  if (suggested != null) return String(suggested);
  return "";
}

function initialAmountsForMonth(
  monthKey: string,
  rows: BenefitPoolCollectionsRow[],
  gratuityRunByMonth: Record<string, GratuityRunPoolHint>,
  osePercent: number,
  activitiesPercent: number,
  autoFillFromGratuity: boolean,
): {
  ose: string;
  activities: string;
  rounding: string;
  withheldRetain: string;
  deducted: string;
  notes: string;
} {
  const existing = rows.find(
    (row) => monthKeyFromDate(row.benefit_month) === monthKey,
  );
  const hint = gratuityRunByMonth[monthKey];
  const suggested = hint
    ? suggestedPoolCollectionsFromGratuityRun(
        hint,
        osePercent,
        activitiesPercent,
      )
    : null;

  if (existing) {
    return {
      ose: String(existing.ose_amount),
      activities: String(existing.staff_activities_amount),
      rounding: String(existing.rounding_amount ?? 0),
      withheldRetain: String(existing.withheld_retain_amount ?? 0),
      deducted: deductedAmountFromSources(
        existing.benefit_deduction_amount,
        suggested?.benefitDeductionAmount,
      ),
      notes: existing.notes ?? "",
    };
  }

  if (autoFillFromGratuity && suggested) {
    return {
      ose: String(suggested.oseAmount),
      activities: String(suggested.staffActivitiesAmount),
      rounding:
        suggested.roundingAmount == null ? "" : String(suggested.roundingAmount),
      withheldRetain:
        suggested.withheldRetainAmount == null
          ? ""
          : String(suggested.withheldRetainAmount),
      deducted: deductedAmountFromSources(
        null,
        suggested.benefitDeductionAmount,
      ),
      notes: "",
    };
  }

  return {
    ose: "",
    activities: "",
    rounding: "",
    withheldRetain: "",
    deducted: "",
    notes: "",
  };
}

type BenefitPoolCollectionsPanelProps = {
  canEdit: boolean;
  rows: BenefitPoolCollectionsRow[];
  gratuityRunByMonth: Record<string, GratuityRunPoolHint>;
  osePercent: number;
  activitiesPercent: number;
  periodStartDay: number;
  periodEndDay: number;
  venueName: string;
  venueLogoUrl?: string | null;
  userDisplayName: string;
};

export function BenefitPoolCollectionsPanel({
  canEdit,
  rows,
  gratuityRunByMonth,
  osePercent,
  activitiesPercent,
  periodStartDay,
  periodEndDay,
  venueName,
  venueLogoUrl,
  userDisplayName,
}: BenefitPoolCollectionsPanelProps) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();
  const [month, setMonth] = useState(defaultMonthKey);
  const initialAmounts = initialAmountsForMonth(
    defaultMonthKey(),
    rows,
    gratuityRunByMonth,
    osePercent,
    activitiesPercent,
    true,
  );
  const [oseAmount, setOseAmount] = useState(initialAmounts.ose);
  const [activitiesAmount, setActivitiesAmount] = useState(
    initialAmounts.activities,
  );
  const [roundingAmount, setRoundingAmount] = useState(initialAmounts.rounding);
  const [withheldRetainAmount, setWithheldRetainAmount] = useState(
    initialAmounts.withheldRetain,
  );
  const [deductedAmount, setDeductedAmount] = useState(initialAmounts.deducted);
  const [notes, setNotes] = useState(initialAmounts.notes);
  const [autoFillFromGratuity, setAutoFillFromGratuity] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [exportOpen, setExportOpen] = useState(false);

  const exportMonths = useMemo(
    () =>
      buildPoolCollectionsExportMonths(
        rows,
        gratuityRunByMonth,
        osePercent,
        activitiesPercent,
      ),
    [rows, gratuityRunByMonth, osePercent, activitiesPercent],
  );

  const existingForMonth = useMemo(
    () => rows.find((row) => monthKeyFromDate(row.benefit_month) === month),
    [rows, month],
  );

  const gratuityRunForMonth = gratuityRunByMonth[month] ?? null;

  const suggestedFromRun = useMemo(() => {
    if (!gratuityRunForMonth) return null;
    return suggestedPoolCollectionsFromGratuityRun(
      gratuityRunForMonth,
      osePercent,
      activitiesPercent,
    );
  }, [gratuityRunForMonth, osePercent, activitiesPercent]);

  function applyGratuityRunFill(hint: GratuityRunPoolHint) {
    const suggested = suggestedPoolCollectionsFromGratuityRun(
      hint,
      osePercent,
      activitiesPercent,
    );
    setOseAmount(String(suggested.oseAmount));
    setActivitiesAmount(String(suggested.staffActivitiesAmount));
    setRoundingAmount(
      suggested.roundingAmount == null ? "" : String(suggested.roundingAmount),
    );
    setWithheldRetainAmount(
      suggested.withheldRetainAmount == null
        ? ""
        : String(suggested.withheldRetainAmount),
    );
    setDeductedAmount(
      suggested.benefitDeductionAmount == null
        ? ""
        : String(suggested.benefitDeductionAmount),
    );
  }

  function loadRow(row: BenefitPoolCollectionsRow) {
    setMonth(monthKeyFromDate(row.benefit_month));
    setOseAmount(String(row.ose_amount));
    setActivitiesAmount(String(row.staff_activities_amount));
    setRoundingAmount(String(row.rounding_amount ?? 0));
    setWithheldRetainAmount(String(row.withheld_retain_amount ?? 0));
    const hint = gratuityRunByMonth[monthKeyFromDate(row.benefit_month)];
    setDeductedAmount(
      deductedAmountFromSources(
        row.benefit_deduction_amount,
        hint
          ? suggestedPoolCollectionsFromGratuityRun(
              hint,
              osePercent,
              activitiesPercent,
            ).benefitDeductionAmount
          : null,
      ),
    );
    setNotes(row.notes ?? "");
    setError(null);
    setSuccess(null);
  }

  function resetFormForMonth(nextMonth: string) {
    const existing = rows.find(
      (row) => monthKeyFromDate(row.benefit_month) === nextMonth,
    );
    const hint = gratuityRunByMonth[nextMonth] ?? null;
    setMonth(nextMonth);
    setNotes(existing?.notes ?? "");
    setError(null);
    setSuccess(null);

    if (existing) {
      const suggested = hint
        ? suggestedPoolCollectionsFromGratuityRun(
            hint,
            osePercent,
            activitiesPercent,
          )
        : null;
      setOseAmount(String(existing.ose_amount));
      setActivitiesAmount(String(existing.staff_activities_amount));
      setRoundingAmount(String(existing.rounding_amount ?? 0));
      setWithheldRetainAmount(String(existing.withheld_retain_amount ?? 0));
      setDeductedAmount(
        deductedAmountFromSources(
          existing.benefit_deduction_amount,
          suggested?.benefitDeductionAmount,
        ),
      );
      return;
    }

    if (autoFillFromGratuity && hint) {
      applyGratuityRunFill(hint);
      return;
    }

    setOseAmount("");
    setActivitiesAmount("");
    setRoundingAmount("");
    setWithheldRetainAmount("");
    setDeductedAmount("");
  }

  const fieldClass =
    "h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20 disabled:cursor-not-allowed disabled:bg-black/[0.03] disabled:text-black/55";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-serif text-lg text-[#3D421F]">
            Pool collections
          </h2>
          <p className="text-sm text-black/55">
            Record monthly OS&amp;E deduction ({osePercent}%), Staff activities
            ({activitiesPercent}%), Rounding collection (floor to AED 5),
            Withheld retain (not entitled), and Deducted (staff benefit
            deductions). OS&amp;E / activities override policy percentages when
            no amounts are recorded for that month.
          </p>
        </div>
        <Button
          type="button"
          className="h-10 shrink-0 gap-2 bg-[var(--venue-primary,#818a40)] px-3 text-white hover:opacity-90"
          disabled={exportMonths.length === 0}
          onClick={() => setExportOpen(true)}
        >
          <Download className="h-4 w-4" />
          Export
        </Button>
      </div>

      {canEdit ? (
        <form
          className="space-y-4 rounded-xl border border-black/10 bg-white p-5 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            setSuccess(null);
            const formData = new FormData(e.currentTarget);
            startTransition(async () => {
              const result = await saveBenefitPoolCollections(month, formData);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setSuccess(
                existingForMonth
                  ? "Collections updated for this month."
                  : "Collections recorded for this month.",
              );
              router.refresh();
            });
          }}
        >
          <div>
            <h3 className="font-serif text-lg text-[#3D421F]">
              Record collections
            </h3>
            <p className="mt-1 text-sm text-black/55">
              Enter amounts aligned with the gratuity run deductions: OS&amp;E
              deduction ({osePercent}%), Staff activities ({activitiesPercent}
              %), Rounding collection (floor to AED 5), Withheld retain (not
              entitled), and Deducted (staff benefit deductions). Saved OS&amp;E
              / activities override policy percentages when runs are calculated.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-black/8 bg-[var(--venue-secondary,#F0F3DD)]/35 px-3 py-2.5">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[#3D421F]">
              <input
                type="checkbox"
                checked={autoFillFromGratuity}
                onChange={(e) => setAutoFillFromGratuity(e.target.checked)}
                disabled={pending}
                className="rounded border-black/20"
              />
              Auto-fill from gratuity run when month changes
            </label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8"
              disabled={pending || !gratuityRunForMonth}
              onClick={() => {
                if (!gratuityRunForMonth) return;
                applyGratuityRunFill(gratuityRunForMonth);
                setError(null);
                setSuccess(null);
              }}
            >
              Fill from gratuity run
            </Button>
            {gratuityRunForMonth ? (
              <p className="text-sm text-black/55">
                Pool gross {formatMoney(gratuityRunForMonth.poolGross)} ·{" "}
                {BENEFIT_RUN_STATUS_LABELS[
                  gratuityRunForMonth.status as BenefitRunStatus
                ] ?? gratuityRunForMonth.status}{" "}
                ·{" "}
                <Link
                  href={toScopedHref(
                    `/hr/benefits/gratuity/${gratuityRunForMonth.runId}`,
                    scope,
                    slug,
                  )}
                  className="font-medium text-[var(--venue-primary,#818a40)] underline-offset-2 hover:underline"
                >
                  {isBenefitRunLocked(gratuityRunForMonth.status)
                    ? "View run"
                    : "Open run"}
                </Link>
              </p>
            ) : (
              <p className="text-sm text-black/45">
                No calculated gratuity run for this month yet.
              </p>
            )}
          </div>

          <PayrollMonthPicker
            id="collections_month"
            label="Benefit month"
            value={month}
            onChange={resetFormForMonth}
            periodStartDay={periodStartDay}
            periodEndDay={periodEndDay}
            disabled={pending}
            className="max-w-sm"
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1.5">
              <label
                htmlFor="ose_amount"
                className="block text-xs font-medium text-black/55"
              >
                OS&amp;E deduction ({osePercent}%)
              </label>
              <input
                id="ose_amount"
                name="ose_amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={oseAmount}
                onChange={(e) => setOseAmount(e.target.value)}
                disabled={pending}
                className={fieldClass}
                placeholder="0.00"
                required
              />
              <p className="text-xs text-black/45">
                {suggestedFromRun
                  ? `From gratuity run: ${formatMoney(suggestedFromRun.oseAmount)} (${osePercent}% of ${formatMoney(gratuityRunForMonth!.poolGross)} pool).`
                  : `Policy fallback: ${osePercent}% of pool.`}
              </p>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="staff_activities_amount"
                className="block text-xs font-medium text-black/55"
              >
                Staff activities ({activitiesPercent}%)
              </label>
              <input
                id="staff_activities_amount"
                name="staff_activities_amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={activitiesAmount}
                onChange={(e) => setActivitiesAmount(e.target.value)}
                disabled={pending}
                className={fieldClass}
                placeholder="0.00"
                required
              />
              <p className="text-xs text-black/45">
                {suggestedFromRun
                  ? `From gratuity run: ${formatMoney(suggestedFromRun.staffActivitiesAmount)} (${activitiesPercent}% of ${formatMoney(gratuityRunForMonth!.poolGross)} pool).`
                  : `Policy fallback: ${activitiesPercent}% of pool.`}
              </p>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="rounding_amount"
                className="block text-xs font-medium text-black/55"
              >
                Rounding collection · floor to AED 5
              </label>
              <input
                id="rounding_amount"
                name="rounding_amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={roundingAmount}
                onChange={(e) => setRoundingAmount(e.target.value)}
                disabled={pending}
                className={fieldClass}
                placeholder="0.00"
              />
              <p className="text-xs text-black/45">
                {suggestedFromRun?.roundingAmount != null
                  ? `From gratuity run: ${formatMoney(suggestedFromRun.roundingAmount)} — remainders after flooring each payout to AED 5.`
                  : gratuityRunForMonth
                    ? "Recalculate the gratuity run to derive remainders after flooring each payout to AED 5."
                    : "Remainders after flooring individual gratuity to the nearest AED 5."}
              </p>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="withheld_retain_amount"
                className="block text-xs font-medium text-black/55"
              >
                Withheld retain · not entitled
              </label>
              <input
                id="withheld_retain_amount"
                name="withheld_retain_amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={withheldRetainAmount}
                onChange={(e) => setWithheldRetainAmount(e.target.value)}
                disabled={pending}
                className={fieldClass}
                placeholder="0.00"
              />
              <p className="text-xs text-black/45">
                {suggestedFromRun?.withheldRetainAmount != null
                  ? `From gratuity run: ${formatMoney(suggestedFromRun.withheldRetainAmount)} — retain kept when a collector is not entitled.`
                  : gratuityRunForMonth
                    ? "Recalculate the gratuity run to book retain that was not paid out."
                    : "Retain kept when a tip collector is not entitled to a payout."}
              </p>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="benefit_deduction_amount"
                className="block text-xs font-medium text-black/55"
              >
                Deducted
              </label>
              <input
                id="benefit_deduction_amount"
                name="benefit_deduction_amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={deductedAmount}
                onChange={(e) => setDeductedAmount(e.target.value)}
                disabled={pending}
                className={fieldClass}
                placeholder="0.00"
              />
              <p className="text-xs text-black/45">
                {suggestedFromRun?.benefitDeductionAmount != null
                  ? `From gratuity run: ${formatMoney(suggestedFromRun.benefitDeductionAmount)} — taken from staff payouts via benefit deductions.`
                  : gratuityRunForMonth
                    ? "Recalculate the gratuity run to book amounts deducted from staff payouts."
                    : "Amounts taken from staff payouts via benefit deductions."}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="collections_notes"
              className="block text-xs font-medium text-black/55"
            >
              Notes
            </label>
            <textarea
              id="collections_notes"
              name="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={pending}
              className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20"
              placeholder="Optional — e.g. collection sheet reference"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              size="sm"
              className="h-10"
              disabled={pending || !month}
            >
              {pending
                ? "Saving…"
                : existingForMonth
                  ? "Update collections"
                  : "Save collections"}
            </Button>
            {existingForMonth ? (
              <p className="text-sm text-black/50">
                Editing existing record for {formatBenefitMonthLabel(month)}.
              </p>
            ) : null}
          </div>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          {success ? (
            <p className="text-sm text-emerald-800">{success}</p>
          ) : null}
        </form>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="font-serif text-lg text-[#3D421F]">Recorded months</h2>
          <p className="text-sm text-black/55">
            Amounts kept from the gratuity settlement: OS&amp;E, staff
            activities, rounding remainders, withheld retain that was not
            paid, and amounts deducted from staff payouts.
          </p>
        </div>

        <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
              <tr>
                <th className="px-3 py-2.5 font-medium">Month</th>
                <th className="px-3 py-2.5 font-medium text-right">
                  OS&amp;E ({osePercent}%)
                </th>
                <th className="px-3 py-2.5 font-medium text-right">
                  Staff activities ({activitiesPercent}%)
                </th>
                <th className="px-3 py-2.5 font-medium text-right">
                  Rounding · AED 5
                </th>
                <th className="px-3 py-2.5 font-medium text-right">
                  Withheld retain
                </th>
                <th className="px-3 py-2.5 font-medium text-right">
                  Deducted
                </th>
                <th className="px-3 py-2.5 font-medium text-right">Total</th>
                <th className="px-3 py-2.5 font-medium">Notes</th>
                {canEdit ? <th className="px-3 py-2.5 font-medium" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={canEdit ? 9 : 8}
                    className="px-3 py-12 text-center text-sm text-black/45"
                  >
                    No collections recorded yet. Enter amounts for a benefit
                    month above.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const hint =
                    gratuityRunByMonth[monthKeyFromDate(row.benefit_month)];
                  const deducted = Number(
                    deductedAmountFromSources(
                      row.benefit_deduction_amount,
                      hint?.benefitDeductions,
                    ),
                  );
                  const total =
                    row.ose_amount +
                    row.staff_activities_amount +
                    (row.rounding_amount ?? 0) +
                    (row.withheld_retain_amount ?? 0) +
                    (Number.isFinite(deducted) ? deducted : 0);
                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-[var(--venue-secondary,#F0F3DD)]/25"
                    >
                      <td className="px-3 py-2.5 font-medium text-[#3D421F]">
                        {formatBenefitMonthLabel(row.benefit_month)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatMoney(row.ose_amount)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatMoney(row.staff_activities_amount)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatMoney(row.rounding_amount ?? 0)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatMoney(row.withheld_retain_amount ?? 0)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatMoney(Number.isFinite(deducted) ? deducted : 0)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                        {formatMoney(total)}
                      </td>
                      <td className="max-w-[14rem] truncate px-3 py-2.5 text-black/55">
                        {row.notes ?? "—"}
                      </td>
                      {canEdit ? (
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            className="text-sm font-medium text-[var(--venue-primary,#818a40)] underline-offset-2 hover:underline"
                            onClick={() => loadRow(row)}
                          >
                            Edit
                          </button>
                          <span className="mx-2 text-black/20">·</span>
                          <button
                            type="button"
                            className="text-sm font-medium text-red-700/80 underline-offset-2 hover:underline"
                            disabled={pending}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `Delete collections for ${formatBenefitMonthLabel(row.benefit_month)}? Runs will fall back to policy percentages.`,
                                )
                              ) {
                                return;
                              }
                              setError(null);
                              setSuccess(null);
                              startTransition(async () => {
                                const result =
                                  await deleteBenefitPoolCollections(row.id);
                                if (!result.ok) {
                                  setError(result.error);
                                  return;
                                }
                                if (
                                  monthKeyFromDate(row.benefit_month) === month
                                ) {
                                  resetFormForMonth(month);
                                }
                                setSuccess("Collection record deleted.");
                                router.refresh();
                              });
                            }}
                          >
                            Delete
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {exportOpen ? (
        <BenefitPoolCollectionsExportDialog
          open
          months={exportMonths}
          venueName={venueName}
          venueLogoUrl={venueLogoUrl}
          userDisplayName={userDisplayName}
          osePercent={osePercent}
          activitiesPercent={activitiesPercent}
          initialMonthKey={month}
          onClose={() => setExportOpen(false)}
        />
      ) : null}
    </div>
  );
}
