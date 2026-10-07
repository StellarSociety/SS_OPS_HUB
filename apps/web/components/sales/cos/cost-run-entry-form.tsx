"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Download, Save, Send, CheckCircle2, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  deriveCosRun,
  costHealth,
  autoDiscountAdjustment,
  type CostHealth,
} from "@/lib/sales/cos-calculations";
import type {
  CostCentre,
  VenueCosRunWithAdjustments,
} from "@/lib/sales/cos-types";
import {
  saveCosRunAction,
  submitCosRunForApprovalAction,
  approveCosRunAction,
  reopenCosRunAction,
  importCosWeekSalesAction,
} from "@/lib/actions/cos";

type AdjRow = {
  reason: string;
  amount_gs: number;
  source: "manual" | "auto_discount" | "stock" | "other";
};

type Props = {
  costCentre: CostCentre;
  fiscalYear: number;
  weekNo: number;
  weekStart: string;
  weekEnd: string;
  existing: VenueCosRunWithAdjustments | null;
  defaultOpeningStock: number;
  targetCostPct: number;
  purchaseTargetGs: number;
  closingStockTargetGs: number;
  autoAdjustmentPct: number;
  approverUserId: string | null;
  canEdit: boolean;
};

const AED = (n: number) =>
  n.toLocaleString("en-AE", { maximumFractionDigits: 0 });
const PCT = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);

const healthText: Record<CostHealth, string> = {
  good: "text-emerald-700",
  warn: "text-amber-600",
  bad: "text-red-600",
  none: "text-black/40",
};

