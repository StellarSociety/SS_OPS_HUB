"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Download,
  Save,
  Send,
  CheckCircle2,
  Lock,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import {
  deriveCosRun,
  costHealth,
  autoDiscountAdjustment,
  type CostHealth,
} from "@/lib/sales/cos-calculations";
import {
  COST_CENTRE_LABELS,
  type CostCentre,
  type CosAdjustmentSide,
  type CosAdjustmentSource,
  type CosRunStatus,
  type CosWeekSalesSnapshot,
  type VenueCosRunWithAdjustments,
} from "@/lib/sales/cos-types";
import { toScopedHref } from "@/lib/venue/scope-routing";
import {
  saveCosRunAction,
  submitCosRunForApprovalAction,
  approveCosRunAction,
  reopenCosRunAction,
  importCosWeekSalesAction,
} from "@/lib/actions/cos";

type AdjRow = {
  reason: string;
  /** Signed: additions positive, deductions negative. */
  amount_gs: number;
  source: CosAdjustmentSource;
  /** UI flag so a deduction keeps its type while its amount is still 0. */
  deduction?: boolean;
  /** Ledger code from the adjustment kind. */
  ledger_account?: string;
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
  /** Whether Settings links any ledger accounts to this cost centre. */
  ledgerLinked: boolean;
  /** Net AP purchases on the linked ledgers for the week (null if unavailable). */
  accountsPurchasesNet: number | null;
  /** Current Revenue figures for the week (null if they couldn't load). */
  liveSalesSnapshot: CosWeekSalesSnapshot | null;
  /** Active adjustment kinds (Settings → Adjustments). */
  adjustmentKinds: { name: string; ledgerCode: string; side: CosAdjustmentSide }[];
  /** Transfers touching this centre in the run's week, signed for this centre. */
  transferAdjustments: { reason: string; amount_gs: number }[];
  /** Approvers from Settings → Approvals (or anyone with edit if none set). */
  canApprove: boolean;
};

const RUN_STATUS: Record<
  CosRunStatus | "new",
  { label: string; className: string }
> = {
  new: { label: "New", className: "bg-sky-100 text-sky-800" },
  draft: { label: "Draft", className: "bg-black/5 text-black/60" },
  pending_approval: {
    label: "Pending approval",
    className: "bg-amber-100 text-amber-800",
  },
  approved: { label: "Approved", className: "bg-emerald-100 text-emerald-800" },
};

/** ISO date → DD/MM/YY. */
function ddmmyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

const PCT = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);
/** 1,234.56 — thousands separators and always two decimals. */
const MONEY = (n: number) =>
  (Number(n) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Signed money: deductions shown as (-) 1,234.00. */
const SIGNED = (n: number) =>
  (Number(n) || 0) < 0 ? `(-) ${MONEY(-n)}` : MONEY(n);

const healthBox: Record<CostHealth, string> = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  bad: "border-red-200 bg-red-50 text-red-800",
  none: "border-black/10 bg-black/[0.02] text-black/50",
};

export function CostRunEntryForm(props: Props) {
  const router = useRouter();
  const centreLabel = COST_CENTRE_LABELS[props.costCentre];
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
    props.existing?.adjustments
      // Auto and transfer rows are re-derived from Settings each time.
      .filter((a) => a.source !== "auto_discount" && a.source !== "transfer")
      .map((a) => ({
        reason: a.reason,
        amount_gs: a.amount_gs,
        source: a.source,
        deduction: a.source !== "neutral" && Number(a.amount_gs) < 0,
        ledger_account: a.ledger_account ?? "",
      })) ?? [],
  );
  const [message, setMessage] = useState<string | null>(null);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

  // Unsaved-changes tracking: compare the editable fields with their values
  // when the page opened.
  const snapshot = JSON.stringify({
    restaurantSales,
    sales,
    discount,
    importedSales,
    purchases,
    openingStock,
    closingStock,
    adjustments,
  });
  const [initialSnapshot] = useState(snapshot);
  const dirty = !locked && snapshot !== initialSnapshot;

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const { scope, slug } = useVenueScope();
  const listHref = toScopedHref(
    `/gp-cos/${props.costCentre}/cost-runs?year=${props.fiscalYear}`,
    scope,
    slug,
  );

  /** Previous page when there is one, otherwise the Cost Runs table. */
  function leave() {
    if (window.history.length > 1) router.back();
    else router.push(listHref);
  }

  function handleBack() {
    if (dirty) setLeaveDialogOpen(true);
    else leave();
  }

  // Auto discount adjustment (e.g. shisha 30%). Shown as a derived line.
  const autoAdj = autoDiscountAdjustment(discount, props.autoAdjustmentPct);
  // Neutral rows are recorded for reference only.
  const countedAdjustments = adjustments.filter((a) => a.source !== "neutral");
  const neutralTotal = adjustments
    .filter((a) => a.source === "neutral")
    .reduce((s, a) => s + Math.abs(Number(a.amount_gs) || 0), 0);
  const manualAdjTotal = countedAdjustments.reduce(
    (s, a) => s + (Number(a.amount_gs) || 0),
    0,
  );
  const transferTotal = props.transferAdjustments.reduce(
    (s, t) => s + t.amount_gs,
    0,
  );
  const adjustmentsTotal = manualAdjTotal + autoAdj + transferTotal;
  // Additions reduce cost of sales; deductions (negative amounts) add to it.
  const signedAdjustments = [
    autoAdj,
    ...props.transferAdjustments.map((t) => t.amount_gs),
    ...countedAdjustments.map((a) => Number(a.amount_gs) || 0),
  ];
  const additionsTotal = signedAdjustments.reduce((s, v) => s + Math.max(v, 0), 0);
  const deductionsTotal = signedAdjustments.reduce((s, v) => s + Math.max(-v, 0), 0);

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

  // Imported once a sales snapshot has been taken; stale if Revenue has moved on.
  const hasImported = importedSales != null;
  const live = props.liveSalesSnapshot;
  const sameMoney = (a: number, b: number) =>
    Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.005;
  const importUpToDate =
    live == null
      ? null
      : sameMoney(restaurantSales, live.restaurant_sales_gs) &&
        sameMoney(sales, live.sales_gs) &&
        sameMoney(discount, live.sales_discount_gs);

  const health = costHealth(derived.costPct, props.targetCostPct);
  const purchaseVariance = purchases - props.purchaseTargetGs;
  const stockVariance = closingStock - props.closingStockTargetGs;


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
        setMessage(
          importedSales != null
            ? "Updated NET figures from Revenue daily sales — save to keep them."
            : "Imported NET figures from Revenue daily sales.",
        );
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
          ledger_account: a.ledger_account ?? "",
        })),
        ...props.transferAdjustments.map((t) => ({
          reason: t.reason,
          amount_gs: t.amount_gs,
          source: "transfer" as const,
        })),
        ...(autoAdj
          ? [
              {
                reason: `Auto adjustment (${props.autoAdjustmentPct}% of ${centreLabel.toLowerCase()} net discounts)`,
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
        else router.push(listHref);
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
        router.push(listHref);
      });
    });
  }

  function approve() {
    if (!props.existing) return;
    startTransition(async () => {
      const res = await approveCosRunAction({
        runId: props.existing!.id,
        costCentre: props.costCentre,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.push(listHref);
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

  const status = RUN_STATUS[props.existing?.status ?? "new"];

  return (
    <div className="space-y-5">
      {/* Run bar: which cost run this is, plus sales import */}
      <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="font-serif text-lg text-[#3D421F]">
            {COST_CENTRE_LABELS[props.costCentre]} Cost of Sales Calculation
          </h2>
          <span className="text-sm text-black/60">
            <span className="font-semibold text-[#3D421F]">
              W{props.weekNo}
            </span>{" "}
            · {ddmmyy(props.weekStart)} – {ddmmyy(props.weekEnd)}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}
          >
            {props.existing?.status === "approved" ? (
              <Lock className="h-3 w-3" />
            ) : null}
            {status.label}
          </span>
          {dirty ? (
            <span className="text-xs text-amber-700">Unsaved changes</span>
          ) : null}
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          <button
            type="button"
            disabled={locked || pending}
            onClick={doImport}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--venue-primary,#818a40)] px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {hasImported ? (
              <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
            ) : (
              <Download className="h-4 w-4" />
            )}{" "}
            {hasImported ? "Update figures" : "Import figures"}
          </button>
          {hasImported && importUpToDate != null ? (
            importUpToDate ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> Up to date with Revenue
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700"
                title={`Revenue now: restaurant ${MONEY(live!.restaurant_sales_gs)} · ${centreLabel.toLowerCase()} ${MONEY(live!.sales_gs)} · discounts ${MONEY(live!.sales_discount_gs)}`}
              >
                <AlertTriangle className="h-3 w-3" /> Revenue figures changed —
                needs a refresh
              </span>
            )
          ) : null}
        </div>
      </Card>

      <button
        type="button"
        onClick={handleBack}
        className="inline-flex items-center gap-1.5 rounded-md px-1 text-sm font-medium text-black/60 transition hover:text-[#3D421F]"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {message ? (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      {/* Live calculation */}
      <Card className="p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
          <div
            className={`flex min-w-44 flex-col items-center justify-center rounded-lg border px-5 py-3 text-center ${healthBox[health]}`}
          >
            <div className="text-xs font-medium uppercase tracking-wide opacity-70">
              {centreLabel} cost %
            </div>
            <div className="mt-0.5 text-3xl font-bold tabular-nums">
              {PCT(derived.costPct)}
            </div>
            <div className="mt-0.5 text-xs opacity-70">
              Target {props.targetCostPct}% · GP {PCT(derived.gpPct)}
            </div>
          </div>
          <div className="min-w-0 flex-1 overflow-x-auto">
            <div className="grid w-max grid-cols-[repeat(4,9.5rem_1.25rem)_9.5rem] items-center gap-y-2">
              <Equation
                result={{ label: "Gross profit", value: derived.grossProfit }}
                terms={[
                  { label: `${centreLabel} net sales`, value: sales },
                  { op: "−", label: "Cost of sales", value: derived.costOfSales },
                ]}
              />
              <Equation
                result={{ label: "Cost of sales", value: derived.costOfSales }}
                terms={[
                  { label: `${centreLabel} purchases`, value: purchases },
                  { op: "+", label: "Opening stock", value: openingStock },
                  { op: "−", label: "Closing stock", value: closingStock },
                  { op: "+", label: "Adjustments", value: adjustmentsTotal },
                ]}
              />
              <Equation
                result={{ label: "Adjustments", value: adjustmentsTotal }}
                terms={[
                  { label: "Additions", value: additionsTotal },
                  { op: "−", label: "Deductions", value: deductionsTotal },
                ]}
              />
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 font-serif text-lg text-[#3D421F]">
          Net sales
          <span className="ml-2 font-sans text-xs font-normal text-black/45">
            NET from Revenue · use Import figures
          </span>
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Restaurant net sales" value={restaurantSales} onValue={setRestaurantSales} locked={locked} />
          <Field label={`${centreLabel} net sales`} value={sales} onValue={setSales} locked={locked} />
          <Field label={`${centreLabel} net discounts`} value={discount} onValue={setDiscount} locked={locked} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="flex flex-col p-5">
          <h3 className="mb-3 font-serif text-lg text-[#3D421F]">
            Purchases
            <span className="ml-2 font-sans text-xs font-normal text-black/45">NET</span>
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReadOnlyField
              label="Accounts (ledger)"
              value={
                props.ledgerLinked
                  ? props.accountsPurchasesNet == null
                    ? "Unavailable"
                    : MONEY(props.accountsPurchasesNet)
                  : "Not linked"
              }
              hint={
                props.ledgerLinked
                  ? "Approved & posted invoices this week."
                  : "Link ledgers in Settings → Ledger accounts."
              }
              muted={!props.ledgerLinked || props.accountsPurchasesNet == null}
            />
            <Field
              label="Manual input (STO)"
              value={purchases}
              onValue={setPurchases}
              locked={locked}
              hint="Used for cost of sales."
            />
          </div>
          <div className="mb-4 mt-3 flex items-center justify-between text-sm">
            <span className="text-black/60">Difference (Accounts − STO)</span>
            {props.ledgerLinked && props.accountsPurchasesNet != null ? (
              <span
                className={`font-semibold tabular-nums ${
                  Math.abs(props.accountsPurchasesNet - purchases) < 0.005
                    ? "text-emerald-700"
                    : "text-red-700"
                }`}
              >
                {SIGNED(props.accountsPurchasesNet - purchases)}
              </span>
            ) : (
              <span className="text-black/40" title="Checks STO once ledgers are linked">
                —
              </span>
            )}
          </div>
          {/* mt-auto: bottom-aligned with the Stocks targets */}
          <div className="mt-auto border-t border-black/5 pt-3">
            <Metric label="Purchase target" value={MONEY(props.purchaseTargetGs)} />
            <Metric
              label="Purchase variance"
              value={MONEY(purchaseVariance)}
              tone={purchaseVariance > 0 ? "bad" : "good"}
            />
          </div>
        </Card>

        <Card className="flex flex-col p-5">
          <h3 className="mb-3 font-serif text-lg text-[#3D421F]">
            Stocks
            <span className="ml-2 font-sans text-xs font-normal text-black/45">NET</span>
          </h3>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Opening stock"
              value={openingStock}
              onValue={setOpeningStock}
              locked={locked}
              hint="Defaults to the previous week's closing stock."
            />
            <Field label="Closing stock" value={closingStock} onValue={setClosingStock} locked={locked} />
          </div>
          <div className="mt-auto border-t border-black/5 pt-3">
            <Metric label="Closing stock target" value={MONEY(props.closingStockTargetGs)} />
            <Metric label="Stock variance" value={MONEY(stockVariance)} />
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-serif text-lg text-[#3D421F]">Adjustments</h3>
          {!locked ? (
            <button
              type="button"
              onClick={() =>
                setAdjustments((a) => [...a, { reason: "", amount_gs: 0, source: "manual" }])
              }
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--venue-primary,#818a40)] px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          ) : null}
        </div>
        <div className="overflow-x-auto rounded-lg border border-black/15">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[var(--venue-secondary,#F0F3DD)] text-xs font-bold uppercase tracking-wide text-black/70">
                <th className="w-10 border border-black/15 px-2 py-2 text-center">#</th>
                <th className="border border-black/15 px-3 py-2 text-left">Reference</th>
                <th className="w-80 border border-black/15 px-3 py-2 text-center">Type</th>
                <th className="w-44 border border-black/15 px-3 py-2 text-right">Amount</th>
                {!locked ? <th className="w-10 border border-black/15" aria-label="Remove" /> : null}
              </tr>
            </thead>
            <tbody>
              {autoAdj ? (
                <tr className="bg-amber-50/70 text-amber-900">
                  <td className="border border-black/15 px-2 py-2 text-center text-xs text-amber-700/70">
                    Auto
                  </td>
                  <td className="border border-black/15 px-3 py-2">
                    Auto adjustment — {props.autoAdjustmentPct}% of{" "}
                    {centreLabel.toLowerCase()} net discounts
                    <span className="ml-1 text-xs text-amber-700/70">
                      (Settings → Adjustments)
                    </span>
                  </td>
                  <td className="border border-black/15 px-3 py-2 text-center">
                    <TypeBadge deduction={autoAdj < 0} />
                  </td>
                  <td className="border border-black/15 px-3 py-2 text-right tabular-nums">
                    {SIGNED(autoAdj)}
                  </td>
                  {!locked ? <td className="border border-black/15" /> : null}
                </tr>
              ) : null}
              {props.transferAdjustments.map((t, ti) => (
                <tr key={`transfer-${ti}`} className="bg-sky-50/70 text-sky-900">
                  <td className="border border-black/15 px-2 py-2 text-center text-xs text-sky-700/70">
                    Transfer
                  </td>
                  <td className="border border-black/15 px-3 py-2">
                    {t.reason}
                    <span className="ml-1 text-xs text-sky-700/70">
                      (Settings → Transfers)
                    </span>
                  </td>
                  <td className="border border-black/15 px-3 py-2 text-center">
                    <TypeBadge deduction={t.amount_gs < 0} />
                  </td>
                  <td className="border border-black/15 px-3 py-2 text-right tabular-nums">
                    {SIGNED(t.amount_gs)}
                  </td>
                  {!locked ? <td className="border border-black/15" /> : null}
                </tr>
              ))}
              {adjustments.map((a, i) => {
                const amount = Math.abs(Number(a.amount_gs) || 0);
                const isNeutral = a.source === "neutral";
                const isDeduction =
                  !isNeutral && (a.deduction ?? Number(a.amount_gs) < 0);
                const side: CosAdjustmentSide = isNeutral
                  ? "NEU"
                  : isDeduction
                    ? "CR"
                    : "DB";
                const sideRow = (next: CosAdjustmentSide): Partial<AdjRow> => ({
                  deduction: next === "CR",
                  source:
                    next === "NEU"
                      ? "neutral"
                      : a.source === "neutral"
                        ? "manual"
                        : a.source,
                  amount_gs: next === "CR" ? -amount : amount,
                });
                const patchRow = (patch: Partial<AdjRow>) =>
                  setAdjustments((arr) =>
                    arr.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                  );
                return (
                  <tr key={i}>
                    <td className="border border-black/15 px-2 py-2 text-center text-xs text-black/45">
                      {i + 1}
                    </td>
                    <td className="border border-black/15 p-0">
                      {props.adjustmentKinds.length > 0 ? (
                        <select
                          disabled={locked}
                          value={a.reason}
                          onChange={(e) => {
                            const kind = props.adjustmentKinds.find(
                              (k) => k.name === e.target.value,
                            );
                            patchRow({
                              reason: e.target.value,
                              ledger_account: kind?.ledgerCode ?? "",
                              ...(kind ? sideRow(kind.side) : {}),
                            });
                          }}
                          className="h-9 w-full bg-transparent px-2 text-sm text-[#3D421F] outline-none focus:bg-[var(--venue-secondary,#F0F3DD)]/40 disabled:opacity-60"
                        >
                          <option value="">Choose an adjustment…</option>
                          {props.adjustmentKinds.map((k) => (
                            <option key={k.name} value={k.name}>
                              {k.name}
                              {k.ledgerCode ? ` · ${k.ledgerCode}` : ""}
                            </option>
                          ))}
                          {a.reason &&
                          !props.adjustmentKinds.some((k) => k.name === a.reason) ? (
                            <option value={a.reason}>{a.reason}</option>
                          ) : null}
                        </select>
                      ) : (
                        <input
                          disabled={locked}
                          value={a.reason}
                          placeholder="Reason — set up kinds in Settings → Adjustments"
                          onChange={(e) => patchRow({ reason: e.target.value })}
                          className="h-9 w-full bg-transparent px-3 text-sm text-[#3D421F] outline-none focus:bg-[var(--venue-secondary,#F0F3DD)]/40 disabled:opacity-60"
                        />
                      )}
                    </td>
                    <td className="border border-black/15 px-2 py-1 text-center">
                      {locked ? (
                        <TypeBadge side={side} />
                      ) : (
                        <div className="inline-flex rounded-md bg-black/[0.04] p-0.5 text-xs font-semibold">
                          {(["DB", "CR", "NEU"] as const).map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              title={
                                opt === "NEU"
                                  ? "Recorded only — no effect on cost of sales"
                                  : undefined
                              }
                              onClick={() => patchRow(sideRow(opt))}
                              className={`whitespace-nowrap rounded px-2 py-1 transition ${
                                side === opt
                                  ? SIDE_ACTIVE[opt]
                                  : "text-black/55 hover:text-black"
                              }`}
                            >
                              {SIDE_LABEL[opt]}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="border border-black/15 p-0">
                      <div className="flex items-center">
                        {isDeduction ? (
                          <span className="pl-3 text-sm font-medium text-red-700">(-)</span>
                        ) : isNeutral ? (
                          <span className="pl-3 text-sm font-medium text-slate-500">(=)</span>
                        ) : null}
                        <MoneyInput
                          bare
                          disabled={locked}
                          value={amount}
                          onValue={(v) =>
                            patchRow({
                              amount_gs: isDeduction ? -Math.abs(v) : Math.abs(v),
                            })
                          }
                        />
                      </div>
                    </td>
                    {!locked ? (
                      <td className="border border-black/15 text-center">
                        <button
                          type="button"
                          aria-label="Remove adjustment"
                          onClick={() => setAdjustments((arr) => arr.filter((_, j) => j !== i))}
                          className="text-black/30 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {adjustments.length === 0 &&
              !autoAdj &&
              props.transferAdjustments.length === 0 ? (
                <tr>
                  <td
                    colSpan={locked ? 4 : 5}
                    className="border border-black/15 px-3 py-4 text-center text-sm text-black/40"
                  >
                    No adjustments.
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot className="text-[#3D421F]">
              <tr className="bg-black/[0.02]">
                <td colSpan={3} className="border border-black/15 px-3 py-1.5 text-right text-black/60">
                  Total additions
                </td>
                <td className="border border-black/15 px-3 py-1.5 text-right tabular-nums">
                  {MONEY(additionsTotal)}
                </td>
                {!locked ? <td className="border border-black/15" /> : null}
              </tr>
              <tr className="bg-black/[0.02]">
                <td colSpan={3} className="border border-black/15 px-3 py-1.5 text-right text-black/60">
                  Total deductions
                </td>
                <td className="border border-black/15 px-3 py-1.5 text-right tabular-nums text-red-700">
                  {SIGNED(-deductionsTotal)}
                </td>
                {!locked ? <td className="border border-black/15" /> : null}
              </tr>
              {neutralTotal > 0 ? (
                <tr className="bg-black/[0.02]">
                  <td colSpan={3} className="border border-black/15 px-3 py-1.5 text-right text-black/60">
                    Neutral (recorded, not in cost of sales)
                  </td>
                  <td className="border border-black/15 px-3 py-1.5 text-right tabular-nums text-slate-500">
                    (=) {MONEY(neutralTotal)}
                  </td>
                  {!locked ? <td className="border border-black/15" /> : null}
                </tr>
              ) : null}
              <tr className="bg-black/[0.04] font-semibold">
                <td colSpan={3} className="border border-black/15 px-3 py-2 text-right">
                  Net adjustments (additions − deductions)
                </td>
                <td className="border border-black/15 px-3 py-2 text-right tabular-nums">
                  {SIGNED(adjustmentsTotal)}
                </td>
                {!locked ? <td className="border border-black/15" /> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Action bar */}
      {!locked ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-black/5 pt-4">
          <button
            type="button"
            disabled={pending}
            onClick={() => router.push(listHref)}
            title="Discard changes and return to the Cost Runs table"
            className="mr-auto inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-black/60 hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-50"
          >
            Cancel
          </button>
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
          {props.existing?.status === "pending_approval" && props.canApprove ? (
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

      {leaveDialogOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
              role="presentation"
              onMouseDown={(e) => {
                if (!pending && e.target === e.currentTarget)
                  setLeaveDialogOpen(false);
              }}
            >
              <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="cos-leave-title"
                className="w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-xl"
              >
                <h2
                  id="cos-leave-title"
                  className="font-serif text-xl text-[#3D421F]"
                >
                  Unsaved changes
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-black/65">
                  You have changes to the W{props.weekNo} cost run that
                  haven&apos;t been saved.
                </p>
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setLeaveDialogOpen(false);
                      leave();
                    }}
                    className="h-9 rounded-md border border-red-200 bg-red-50 px-3.5 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    autoFocus
                    onClick={() => setLeaveDialogOpen(false)}
                    className="h-9 rounded-md border border-black/10 bg-white px-3.5 text-sm font-medium text-[#3D421F] hover:bg-black/[0.03] disabled:opacity-50"
                  >
                    Keep editing
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      save(() => {
                        setLeaveDialogOpen(false);
                        leave();
                      })
                    }
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--venue-primary,#818a40)] px-3.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {pending ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/**
 * Money input: shows 1,234.00 when idle; plain digits while typing.
 * Accepts commas in pasted/typed values.
 */
function MoneyInput({
  value,
  onValue,
  disabled,
  bare,
}: {
  value: number;
  onValue: (n: number) => void;
  disabled?: boolean;
  /** Borderless, for table cells. */
  bare?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      value={draft ?? MONEY(value)}
      onFocus={(e) => {
        setDraft(value ? String(value) : "");
        const el = e.currentTarget;
        requestAnimationFrame(() => el.select());
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseFloat(e.target.value.replace(/,/g, ""));
        onValue(Number.isFinite(n) ? n : 0);
      }}
      onBlur={() => setDraft(null)}
      className={
        bare
          ? "h-9 w-full bg-transparent px-3 text-right text-sm tabular-nums text-[#3D421F] outline-none focus:bg-[var(--venue-secondary,#F0F3DD)]/40 disabled:opacity-60"
          : "mt-1 flex h-10 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-right text-sm tabular-nums text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20 disabled:cursor-not-allowed disabled:opacity-50"
      }
    />
  );
}

function Field({
  label,
  value,
  onValue,
  locked,
  hint,
}: {
  label: string;
  value: number;
  onValue: (n: number) => void;
  locked: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="text-xs text-black/50">{label}</label>
      <MoneyInput value={value} onValue={onValue} disabled={locked} />
      {hint ? <p className="mt-0.5 text-xs text-black/40">{hint}</p> : null}
    </div>
  );
}

type EquationTerm = { label: string; value: number; op?: "+" | "−" };

/**
 * "Result = a − b + c" as labelled figures. Renders exactly 9 grid cells
 * (result, =, then up to 4 operand/operator pairs) so rows line up.
 */
function Equation({
  result,
  terms,
}: {
  result: { label: string; value: number };
  terms: EquationTerm[];
}) {
  const cells: React.ReactNode[] = [
    <EquationValue key="r" label={result.label} value={result.value} strong />,
    <span key="eq" className="text-center text-lg text-black/35">=</span>,
  ];
  for (let i = 0; i < 4; i++) {
    const t = terms[i];
    if (i > 0) {
      cells.push(
        <span key={`op${i}`} className="text-center text-lg text-black/35">
          {t ? (t.op ?? "+") : ""}
        </span>,
      );
    }
    cells.push(
      t ? (
        <EquationValue key={`t${i}`} label={t.label} value={t.value} />
      ) : (
        <span key={`t${i}`} />
      ),
    );
  }
  return <>{cells}</>;
}

function EquationValue({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <span
      className={`flex h-12 w-full flex-col justify-center rounded-md border px-2.5 leading-tight ${
        strong
          ? "border-[var(--venue-primary,#818a40)]/30 bg-[var(--venue-secondary,#F0F3DD)]/60"
          : "border-black/10 bg-white"
      }`}
    >
      <span className="truncate text-[10px] uppercase tracking-wide text-black/45">
        {label}
      </span>
      <span
        className={`tabular-nums text-[#3D421F] ${strong ? "font-bold" : "font-medium"}`}
      >
        {SIGNED(value)}
      </span>
    </span>
  );
}

const SIDE_LABEL: Record<CosAdjustmentSide, string> = {
  DB: "(+) Addition",
  CR: "(-) Deduction",
  NEU: "(=) Neutral",
};

const SIDE_ACTIVE: Record<CosAdjustmentSide, string> = {
  DB: "bg-emerald-600 text-white",
  CR: "bg-red-600 text-white",
  NEU: "bg-slate-500 text-white",
};

const SIDE_BADGE: Record<CosAdjustmentSide, string> = {
  DB: "bg-emerald-100 text-emerald-800",
  CR: "bg-red-100 text-red-800",
  NEU: "bg-slate-100 text-slate-700",
};

function TypeBadge({
  deduction,
  side,
}: {
  deduction?: boolean;
  side?: CosAdjustmentSide;
}) {
  const s: CosAdjustmentSide = side ?? (deduction ? "CR" : "DB");
  return (
    <span
      className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${SIDE_BADGE[s]}`}
    >
      {SIDE_LABEL[s]}
    </span>
  );
}

function ReadOnlyField({
  label,
  value,
  hint,
  muted,
}: {
  label: string;
  value: string;
  hint?: string;
  muted?: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-black/50">{label}</label>
      <div
        className={`mt-1 flex h-10 items-center justify-end rounded-md border border-black/10 bg-black/[0.03] px-3 text-sm ${
          muted ? "text-black/40" : "text-[#3D421F]"
        }`}
      >
        {value}
      </div>
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