export function CostRunEntryForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const locked = props.existing?.status === "approved" || !props.canEdit;

  const [restaurantSales, setRestaurantSales] = useState(
    props.existing?.restaurant_sales_gs ?? 0,
  );
  const [sales, setSales] = useState(props.existing?.sales_gs ?? 0);
  const [discount, setDiscount] = useState(props.existing?.sales_discount_gs ?? 0);
  const [importedSales, setImportedSales] = useState<number | null>(
    props.existing?.imported_sales_gs ?? null,
  );
  const [purchases, setPurchases] = useState(props.existing?.purchases_gs ?? 0);
  const [openingStock, setOpeningStock] = useState(
    props.existing?.opening_stock_gs ?? props.defaultOpeningStock,
  );
  const [closingStock, setClosingStock] = useState(
    props.existing?.closing_stock_gs ?? 0,
  );
  const [adjustments, setAdjustments] = useState<AdjRow[]>(
    props.existing?.adjustments.map((a) => ({
      reason: a.reason,
      amount_gs: a.amount_gs,
      source: a.source,
    })) ?? [],
  );
  const [message, setMessage] = useState<string | null>(null);

  // Auto discount adjustment (e.g. shisha 30%). Shown as a derived line.
  const autoAdj = autoDiscountAdjustment(discount, props.autoAdjustmentPct);
  const manualAdjTotal = adjustments.reduce((s, a) => s + (Number(a.amount_gs) || 0), 0);
  const adjustmentsTotal = manualAdjTotal + autoAdj;

  const derived = useMemo(
    () =>
      deriveCosRun(
        {
          sales_gs: sales,
          purchases_gs: purchases,
          opening_stock_gs: openingStock,
          closing_stock_gs: closingStock,
        },
        adjustmentsTotal,
      ),
    [sales, purchases, openingStock, closingStock, adjustmentsTotal],
  );

  const health = costHealth(derived.costPct, props.targetCostPct);
  const purchaseVariance = purchases - props.purchaseTargetGs;
  const stockVariance = closingStock - props.closingStockTargetGs;
  const verifyDiff =
    importedSales == null ? null : importedSales - sales;

  function num(setter: (n: number) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setter(parseFloat(e.target.value) || 0);
  }

  function doImport() {
    setMessage(null);
    startTransition(async () => {
      const res = await importCosWeekSalesAction({
        costCentre: props.costCentre,
        weekStart: props.weekStart,
        weekEnd: props.weekEnd,
      });
      if (res.ok) {
        setRestaurantSales(res.snapshot.restaurant_sales_gs);
        setSales(res.snapshot.sales_gs);
        setDiscount(res.snapshot.sales_discount_gs);
        setImportedSales(res.snapshot.sales_gs);
        setMessage("Imported figures from daily sales.");
      }
    });
  }

  function buildPayload(id?: string) {
    return {
      id,
      cost_centre: props.costCentre,
      fiscal_year: props.fiscalYear,
      week_no: props.weekNo,
      week_start: props.weekStart,
      week_end: props.weekEnd,
      restaurant_sales_gs: restaurantSales,
      sales_gs: sales,
      sales_discount_gs: discount,
      purchases_gs: purchases,
      opening_stock_gs: openingStock,
      closing_stock_gs: closingStock,
      imported_sales_gs: importedSales,
      adjustments: [
        ...adjustments.map((a) => ({
          reason: a.reason,
          amount_gs: a.amount_gs,
          source: a.source,
        })),
        ...(autoAdj
          ? [
              {
                reason: `Auto adjustment (${props.autoAdjustmentPct}% of discount)`,
                amount_gs: autoAdj,
                source: "auto_discount" as const,
              },
            ]
          : []),
      ],
    };
  }

  function save(then?: (runId: string) => void) {
    setMessage(null);
    startTransition(async () => {
      const res = await saveCosRunAction(buildPayload(props.existing?.id));
      if (res.ok) {
        setMessage("Saved.");
        if (then) then(res.runId);
        else router.push(`/gp-cos/${props.costCentre}/cost-runs?year=${props.fiscalYear}`);
      }
    });
  }

  function submit() {
    save((runId) => {
      startTransition(async () => {
        await submitCosRunForApprovalAction({
          runId,
          costCentre: props.costCentre,
          approverUserId: props.approverUserId,
        });
        router.push(`/gp-cos/${props.costCentre}/cost-runs?year=${props.fiscalYear}`);
      });
    });
  }

  function approve() {
    if (!props.existing) return;
    startTransition(async () => {
      await approveCosRunAction({
        runId: props.existing!.id,
        costCentre: props.costCentre,
      });
      router.push(`/gp-cos/${props.costCentre}/cost-runs?year=${props.fiscalYear}`);
    });
  }

  function reopen() {
    if (!props.existing) return;
    startTransition(async () => {
      await reopenCosRunAction({
        runId: props.existing!.id,
        costCentre: props.costCentre,
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={locked || pending}
          onClick={doImport}
          className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-[#3D421F] hover:bg-black/5 disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> Import figures
        </button>
        {props.existing?.status === "approved" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
            <Lock className="h-4 w-4" /> Approved
          </span>
        ) : null}
      </div>

      {message ? (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left: inputs */}
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-5">
            <h3 className="mb-3 font-serif text-lg text-[#3D421F]">Sales (auto-pulled)</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Restaurant sales" value={restaurantSales} onChange={num(setRestaurantSales)} locked={locked} />
              <Field label="Cost centre sales" value={sales} onChange={num(setSales)} locked={locked} />
              <Field label="Discount" value={discount} onChange={num(setDiscount)} locked={locked} />
              <div>
                <label className="text-xs text-black/50">
                  Verification (imported − entered)
                </label>
                <div className={`mt-1 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 text-sm ${verifyDiff && Math.abs(verifyDiff) > 0.5 ? "text-red-600" : "text-black/60"}`}>
                  {verifyDiff == null ? "— import to verify" : AED(verifyDiff)}
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-serif text-lg text-[#3D421F]">Cost inputs</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Purchases (manual)" value={purchases} onChange={num(setPurchases)} locked={locked} />
              <Field label="Opening stock (auto)" value={openingStock} onChange={num(setOpeningStock)} locked={locked} hint="Previous week's closing" />
              <Field label="Closing stock" value={closingStock} onChange={num(setClosingStock)} locked={locked} />
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-serif text-lg text-[#3D421F]">Adjustments</h3>
              {!locked ? (
                <button
                  type="button"
                  onClick={() => setAdjustments((a) => [...a, { reason: "", amount_gs: 0, source: "manual" }])}
                  className="inline-flex items-center gap-1 rounded-lg bg-[var(--venue-primary,#818a40)] px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              ) : null}
            </div>
            <div className="space-y-2">
              {adjustments.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    disabled={locked}
                    value={a.reason}
                    placeholder="Reason"
                    onChange={(e) =>
                      setAdjustments((arr) => arr.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))
                    }
                    className="flex-1"
                  />
                  <Input
                    disabled={locked}
                    type="number"
                    value={a.amount_gs}
                    onChange={(e) =>
                      setAdjustments((arr) => arr.map((x, j) => (j === i ? { ...x, amount_gs: parseFloat(e.target.value) || 0 } : x)))
                    }
                    className="w-28 text-right"
                  />
                  {!locked ? (
                    <button type="button" onClick={() => setAdjustments((arr) => arr.filter((_, j) => j !== i))} className="text-black/30 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              ))}
              {autoAdj ? (
                <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  <span>Auto adjustment ({props.autoAdjustmentPct}% of discount)</span>
                  <span className="font-semibold">{AED(autoAdj)}</span>
                </div>
              ) : null}
              {adjustments.length === 0 && !autoAdj ? (
                <p className="text-sm text-black/40">No adjustments.</p>
              ) : null}
            </div>
          </Card>
        </div>

        {/* Right: live result */}
        <div className="space-y-5">
          <Card className="p-5">
            <h3 className="mb-3 font-serif text-lg text-[#3D421F]">Live result</h3>
            <Metric label="Cost of sales" value={AED(derived.costOfSales)} />
            <Metric label="Gross profit" value={AED(derived.grossProfit)} />
            <div className="my-3 border-t border-black/5" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-black/60">Cost %</span>
              <span className={`text-2xl font-bold ${healthText[health]}`}>{PCT(derived.costPct)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-black/60">GP %</span>
              <span className={`text-lg font-semibold ${healthText[health]}`}>{PCT(derived.gpPct)}</span>
            </div>
            <div className="mt-1 text-xs text-black/40">Target {props.targetCostPct}%</div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-serif text-lg text-[#3D421F]">Targets &amp; variances</h3>
            <Metric label="Purchase target" value={AED(props.purchaseTargetGs)} />
            <Metric label="Purchase variance" value={AED(purchaseVariance)} tone={purchaseVariance > 0 ? "bad" : "good"} />
            <Metric label="Closing stock target" value={AED(props.closingStockTargetGs)} />
            <Metric label="Stock variance" value={AED(stockVariance)} />
            <Metric label="Total adjustments" value={AED(adjustmentsTotal)} />
          </Card>
        </div>
      </div>

      {/* Action bar */}
      {!locked ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-black/5 pt-4">
          <button
            type="button"
            disabled={pending}
            onClick={() => save()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-[#3D421F] hover:bg-black/5 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> Save
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--venue-primary,#818a40)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> Send for approval
          </button>
          {props.existing?.status === "pending_approval" ? (
            <button
              type="button"
              disabled={pending}
              onClick={approve}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" /> Approve
            </button>
          ) : null}
        </div>
      ) : props.existing?.status === "approved" && props.canEdit ? (
        <div className="flex items-center justify-end border-t border-black/5 pt-4">
          <button
            type="button"
            disabled={pending}
            onClick={reopen}
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-[#3D421F] hover:bg-black/5 disabled:opacity-50"
          >
            Reopen (request change)
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  locked,
  hint,
}: {
  label: string;
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  locked: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="text-xs text-black/50">{label}</label>
      <Input
        type="number"
        disabled={locked}
        value={value}
        onChange={onChange}
        className="mt-1 text-right"
      />
      {hint ? <p className="mt-0.5 text-xs text-black/40">{hint}</p> : null}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-black/60">{label}</span>
      <span
        className={`text-sm font-semibold ${
          tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-700" : "text-[#3D421F]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
