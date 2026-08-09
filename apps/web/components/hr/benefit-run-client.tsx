"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  FileDown,
  Search,
  X,
} from "lucide-react";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { StaffPhotoThumbnail } from "@/components/hr/staff-photo-thumbnail";
import { Button } from "@/components/ui/button";
import {
  finalizeBenefitRun,
  recalculateBenefitRun,
  saveBenefitRunDraft,
  updateBenefitRunAsphKpiThreshold,
  updateBenefitRunDepartmentShares,
  updateBenefitStaffOverride,
} from "@/lib/actions/hr-benefits";
import {
  BENEFIT_RUN_STATUS_LABELS,
  floorPayoutToAed5,
  formatBenefitMonthLabel,
  sumAed5RoundingRemainder,
  type BenefitContributor,
  type BenefitKind,
  type BenefitRunStatus,
  type BenefitRunTotals,
  type DisciplinaryWarningLevel,
  type GratuityDisciplinaryDeduction,
  type WaiterCcTipOutMode,
} from "@/lib/hr/benefits";
import { exportBenefitRunPdf } from "@/lib/hr/benefit-run-export";
import { cn } from "@/lib/utils";
import {
  segmentedSubNavLinkClass,
  segmentedSubNavShellClass,
} from "@/lib/sub-nav-ui";

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

type PayoutDisplayMode = "rounded" | "exact";

function displayPayoutAmount(
  amount: number,
  mode: PayoutDisplayMode,
): number {
  return mode === "rounded" ? floorPayoutToAed5(amount) : round2(amount);
}

function daysInBenefitMonth(benefitMonth: string): number {
  const iso = String(benefitMonth).slice(0, 10);
  const [year, month] = iso.split("-").map(Number);
  if (!year || !month) return 0;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export type BenefitAllocationView = {
  id: string;
  staff_id: string;
  full_name: string | null;
  emp_no: string | null;
  photo_url: string | null;
  department_name: string | null;
  position_name: string | null;
  amount: number;
  points: number | null;
  worked_days: number | null;
  status: string;
  meta: Record<string, unknown> | null;
};

type SortKey =
  | "emp_no"
  | "full_name"
  | "position_name"
  | "department_name"
  | "points"
  | "worked_days"
  | "deduction"
  | "amount"
  | "status";

type SortDir = "asc" | "desc";

type AllocationViewMode = "department" | "all";

type ContributorSortKey =
  | "empNo"
  | "name"
  | "position"
  | "departmentName"
  | "workedDays"
  | "ccCollected"
  | "cashCollected"
  | "obtain"
  | "asph"
  | "tipOutPercent"
  | "deduction"
  | "contributedToPool"
  | "retain";

type DeptOrderItem = { key: string; label: string; percent?: number };

/** Stable identity so effects keyed on the prop don't re-run every render. */
const NO_DEPARTMENT_ORDER: DeptOrderItem[] = [];

function samePercents(
  a: Record<string, number>,
  b: Record<string, number>,
): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key] === b[key]);
}

const moneyColGrayTh =
  "w-[7.75rem] max-w-[7.75rem] bg-black/[0.06] px-2 py-2.5 font-medium text-right text-[#3D421F]";
const moneyColGrayTd =
  "w-[7.75rem] max-w-[7.75rem] bg-black/[0.04] px-2 py-2.5 text-right tabular-nums font-semibold text-[#3D421F]";
const moneyColRoundedTh =
  "w-[12.25rem] max-w-[12.25rem] bg-[var(--venue-primary,#818a40)]/12 px-2 py-2.5 font-medium text-right leading-tight text-[#3D421F]";
const moneyColRoundedTd =
  "w-[12.25rem] max-w-[12.25rem] bg-[var(--venue-primary,#818a40)]/10 px-2 py-2.5 text-right tabular-nums font-semibold text-[#3D421F]";

export type PoolContributionRule = {
  waiterCashPoolPercent: number;
  waiterCcTipOutMode: WaiterCcTipOutMode;
  waiterCcCollectionTipOutPercent: number;
  waiterCcTipOutPctWhenKpiMet: number;
  waiterCcTipOutPctWhenKpiMissed: number;
  asphKpiEnabled: boolean;
  barCcPoolPercent: number;
  barCcBarStaffPercent: number;
  barCashEqualSplit: boolean;
};

export type PoolDeductionRule = {
  osePercent: number;
  activitiesPercent: number;
  runnerHousekeeperPercent: number;
};

function waiterCcTipOutLabel(rule: PoolContributionRule): string {
  if (rule.waiterCcTipOutMode === "asph_kpi") {
    if (rule.asphKpiEnabled) {
      return `ASPH KPI tip-out of gross sales (${Number(rule.waiterCcTipOutPctWhenKpiMet) || 0}% when met / ${Number(rule.waiterCcTipOutPctWhenKpiMissed) || 0}% when missed), capped at CC tips collected`;
    }
    return `ASPH tip-out of gross sales (${Number(rule.waiterCcTipOutPctWhenKpiMissed) || 0}%, KPI currently disabled), capped at CC tips collected`;
  }
  return `${Number(rule.waiterCcCollectionTipOutPercent) || 0}% of CC tip collections`;
}

function PolicyDisclosure({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-sm font-medium text-[#3D421F]/80 underline-offset-2 hover:underline"
      >
        {label}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="mt-2 space-y-2 text-sm leading-relaxed text-black/55">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function obtainOf(row: BenefitAllocationView): number {
  const meta = (row.meta ?? {}) as {
    obtain?: number;
    waiter?: {
      cashCollected?: number;
      ccCollected?: number;
      barCash?: number;
      barCcPool?: number;
      barCcRetain?: number;
    } | null;
  };
  if (meta.obtain != null && Number.isFinite(Number(meta.obtain))) {
    return Number(meta.obtain) || 0;
  }
  const waiter = meta.waiter;
  if (waiter) {
    const cash =
      (Number(waiter.cashCollected) || 0) || (Number(waiter.barCash) || 0);
    const cc =
      (Number(waiter.ccCollected) || 0) ||
      (Number(waiter.barCcPool) || 0) + (Number(waiter.barCcRetain) || 0);
    return cash + cc;
  }
  return 0;
}

function retainOf(
  row: BenefitAllocationView | null | undefined,
  obtain: number,
  contributedToPool: number,
): number {
  if (row) {
    const meta = (row.meta ?? {}) as {
      retain?: number;
      waiter?: {
        cashRetain?: number;
        ccRetain?: number;
        barCcRetain?: number;
        barCash?: number;
      } | null;
    };
    if (meta.retain != null && Number.isFinite(Number(meta.retain))) {
      return Math.max(0, Number(meta.retain) || 0);
    }
    const waiter = meta.waiter;
    if (waiter) {
      return Math.max(
        0,
        round2(
          (Number(waiter.cashRetain) || 0) +
            (Number(waiter.ccRetain) || 0) +
            (Number(waiter.barCcRetain) || 0) +
            (Number(waiter.barCash) || 0),
        ),
      );
    }
  }
  return Math.max(0, round2(obtain - contributedToPool));
}

function poolShareOf(row: BenefitAllocationView): number {
  const meta = (row.meta ?? {}) as { poolShare?: number };
  return Math.max(0, Number(meta.poolShare) || 0);
}

function deductionPctOf(row: BenefitAllocationView): number {
  const meta = (row.meta ?? {}) as { disciplinaryPercent?: number };
  return Number(meta.disciplinaryPercent) || 0;
}

function warningLevelOf(
  row: BenefitAllocationView,
): DisciplinaryWarningLevel | null {
  const meta = (row.meta ?? {}) as { warningLevel?: string | null };
  const level = meta.warningLevel;
  if (
    level === "verbal" ||
    level === "first_written" ||
    level === "second_written" ||
    level === "final"
  ) {
    return level;
  }
  return null;
}

function departmentLabelOf(
  row: BenefitAllocationView,
  departmentOrder: DeptOrderItem[],
): string {
  const meta = (row.meta ?? {}) as {
    departmentKey?: string | null;
    departmentLabel?: string | null;
  };
  if (meta.departmentLabel) return String(meta.departmentLabel);
  if (meta.departmentKey) {
    const match = departmentOrder.find((d) => d.key === meta.departmentKey);
    if (match) return match.label;
  }
  return row.department_name?.trim() || "Unassigned";
}

function departmentKeyOf(
  row: BenefitAllocationView,
  departmentOrder: DeptOrderItem[],
): string {
  const meta = (row.meta ?? {}) as { departmentKey?: string | null };
  if (meta.departmentKey) return String(meta.departmentKey);
  const label = departmentLabelOf(row, departmentOrder);
  const match = departmentOrder.find(
    (d) => d.label.toLowerCase() === label.toLowerCase(),
  );
  return match?.key ?? `name:${label.toLowerCase()}`;
}

/** Split `targetTotal`% across departments by pool weight (points × days). */
function percentsByPoolWeight(
  rows: { key: string; totalWeight: number; staffCount: number }[],
  targetTotal = 100,
): Record<string, number> {
  const totalWeight = rows.reduce((s, r) => s + Math.max(0, r.totalWeight), 0);
  if (rows.length === 0) return {};
  const target = Math.max(0, round2(targetTotal));

  // Fall back to headcount when weights are missing (e.g. before calc).
  const basisTotal =
    totalWeight > 0
      ? totalWeight
      : rows.reduce((s, r) => s + Math.max(0, r.staffCount), 0);
  const basisOf = (r: { totalWeight: number; staffCount: number }) =>
    totalWeight > 0 ? Math.max(0, r.totalWeight) : Math.max(0, r.staffCount);

  if (basisTotal <= 0) {
    const eq = Math.round((target / rows.length) * 10) / 10;
    const out: Record<string, number> = {};
    let sum = 0;
    rows.forEach((r, i) => {
      const pct =
        i === rows.length - 1
          ? Math.round((target - sum) * 10) / 10
          : eq;
      out[r.key] = Math.max(0, pct);
      sum += out[r.key];
    });
    return out;
  }

  const raw = rows.map((r) => ({
    key: r.key,
    pct: (basisOf(r) / basisTotal) * target,
  }));
  const rounded = raw.map((r) => ({
    key: r.key,
    pct: Math.round(r.pct * 10) / 10,
  }));
  const sumRounded = rounded.reduce((s, r) => s + r.pct, 0);
  const drift = Math.round((target - sumRounded) * 10) / 10;
  if (rounded.length > 0) {
    rounded[rounded.length - 1] = {
      ...rounded[rounded.length - 1],
      pct: Math.max(
        0,
        Math.round((rounded[rounded.length - 1].pct + drift) * 10) / 10,
      ),
    };
  }
  return Object.fromEntries(rounded.map((r) => [r.key, r.pct]));
}

function percentsApproxMatch(
  a: Record<string, number>,
  b: Record<string, number>,
  keys: string[],
  tol = 0.15,
): boolean {
  if (keys.length === 0) return true;
  return keys.every(
    (k) => Math.abs((Number(a[k]) || 0) - (Number(b[k]) || 0)) < tol,
  );
}

function sortValue(
  row: BenefitAllocationView,
  key: SortKey,
): string | number {
  switch (key) {
    case "emp_no":
      return (row.emp_no ?? "").toLowerCase();
    case "full_name":
      return (row.full_name ?? "").toLowerCase();
    case "position_name":
      return (row.position_name ?? "").toLowerCase();
    case "department_name":
      return (row.department_name ?? "").toLowerCase();
    case "points":
      return row.points ?? -Infinity;
    case "worked_days":
      return row.worked_days ?? -Infinity;
    case "deduction":
      return deductionPctOf(row);
    case "amount":
      return row.amount;
    case "status":
      return row.status.toLowerCase();
  }
}

function SortLabel<K extends string>({
  label,
  sortKey,
  activeKey,
  sortDir,
  onSort,
  align = "start",
}: {
  label: string;
  sortKey: K;
  activeKey: K;
  sortDir: SortDir;
  onSort: (key: K) => void;
  align?: "start" | "end" | "center";
}) {
  const active = activeKey === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-[#3D421F]",
        align === "end" && "w-full justify-end",
        align === "center" && "w-full justify-center",
      )}
      aria-label={`Sort by ${label}`}
    >
      <span>{label}</span>
      {active ? (
        sortDir === "asc" ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[var(--venue-primary,#818a40)]" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--venue-primary,#818a40)]" />
        )
      ) : (
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-black/25" />
      )}
    </button>
  );
}

function PointsCell({
  row,
  canEdit,
  disabled,
  onSave,
}: {
  row: BenefitAllocationView;
  canEdit: boolean;
  disabled: boolean;
  onSave: (points: number) => void;
}) {
  const display = row.points == null ? "" : String(row.points);
  const overridden = Boolean(
    (row.meta as { pointsOverridden?: boolean } | null)?.pointsOverridden,
  );

  if (!canEdit) {
    return (
      <span className="inline-block tabular-nums">
        {row.points ?? "—"}
        {overridden ? (
          <span className="ml-1 text-[10px] font-medium uppercase text-black/35">
            edit
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <input
      key={`${row.staff_id}-${display}`}
      type="number"
      min={0}
      step="0.1"
      inputMode="decimal"
      defaultValue={display}
      disabled={disabled}
      onBlur={(e) => {
        const next = Number(e.target.value);
        if (!Number.isFinite(next) || next < 0) {
          e.target.value = display;
          return;
        }
        if (round2(next) === round2(Number(row.points) || 0)) return;
        onSave(round2(next));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn(
        "mx-auto block h-8 w-16 rounded-md border border-black/10 bg-white px-2 text-center text-sm tabular-nums text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20 disabled:bg-black/[0.03] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        overridden && "border-[var(--venue-primary)]/40",
      )}
      aria-label={`Points for ${row.full_name ?? row.emp_no ?? "staff"}`}
    />
  );
}

function DeductionCell({
  row,
  options,
  canEdit,
  disabled,
  onSave,
}: {
  row: BenefitAllocationView;
  options: GratuityDisciplinaryDeduction[];
  canEdit: boolean;
  disabled: boolean;
  onSave: (level: DisciplinaryWarningLevel | null) => void;
}) {
  const level = warningLevelOf(row);
  const pct = deductionPctOf(row);

  if (!canEdit) {
    return (
      <span className="tabular-nums text-black/70">
        {pct > 0 ? `${pct}%` : "—"}
      </span>
    );
  }

  return (
    <select
      value={level ?? ""}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value;
        const next =
          v === "verbal" ||
          v === "first_written" ||
          v === "second_written" ||
          v === "final"
            ? v
            : null;
        if (next === level) return;
        onSave(next);
      }}
      className="h-8 max-w-[9.5rem] rounded-md border border-black/10 bg-white px-1.5 text-xs text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20 disabled:bg-black/[0.03]"
      aria-label={`Disciplinary deduction for ${row.full_name ?? row.emp_no ?? "staff"}`}
    >
      <option value="">None — 0%</option>
      {options.map((opt) => (
        <option key={opt.level} value={opt.level}>
          {opt.label} — {opt.percent}%
        </option>
      ))}
    </select>
  );
}

export function BenefitRunClient({
  kind,
  run,
  allocations,
  canEdit,
  disciplinaryOptions = [],
  departmentOrder = NO_DEPARTMENT_ORDER,
  policyDepartmentPercents = {},
  poolContributionRule = null,
  poolDeductionRule = null,
  policyDeductionPercents = null,
  departmentAllocationMode = "fixed_percent",
  asphKpiThreshold = null,
  forecastAsphKpiThreshold = null,
  venueName = "Venue",
  venueLogoUrl = null,
  userDisplayName = "Unknown",
}: {
  kind: BenefitKind;
  run: {
    id: string;
    benefit_month: string;
    period_start: string;
    period_end: string;
    distribution_date: string | null;
    status: string;
    totals: BenefitRunTotals | Record<string, unknown> | null;
    notes: string | null;
  };
  allocations: BenefitAllocationView[];
  canEdit: boolean;
  disciplinaryOptions?: GratuityDisciplinaryDeduction[];
  departmentOrder?: DeptOrderItem[];
  /** Venue policy department % (Pay → Benefits), used to restore "Department %". */
  policyDepartmentPercents?: Record<string, number>;
  poolContributionRule?: PoolContributionRule | null;
  poolDeductionRule?: PoolDeductionRule | null;
  /** Venue policy deduction % used when restoring "Department %". */
  policyDeductionPercents?: PoolDeductionRule | null;
  /** Run snapshot: equal_point_value / bypass after Redistribution or Bypass. */
  departmentAllocationMode?:
    | "fixed_percent"
    | "equal_point_value"
    | "bypass_department";
  /** ASPH KPI threshold used for this run (from forecast or override). */
  asphKpiThreshold?: number | null;
  /** Sales Forecast venue ASPH target for the benefit month. */
  forecastAsphKpiThreshold?: number | null;
  venueName?: string;
  venueLogoUrl?: string | null;
  userDisplayName?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("amount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [contributorSortKey, setContributorSortKey] =
    useState<ContributorSortKey>("name");
  const [contributorSortDir, setContributorSortDir] =
    useState<SortDir>("asc");
  const [allocationView, setAllocationView] = useState<AllocationViewMode>(
    kind === "service_charge" ? "all" : "department",
  );
  const [deptPercents, setDeptPercents] = useState<Record<string, number>>(
    () =>
      Object.fromEntries(
        departmentOrder.map((d) => [d.key, Number(d.percent) || 0]),
      ),
  );
  const [payoutMode, setPayoutMode] =
    useState<PayoutDisplayMode>("rounded");
  const [deductionPercents, setDeductionPercents] = useState({
    osePercent: Number(poolDeductionRule?.osePercent) || 0,
    activitiesPercent: Number(poolDeductionRule?.activitiesPercent) || 0,
    runnerHousekeeperPercent:
      Number(poolDeductionRule?.runnerHousekeeperPercent) || 0,
  });
  const [redistributeOpen, setRedistributeOpen] = useState(false);
  const [dialogDeductions, setDialogDeductions] = useState({
    osePercent: Number(poolDeductionRule?.osePercent) || 0,
    activitiesPercent: Number(poolDeductionRule?.activitiesPercent) || 0,
    runnerHousekeeperPercent:
      Number(poolDeductionRule?.runnerHousekeeperPercent) || 0,
  });
  const [asphThresholdDraft, setAsphThresholdDraft] = useState(
    asphKpiThreshold != null && Number.isFinite(asphKpiThreshold)
      ? String(asphKpiThreshold)
      : "",
  );

  useEffect(() => {
    setAsphThresholdDraft(
      asphKpiThreshold != null && Number.isFinite(asphKpiThreshold)
        ? String(asphKpiThreshold)
        : "",
    );
  }, [asphKpiThreshold]);

  const showAsphContributorColumns =
    kind === "gratuity" &&
    poolContributionRule?.waiterCcTipOutMode === "asph_kpi";
  const contributorColSpan = showAsphContributorColumns ? 14 : 12;

  const totals = (run.totals ?? {}) as Partial<BenefitRunTotals> & {
    pool?: {
      waiterCashTipOut?: number;
      waiterCcTipOut?: number;
      barCcToPool?: number;
      barCcToBarStaff?: number;
      barCashToBarStaff?: number;
      disciplinaryFromContributors?: number;
      runnerHousekeeperFund?: number;
      ose?: number;
      activities?: number;
      byDepartment?: Record<string, number>;
    };
    contributors?: BenefitContributor[];
    warnings?: string[];
  };

  const listHref =
    kind === "gratuity"
      ? "/hr/benefits/gratuity"
      : "/hr/benefits/service-charge";
  const title =
    kind === "gratuity" ? "Gratuity run" : "Service charge run";
  const status =
    BENEFIT_RUN_STATUS_LABELS[run.status as BenefitRunStatus] ??
    run.status.replace(/_/g, " ");

  const displayWarnings = useMemo(() => {
    const source =
      warnings.length > 0 ? warnings : (totals.warnings ?? []);
    return source.filter(
      (w) =>
        !/No recorded OS&E \/ staff activities collections/i.test(w) &&
        !/Bar waiter ".+" has tips but is not linked to staff/i.test(w) &&
        // Service charge has no departmental split — drop warnings kept on
        // runs calculated under the old department policy.
        !(kind === "service_charge" && /^Department ".+" has /i.test(w)),
    );
  }, [kind, warnings, totals.warnings]);

  const canRecalc =
    canEdit &&
    !["applied_to_payroll", "cancelled"].includes(run.status);
  const canFinalize =
    canEdit &&
    ["draft", "calculated", "review"].includes(run.status);
  const canEditAllocations = canRecalc;
  const monthDays = daysInBenefitMonth(run.benefit_month);

  useEffect(() => {
    const next = Object.fromEntries(
      departmentOrder.map((d) => [d.key, Number(d.percent) || 0]),
    );
    setDeptPercents((prev) => (samePercents(prev, next) ? prev : next));
  }, [departmentOrder]);

  useEffect(() => {
    const next = {
      osePercent: Number(poolDeductionRule?.osePercent) || 0,
      activitiesPercent: Number(poolDeductionRule?.activitiesPercent) || 0,
      runnerHousekeeperPercent:
        Number(poolDeductionRule?.runnerHousekeeperPercent) || 0,
    };
    setDeductionPercents((prev) => (samePercents(prev, next) ? prev : next));
  }, [poolDeductionRule]);

  const departmentShareRows = useMemo(() => {
    const byDept = totals.pool?.byDepartment ?? {};
    const keys = departmentOrder.length
      ? departmentOrder.map((d) => d.key)
      : Object.keys(byDept);

    const stats = new Map<
      string,
      { staffCount: number; totalWeight: number }
    >();

    for (const row of allocations) {
      const meta = (row.meta ?? {}) as { waiter?: unknown };
      // Tip collectors retain outside the department pool — exclude from weight/%.
      if (kind === "gratuity" && meta.waiter) continue;

      const key = departmentKeyOf(row, departmentOrder);
      const points = Number(row.points) || 0;
      const days = Number(row.worked_days) || 0;
      const discPct = deductionPctOf(row);
      const discMult = Math.max(0, 1 - discPct / 100);
      const weight = points * days * discMult;
      const prev = stats.get(key) ?? { staffCount: 0, totalWeight: 0 };
      stats.set(key, {
        staffCount: prev.staffCount + 1,
        totalWeight: prev.totalWeight + weight,
      });
    }

    return keys.map((key) => {
      const order = departmentOrder.find((d) => d.key === key);
      const amount = Number(byDept[key]) || 0;
      const st = stats.get(key) ?? { staffCount: 0, totalWeight: 0 };
      return {
        key,
        label: order?.label ?? key.replace(/_/g, " "),
        percent: deptPercents[key] ?? (Number(order?.percent) || 0),
        staffCount: st.staffCount,
        totalWeight: st.totalWeight,
        amount,
      };
    });
  }, [
    allocations,
    departmentOrder,
    deptPercents,
    kind,
    totals.pool?.byDepartment,
  ]);

  const equalizePointValue =
    departmentAllocationMode === "equal_point_value" ||
    departmentAllocationMode === "bypass_department";

  const unifiedPointValue = useMemo(() => {
    const totalWeight = departmentShareRows.reduce(
      (s, r) => s + r.totalWeight,
      0,
    );
    const totalAmount = departmentShareRows.reduce((s, r) => s + r.amount, 0);
    if (totalWeight <= 0) return null;
    return round2(totalAmount / totalWeight);
  }, [departmentShareRows]);

  const departmentShareDisplayRows = useMemo(() => {
    return departmentShareRows.map((row) => {
      const pointValue = equalizePointValue
        ? unifiedPointValue
        : row.totalWeight > 0
          ? round2(row.amount / row.totalWeight)
          : null;
      const pointValueMonth =
        pointValue != null && monthDays > 0
          ? round2(pointValue * monthDays)
          : null;
      return { ...row, pointValue, pointValueMonth };
    });
  }, [
    departmentShareRows,
    equalizePointValue,
    unifiedPointValue,
    monthDays,
  ]);

  const reservedPoolPercent = round2(
    Math.max(0, deductionPercents.osePercent) +
      Math.max(0, deductionPercents.activitiesPercent),
  );
  const departmentPoolTarget = round2(Math.max(0, 100 - reservedPoolPercent));

  const shareMode: "policy" | "staff" = equalizePointValue
    ? "staff"
    : "policy";

  function saveDepartmentPercents(
    next: Record<string, number>,
    deductions?: {
      osePercent: number;
      activitiesPercent: number;
      runnerHousekeeperPercent: number;
    } | null,
    allocationMode?:
      | "fixed_percent"
      | "equal_point_value"
      | "bypass_department"
      | null,
  ) {
    if (!canEditAllocations) return;
    const shares = departmentOrder.map((d) => ({
      key: d.key,
      percent: Math.max(0, Number(next[d.key]) || 0),
    }));
    const sharesUnchanged = shares.every((s) => {
      const original =
        Number(departmentOrder.find((d) => d.key === s.key)?.percent) || 0;
      return Math.abs(s.percent - original) < 0.001;
    });
    const deductionsUnchanged =
      !deductions ||
      (Math.abs(
        deductions.osePercent - (Number(poolDeductionRule?.osePercent) || 0),
      ) < 0.001 &&
        Math.abs(
          deductions.activitiesPercent -
            (Number(poolDeductionRule?.activitiesPercent) || 0),
        ) < 0.001 &&
        Math.abs(
          deductions.runnerHousekeeperPercent -
            (Number(poolDeductionRule?.runnerHousekeeperPercent) || 0),
        ) < 0.001);
    const modeUnchanged =
      allocationMode == null || allocationMode === departmentAllocationMode;
    if (sharesUnchanged && deductionsUnchanged && modeUnchanged) return;

    setDeptPercents(next);
    if (deductions) setDeductionPercents(deductions);
    setError(null);
    startTransition(async () => {
      const result = await updateBenefitRunDepartmentShares(
        kind,
        run.id,
        shares,
        deductions ?? null,
        allocationMode ?? null,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setWarnings(result.warnings ?? []);
      router.refresh();
    });
  }

  function openRedistributeDialog() {
    if (!canEditAllocations || pending) return;
    setDialogDeductions({ ...deductionPercents });
    setRedistributeOpen(true);
  }

  function applyRedistribution() {
    const ose = Math.max(0, Number(dialogDeductions.osePercent) || 0);
    const activities = Math.max(
      0,
      Number(dialogDeductions.activitiesPercent) || 0,
    );
    const runner = Math.max(
      0,
      Number(dialogDeductions.runnerHousekeeperPercent) || 0,
    );
    if (ose + activities > 100) {
      setError("OS&E + Staff activities cannot exceed 100%.");
      return;
    }
    const target = round2(Math.max(0, 100 - ose - activities));
    const nextShares = percentsByPoolWeight(departmentShareRows, target);
    setRedistributeOpen(false);
    saveDepartmentPercents(
      nextShares,
      {
        osePercent: ose,
        activitiesPercent: activities,
        runnerHousekeeperPercent: runner,
      },
      "equal_point_value",
    );
  }

  function applyBypassDepartment() {
    if (!canEditAllocations || pending) return;
    // Keep displayed % as weight share of the full net pool (informational);
    // calculation ignores department pots and pays one global point rate.
    const nextShares = percentsByPoolWeight(departmentShareRows, 100);
    saveDepartmentPercents(nextShares, null, "bypass_department");
  }

  function toggleDepartmentShareMode() {
    if (!canEditAllocations || pending) return;
    const keys = departmentOrder.map((d) => d.key);
    const policyDed = policyDeductionPercents ?? poolDeductionRule;
    saveDepartmentPercents(
      Object.fromEntries(
        keys.map((key) => [
          key,
          Number(policyDepartmentPercents[key]) ||
            Number(departmentOrder.find((d) => d.key === key)?.percent) ||
            0,
        ]),
      ),
      policyDed
        ? {
            osePercent: Number(policyDed.osePercent) || 0,
            activitiesPercent: Number(policyDed.activitiesPercent) || 0,
            runnerHousekeeperPercent:
              Number(policyDed.runnerHousekeeperPercent) || 0,
          }
        : null,
      "fixed_percent",
    );
  }

  function saveAsphKpiThreshold() {
    if (!canEditAllocations || pending || kind !== "gratuity") return;
    const trimmed = asphThresholdDraft.trim();
    const next =
      trimmed === ""
        ? null
        : Math.max(0, Number(trimmed));
    if (trimmed !== "" && !Number.isFinite(next)) {
      setError("ASPH threshold must be a number.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateBenefitRunAsphKpiThreshold(run.id, next);
      if (!result.ok) {
        setError(result.error ?? "Could not update ASPH threshold.");
        return;
      }
      setWarnings(result.warnings ?? []);
      router.refresh();
    });
  }

  const contributors = useMemo(() => {
    type ContributorRow = BenefitContributor & {
      workedDays: number | null;
      obtain: number;
      retain: number | null;
      deductionPct: number;
      amount: number | null;
      asph: number | null;
      tipOutPercent: number | null;
      asphKpiMet: boolean | null;
      photoUrl: string | null;
      allocation: BenefitAllocationView | null;
    };

    const byStaff = new Map(allocations.map((row) => [row.staff_id, row]));

    function enrich(row: BenefitContributor): ContributorRow {
      const alloc = row.staffId ? byStaff.get(row.staffId) : undefined;
      const obtain =
        alloc != null
          ? obtainOf(alloc)
          : round2((Number(row.cashCollected) || 0) + (Number(row.ccCollected) || 0));
      // A collection source without a linked staff allocation has no payable
      // Retain. Do not infer a payout from Obtain − Pool Contribution.
      const retain =
        alloc != null
          ? retainOf(alloc, obtain, Number(row.contributedToPool) || 0)
          : null;
      const waiterMeta = alloc
        ? ((alloc.meta ?? {}) as {
            waiter?: {
              asph?: number | null;
              ccTipOutPercent?: number | null;
              asphKpiMet?: boolean | null;
            } | null;
          }).waiter
        : null;
      const asphRaw = Number(waiterMeta?.asph);
      const tipOutRaw = Number(waiterMeta?.ccTipOutPercent);
      return {
        ...row,
        workedDays: alloc?.worked_days ?? null,
        obtain,
        retain,
        deductionPct: alloc != null ? deductionPctOf(alloc) : 0,
        amount: alloc != null ? Number(alloc.amount) || 0 : null,
        asph: Number.isFinite(asphRaw) ? asphRaw : null,
        tipOutPercent: Number.isFinite(tipOutRaw) ? tipOutRaw : null,
        asphKpiMet:
          typeof waiterMeta?.asphKpiMet === "boolean"
            ? waiterMeta.asphKpiMet
            : null,
        photoUrl: alloc?.photo_url ?? null,
        allocation: alloc ?? null,
      };
    }

    let base: BenefitContributor[];
    if (Array.isArray(totals.contributors) && totals.contributors.length > 0) {
      base = [...totals.contributors];
    } else {
      // Fallback for runs calculated before contributors were persisted.
      base = [];
      for (const row of allocations) {
        const meta = (row.meta ?? {}) as {
          waiter?: {
            cashCollected?: number;
            ccCollected?: number;
            cashPool?: number;
            ccTipOut?: number;
            barCcPool?: number;
          } | null;
        };
        const waiter = meta.waiter;
        if (!waiter) continue;
        const cash = Number(waiter.cashCollected) || 0;
        const cc = Number(waiter.ccCollected) || 0;
        const toPool = round2(
          (Number(waiter.cashPool) || 0) +
            (Number(waiter.ccTipOut) || 0) +
            (Number(waiter.barCcPool) || 0),
        );
        if (cash <= 0 && cc <= 0 && toPool <= 0) continue;
        base.push({
          staffId: row.staff_id,
          empNo: row.emp_no,
          name: row.full_name ?? row.staff_id.slice(0, 8),
          position: row.position_name,
          departmentName: row.department_name,
          cashCollected: cash,
          ccCollected: cc,
          contributedToPool: toPool,
        });
      }
    }

    return base.map(enrich);
  }, [allocations, totals.contributors]);

  const sortedContributors = useMemo(() => {
    const dir = contributorSortDir === "asc" ? 1 : -1;
    return [...contributors].sort((a, b) => {
      const value = (row: (typeof contributors)[number]) => {
        switch (contributorSortKey) {
          case "empNo":
            return row.empNo ?? "";
          case "name":
            return row.name;
          case "position":
            return row.position ?? "";
          case "departmentName":
            return row.departmentName ?? "";
          case "workedDays":
            return row.workedDays ?? -Infinity;
          case "ccCollected":
            return row.ccCollected;
          case "cashCollected":
            return row.cashCollected;
          case "obtain":
            return row.obtain;
          case "asph":
            return row.asph ?? -Infinity;
          case "tipOutPercent":
            return row.tipOutPercent ?? -Infinity;
          case "deduction":
            return row.deductionPct;
          case "contributedToPool":
            return row.contributedToPool;
          case "retain":
            return row.retain ?? -Infinity;
        }
      };
      const av = value(a);
      const bv = value(b);
      if (typeof av === "number" && typeof bv === "number") {
        if (av === bv) return 0;
        return av < bv ? -dir : dir;
      }
      return (
        String(av).localeCompare(String(bv), undefined, {
          numeric: true,
          sensitivity: "base",
        }) * dir
      );
    });
  }, [contributors, contributorSortKey, contributorSortDir]);

  const contributorTotals = useMemo(() => {
    return contributors.reduce(
      (acc, row) => {
        acc.workedDays += Number(row.workedDays) || 0;
        acc.ccCollected += Number(row.ccCollected) || 0;
        acc.cashCollected += Number(row.cashCollected) || 0;
        acc.obtain += row.obtain;
        acc.contributedToPool += Number(row.contributedToPool) || 0;
        acc.retain += Number(row.retain) || 0;
        acc.roundedRetain += displayPayoutAmount(
          Number(row.retain) || 0,
          payoutMode,
        );
        return acc;
      },
      {
        workedDays: 0,
        ccCollected: 0,
        cashCollected: 0,
        obtain: 0,
        contributedToPool: 0,
        retain: 0,
        roundedRetain: 0,
      },
    );
  }, [contributors, payoutMode]);

  const contributorStaffIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of contributors) {
      if (row.staffId) ids.add(row.staffId);
    }
    return ids;
  }, [contributors]);

  /**
   * Allocations excluding retain-only tip collectors (shown in Contributors).
   * Bar staff collect tips but are paid from the pool / bar funds, so they stay.
   */
  const poolAllocationRows = useMemo(
    () =>
      kind === "gratuity"
        ? allocations.filter(
            (row) =>
              !contributorStaffIds.has(row.staff_id) || poolShareOf(row) > 0,
          )
        : allocations,
    [allocations, contributorStaffIds, kind],
  );

  const summaryCards =
    kind === "gratuity"
      ? [
          { label: "Waiter cash tips", value: formatMoney(totals.waiterCashCollected) },
          { label: "Waiter CC tips", value: formatMoney(totals.waiterCcCollected) },
          { label: "Pool net", value: formatMoney(totals.poolNet) },
          { label: "Distributed", value: formatMoney(totals.totalDistributed) },
        ]
      : (() => {
          const collected = Number(totals.serviceChargeCollected) || 0;
          const staffPct =
            Number(totals.serviceChargeStaffDistributablePercent) || 50;
          const staffPool =
            totals.serviceChargeStaffPool != null
              ? Number(totals.serviceChargeStaffPool)
              : Math.round(((collected * staffPct) / 100 + Number.EPSILON) * 100) /
                100;
          const expensesReserve =
            totals.serviceChargeExpensesReserve != null
              ? Number(totals.serviceChargeExpensesReserve)
              : Math.round((collected - staffPool + Number.EPSILON) * 100) / 100;
          return [
            {
              label: "Collected",
              value: formatMoney(collected),
            },
            {
              label: `Staff pool (${staffPct}%)`,
              value: formatMoney(staffPool),
            },
            {
              label: "Expenses reserve",
              value: formatMoney(expensesReserve),
            },
            {
              label: "Distributed",
              value: formatMoney(totals.totalDistributed),
            },
          ];
        })();

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = !q
      ? poolAllocationRows
      : poolAllocationRows.filter((row) => {
          const hay = [
            row.emp_no,
            row.full_name,
            row.department_name,
            row.position_name,
            row.status,
            departmentLabelOf(row, departmentOrder),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        });

    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (typeof av === "number" && typeof bv === "number") {
        if (av === bv) return 0;
        return av < bv ? -dir : dir;
      }
      return (
        String(av).localeCompare(String(bv), undefined, {
          numeric: true,
          sensitivity: "base",
        }) * dir
      );
    });
  }, [poolAllocationRows, search, sortKey, sortDir, departmentOrder]);

  const departmentGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        label: string;
        rows: BenefitAllocationView[];
        order: number;
      }
    >();

    for (const row of filteredSorted) {
      const key = departmentKeyOf(row, departmentOrder);
      const label = departmentLabelOf(row, departmentOrder);
      const existing = map.get(key);
      if (existing) {
        existing.rows.push(row);
        continue;
      }
      const orderIdx = departmentOrder.findIndex((d) => d.key === key);
      map.set(key, {
        key,
        label,
        rows: [row],
        order: orderIdx >= 0 ? orderIdx : 900 + map.size,
      });
    }

    return [...map.values()].sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.label.localeCompare(b.label);
    });
  }, [filteredSorted, departmentOrder]);

  const footerTotals = useMemo(() => {
    return filteredSorted.reduce(
      (acc, row) => {
        const amount = Number(row.amount) || 0;
        acc.points += Number(row.points) || 0;
        acc.workedDays += Number(row.worked_days) || 0;
        acc.amount += amount;
        acc.roundedAmount += displayPayoutAmount(amount, payoutMode);
        return acc;
      },
      { points: 0, workedDays: 0, amount: 0, roundedAmount: 0 },
    );
  }, [filteredSorted, payoutMode]);

  const roundingCollected = useMemo(() => {
    if (payoutMode === "exact") return 0;
    return sumAed5RoundingRemainder([
      ...poolAllocationRows.map((row) => Number(row.amount) || 0),
      ...contributors.map((row) => Number(row.retain) || 0),
    ]);
  }, [poolAllocationRows, contributors, payoutMode]);

  const indvGratuityLabel =
    payoutMode === "rounded" ? "Indv Rounded Gratuity" : "Indv Exact Gratuity";

  function onSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(
      key === "amount" ||
        key === "points" ||
        key === "worked_days" ||
        key === "deduction"
        ? "desc"
        : "asc",
    );
  }

  function onContributorSort(key: ContributorSortKey) {
    if (contributorSortKey === key) {
      setContributorSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setContributorSortKey(key);
    setContributorSortDir(
      key === "contributedToPool" ||
        key === "retain" ||
        key === "obtain" ||
        key === "ccCollected" ||
        key === "cashCollected" ||
        key === "workedDays" ||
        key === "deduction"
        ? "desc"
        : "asc",
    );
  }

  function saveOverride(
    staffId: string,
    patch: {
      tipPoints?: number | null;
      warningLevel?: DisciplinaryWarningLevel | null;
    },
  ) {
    setError(null);
    startTransition(async () => {
      const result = await updateBenefitStaffOverride(
        kind,
        run.id,
        staffId,
        patch,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setWarnings(result.warnings ?? []);
      router.refresh();
    });
  }

  const colCount = allocationView === "all" ? 9 : 8;
  const showDepartmentColumn = allocationView === "all";

  function renderAllocationRow(row: BenefitAllocationView) {
    const amount = Number(row.amount) || 0;
    const payoutAmount = displayPayoutAmount(amount, payoutMode);
    return (
      <tr
        key={row.id}
        className="hover:bg-[var(--venue-secondary,#F0F3DD)]/25"
      >
        <td className="px-3 py-2.5 tabular-nums text-black/60">
          {row.emp_no ?? "—"}
        </td>
        <td className="px-3 py-2.5 font-medium text-[#3D421F]">
          {row.full_name ?? row.staff_id.slice(0, 8)}
        </td>
        <td className="px-3 py-2.5 text-black/60">
          {row.position_name ?? "—"}
        </td>
        {showDepartmentColumn ? (
          <td className="px-3 py-2.5 text-black/60">
            {departmentLabelOf(row, departmentOrder)}
          </td>
        ) : null}
        <td className="px-3 py-2.5 text-center">
          <PointsCell
            row={row}
            canEdit={canEditAllocations}
            disabled={pending}
            onSave={(tipPoints) =>
              saveOverride(row.staff_id, { tipPoints })
            }
          />
        </td>
        <td className="px-3 py-2.5 text-center tabular-nums">
          {row.worked_days ?? "—"}
        </td>
        <td className="px-3 py-2.5 text-right">
          <DeductionCell
            row={row}
            options={disciplinaryOptions}
            canEdit={canEditAllocations}
            disabled={pending}
            onSave={(warningLevel) =>
              saveOverride(row.staff_id, { warningLevel })
            }
          />
        </td>
        <td className={moneyColGrayTd}>
          {formatMoney(amount)}
        </td>
        <td className={moneyColRoundedTd}>
          {formatMoney(payoutAmount)}
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-black/50">
            <Link href={listHref} className="underline-offset-2 hover:underline">
              ← {kind === "gratuity" ? "Gratuity" : "Service charge"} runs
            </Link>
          </p>
          <h2 className="mt-1 font-serif text-xl text-[#3D421F]">
            {formatBenefitMonthLabel(run.benefit_month)}
          </h2>
          <p className="mt-1 text-sm text-black/55">
            {title} · {run.period_start.slice(0, 10)} →{" "}
            {run.period_end.slice(0, 10)}
            {run.distribution_date
              ? ` · Distribute ${run.distribution_date.slice(0, 10)}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full border border-black/10 bg-[var(--venue-secondary,#F0F3DD)] px-3 py-1 text-xs font-medium text-[#3D421F]">
            {status}
          </span>
          {canRecalc ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await recalculateBenefitRun(kind, run.id);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setWarnings(result.warnings ?? []);
                  router.refresh();
                });
              }}
            >
              {pending ? "Working…" : "Recalculate"}
            </Button>
          ) : null}
          {canEditAllocations ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="border border-black/10"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const shares = departmentOrder.map((d) => ({
                    key: d.key,
                    percent: Math.max(
                      0,
                      Number(deptPercents[d.key] ?? d.percent) || 0,
                    ),
                  }));
                  const result = await saveBenefitRunDraft(kind, run.id, {
                    shares,
                    deductions: {
                      osePercent: deductionPercents.osePercent,
                      activitiesPercent: deductionPercents.activitiesPercent,
                      runnerHousekeeperPercent:
                        deductionPercents.runnerHousekeeperPercent,
                    },
                    allocationMode: departmentAllocationMode,
                  });
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setWarnings(result.warnings ?? []);
                  router.refresh();
                });
              }}
            >
              {pending ? "Saving…" : "Save"}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={exportingPdf || pending}
            className="border border-emerald-800/20 bg-emerald-700 text-white hover:bg-emerald-800 hover:opacity-100"
            onClick={() => {
              setError(null);
              setExportingPdf(true);
              void (async () => {
                try {
                  await exportBenefitRunPdf({
                    kind,
                    venueName,
                    venueLogoUrl,
                    benefitMonth: run.benefit_month,
                    periodStart: run.period_start,
                    periodEnd: run.period_end,
                    distributionDate: run.distribution_date,
                    statusLabel: status,
                    payoutMode,
                    summaryCards: summaryCards.map((card) => ({
                      label: card.label,
                      value: card.value,
                    })),
                    rows: poolAllocationRows.map((row) => ({
                      empNo: row.emp_no ?? "",
                      fullName: row.full_name ?? "",
                      position: row.position_name ?? "",
                      department: departmentLabelOf(row, departmentOrder),
                      points: row.points,
                      workedDays: row.worked_days,
                      deductionPercent: deductionPctOf(row),
                      retain: Number(row.amount) || 0,
                    })),
                    exportedAt: new Date(),
                    userDisplayName,
                  });
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "PDF export failed.",
                  );
                } finally {
                  setExportingPdf(false);
                }
              })();
            }}
          >
            <FileDown className="h-4 w-4" aria-hidden />
            {exportingPdf ? "Exporting…" : "PDF"}
          </Button>
          {canFinalize ? (
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await finalizeBenefitRun(kind, run.id);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  router.refresh();
                });
              }}
            >
              Finalize for payroll
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {displayWarnings.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">Calculation warnings</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-900/85">
            {displayWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-black/10 bg-white px-4 py-3 shadow-sm"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-black/45">
              {card.label}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-[#3D421F]">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {kind === "gratuity" && totals.pool ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,0.85fr)_minmax(0,1.5fr)] lg:items-stretch">
          <div className="flex h-full flex-col rounded-xl border border-black/10 bg-white p-3 shadow-sm">
            <h3 className="font-serif text-base text-[#3D421F]">
              Waiters collections
            </h3>
            <dl className="mt-2 flex-1 space-y-0.5 text-sm">
              {(
                [
                  ["Waiter cash tip-out", totals.pool.waiterCashTipOut],
                  ["Waiter CC tip-out", totals.pool.waiterCcTipOut],
                  [
                    "Bar CC collected",
                    Number(totals.barCcCollected) || 0,
                  ],
                  [
                    `Bar CC → general pool (${Number(poolContributionRule?.barCcPoolPercent) || 0}%)`,
                    totals.pool.barCcToPool,
                  ],
                  [
                    `Bar CC → bar staff (${Number(poolContributionRule?.barCcBarStaffPercent) || 0}%)`,
                    Number(totals.pool.barCcToBarStaff) > 0
                      ? Number(totals.pool.barCcToBarStaff)
                      : Math.max(
                          0,
                          round2(
                            (Number(totals.barCcCollected) || 0) -
                              (Number(totals.pool.barCcToPool) || 0),
                          ),
                        ),
                  ],
                  [
                    "Bar cash collected",
                    Number(totals.barCashCollected) || 0,
                  ],
                  [
                    "Contributor deductions → pool",
                    totals.pool.disciplinaryFromContributors,
                  ],
                ] as const
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-2 border-b border-black/5 py-1 last:border-b-0"
                >
                  <dt className="min-w-0 truncate text-black/55">{label}</dt>
                  <dd className="shrink-0 tabular-nums font-medium text-[#3D421F]">
                    {formatMoney(value)}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-auto border-t border-black/10 pt-2">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-[#3D421F]">Pool total</span>
                <span className="tabular-nums font-semibold text-[#3D421F]">
                  {formatMoney(
                    round2(
                      (Number(totals.pool.waiterCashTipOut) || 0) +
                        (Number(totals.pool.waiterCcTipOut) || 0) +
                        (Number(totals.pool.barCcToPool) || 0) +
                        (Number(totals.pool.disciplinaryFromContributors) ||
                          0),
                    ),
                  )}
                </span>
              </div>
              {/* Match Deductions button row height so Totals align */}
              <div className="mt-2 h-9" aria-hidden />
            </div>
          </div>

          <div className="flex h-full flex-col rounded-xl border border-black/10 bg-white p-3 shadow-sm">
            <h3 className="font-serif text-base text-[#3D421F]">Deductions</h3>
            <dl className="mt-2 flex-1 space-y-0.5 text-sm">
              {(
                [
                  [
                    `OS&E deduction (${Number(deductionPercents.osePercent) || 0}%)`,
                    totals.pool.ose,
                  ],
                  [
                    `Staff activities (${Number(deductionPercents.activitiesPercent) || 0}%)`,
                    totals.pool.activities,
                  ],
                  [
                    `Runner / HK fund (${Number(deductionPercents.runnerHousekeeperPercent) || 0}%)`,
                    totals.pool.runnerHousekeeperFund,
                  ],
                  [
                    "Rounding collection · floor to AED 5",
                    roundingCollected,
                  ],
                ] as const
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-2 border-b border-black/5 py-1 last:border-b-0"
                >
                  <dt className="min-w-0 text-black/55">{label}</dt>
                  <dd className="shrink-0 tabular-nums font-medium text-[#3D421F]">
                    {formatMoney(value)}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-auto border-t border-black/10 pt-2">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-[#3D421F]">Total</span>
                <span className="tabular-nums font-semibold text-[#3D421F]">
                  {formatMoney(
                    round2(
                      (Number(totals.pool.ose) || 0) +
                        (Number(totals.pool.activities) || 0) +
                        (Number(totals.pool.runnerHousekeeperFund) || 0) +
                        roundingCollected,
                    ),
                  )}
                </span>
              </div>
              <div className="mt-2 flex h-9 justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="border border-black/10"
                  onClick={() =>
                    setPayoutMode((m) =>
                      m === "rounded" ? "exact" : "rounded",
                    )
                  }
                >
                  {payoutMode === "rounded" ? "Exact Amount" : "Rounded"}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex h-full min-w-0 flex-col rounded-xl border border-black/10 bg-white p-3 shadow-sm">
            <h3 className="font-serif text-base text-[#3D421F]">
              Department shares
            </h3>
            <div className="mt-2 min-w-0 flex-1 overflow-x-auto">
              <table className="w-full min-w-[26rem] text-left text-sm">
                <thead>
                  <tr className="text-[11px] font-medium uppercase tracking-wide text-black/45">
                    <th className="pb-1.5 pr-2 font-medium">Department</th>
                    <th className="pb-1.5 px-1 text-right font-medium">Staff</th>
                    <th className="pb-1.5 px-1 text-right font-medium">%</th>
                    <th className="pb-1.5 px-1 text-right font-medium">Share</th>
                    <th className="pb-1.5 px-1 text-right font-medium">
                      1 pt value
                    </th>
                    <th className="pb-1.5 pl-1 text-right font-medium">
                      1 pt × {monthDays || "—"}d
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {departmentAllocationMode === "equal_point_value"
                    ? (
                        [
                          {
                            key: "ose",
                            label: "OS&E deduction",
                            percentKey: "osePercent" as const,
                            amount: Number(totals.pool?.ose) || 0,
                          },
                          {
                            key: "activities",
                            label: "Staff activities",
                            percentKey: "activitiesPercent" as const,
                            amount: Number(totals.pool?.activities) || 0,
                          },
                          {
                            key: "runner",
                            label: "Runner / HK fund",
                            percentKey: "runnerHousekeeperPercent" as const,
                            amount:
                              Number(totals.pool?.runnerHousekeeperFund) || 0,
                          },
                        ] as const
                      ).map((row) => (
                        <tr
                          key={row.key}
                          className="border-t border-black/5 align-middle bg-[var(--venue-secondary,#F0F3DD)]/35"
                        >
                          <td className="max-w-[7rem] truncate py-1.5 pr-2 text-black/70">
                            {row.label}
                          </td>
                          <td className="px-1 py-1.5 text-right text-black/35">
                            —
                          </td>
                          <td className="px-1 py-1.5 text-right">
                            {canEditAllocations ? (
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={0.1}
                                value={deductionPercents[row.percentKey]}
                                disabled={pending}
                                onChange={(e) => {
                                  const next = Math.max(
                                    0,
                                    Number(e.target.value) || 0,
                                  );
                                  setDeductionPercents((prev) => ({
                                    ...prev,
                                    [row.percentKey]: next,
                                  }));
                                }}
                                className="ml-auto h-7 w-14 rounded-md border border-black/10 bg-white px-1.5 text-right text-xs tabular-nums text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20 disabled:bg-black/[0.03]"
                                aria-label={`${row.label} percent`}
                              />
                            ) : (
                              <span className="tabular-nums text-[#3D421F]">
                                {deductionPercents[row.percentKey]}%
                              </span>
                            )}
                          </td>
                          <td className="px-1 py-1.5 text-right tabular-nums text-[#3D421F]">
                            {formatMoney(row.amount)}
                          </td>
                          <td className="px-1 py-1.5 text-right text-black/35">
                            —
                          </td>
                          <td className="py-1.5 pl-1 text-right text-black/35">
                            —
                          </td>
                        </tr>
                      ))
                    : null}
                  {departmentShareDisplayRows.map((row) => (
                    <tr
                      key={row.key}
                      className="border-t border-black/5 align-middle"
                    >
                      <td className="max-w-[7rem] truncate py-1.5 pr-2 capitalize text-black/70">
                        {row.label}
                      </td>
                      <td className="px-1 py-1.5 text-right tabular-nums text-[#3D421F]">
                        {row.staffCount}
                      </td>
                      <td className="px-1 py-1.5 text-right">
                        {canEditAllocations ? (
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={deptPercents[row.key] ?? row.percent}
                            disabled={pending}
                            onChange={(e) => {
                              const next = Math.max(
                                0,
                                Number(e.target.value) || 0,
                              );
                              setDeptPercents((prev) => ({
                                ...prev,
                                [row.key]: next,
                              }));
                            }}
                            onBlur={() =>
                              saveDepartmentPercents({
                                ...deptPercents,
                                [row.key]:
                                  deptPercents[row.key] ?? row.percent,
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            className="ml-auto h-7 w-14 rounded-md border border-black/10 bg-white px-1.5 text-right text-xs tabular-nums text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20 disabled:bg-black/[0.03]"
                            aria-label={`${row.label} share percent`}
                          />
                        ) : (
                          <span className="tabular-nums text-[#3D421F]">
                            {row.percent}%
                          </span>
                        )}
                      </td>
                      <td className="px-1 py-1.5 text-right tabular-nums text-[#3D421F]">
                        {formatMoney(row.amount)}
                      </td>
                      <td className="px-1 py-1.5 text-right tabular-nums font-medium text-[#3D421F]">
                        {row.pointValue != null
                          ? formatMoney(row.pointValue)
                          : "—"}
                      </td>
                      <td className="py-1.5 pl-1 text-right tabular-nums font-medium text-[#3D421F]">
                        {row.pointValueMonth != null
                          ? formatMoney(row.pointValueMonth)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-black/10">
                    <td className="pt-2 font-medium text-[#3D421F]">
                      Departments
                    </td>
                    <td className="px-1 pt-2 text-right tabular-nums font-semibold text-[#3D421F]">
                      {departmentShareRows.reduce(
                        (s, r) => s + r.staffCount,
                        0,
                      )}
                    </td>
                    <td className="px-1 pt-2 text-right tabular-nums font-semibold text-[#3D421F]">
                      {round2(
                        departmentShareRows.reduce(
                          (s, r) =>
                            s + (deptPercents[r.key] ?? r.percent),
                          0,
                        ),
                      )}
                      %
                      {departmentAllocationMode === "equal_point_value" ? (
                        <span className="ml-1 text-[10px] font-normal text-black/45">
                          / {departmentPoolTarget}%
                        </span>
                      ) : null}
                    </td>
                    <td className="px-1 pt-2 text-right tabular-nums font-semibold text-[#3D421F]">
                      {formatMoney(
                        departmentShareRows.reduce(
                          (s, r) => s + r.amount,
                          0,
                        ),
                      )}
                    </td>
                    <td className="px-1 pt-2 text-right text-black/35">—</td>
                    <td className="pt-2 pl-1 text-right text-black/35">—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {canEditAllocations ? (
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="border border-black/10"
                  disabled={pending}
                  onClick={openRedistributeDialog}
                >
                  Redistribution
                </Button>
                {shareMode === "staff" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="border border-black/10"
                    disabled={pending}
                    onClick={toggleDepartmentShareMode}
                  >
                    Department %
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  className={cn(
                    "border border-[var(--venue-primary,#818a40)]/40 bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90",
                    departmentAllocationMode === "bypass_department" &&
                      "ring-2 ring-[var(--venue-primary,#818a40)]/50 ring-offset-1",
                  )}
                  disabled={pending}
                  onClick={applyBypassDepartment}
                >
                  Bypass Department
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {kind === "gratuity" ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-serif text-lg text-[#3D421F]">Contributors</h3>
              <p className="text-sm text-black/55">
                Waiters and bar staff whose tip collections feed this month&apos;s
                distribution pool.
              </p>
              {poolContributionRule ? (
                <PolicyDisclosure label="Tip Out Policy">
                  <p>
                    Floor waiters tip out{" "}
                    <span className="font-medium text-[#3D421F]/80">
                      {Number(poolContributionRule.waiterCashPoolPercent) || 0}%
                    </span>{" "}
                    of cash tips and{" "}
                    <span className="font-medium text-[#3D421F]/80">
                      {waiterCcTipOutLabel(poolContributionRule)}
                    </span>{" "}
                    into the general tips pool. The rest stays as their{" "}
                    <span className="font-medium text-[#3D421F]/80">Retain</span>{" "}
                    after the Runner / HK cut below.
                  </p>
                  <p>
                    Bar CC tips split{" "}
                    <span className="font-medium text-[#3D421F]/80">
                      {Number(poolContributionRule.barCcPoolPercent) || 0}%
                    </span>{" "}
                    to the general tips pool and{" "}
                    <span className="font-medium text-[#3D421F]/80">
                      {Number(poolContributionRule.barCcBarStaffPercent) || 0}%
                    </span>{" "}
                    to a bar-staff fund, shared among bar staff by points ×
                    worked days × (1 − disciplinary %). Bar cash tips are split{" "}
                    <span className="font-medium text-[#3D421F]/80">
                      {poolContributionRule.barCashEqualSplit
                        ? "equally"
                        : "by the same weight rule"}
                    </span>{" "}
                    among all bar staff who worked the period.
                  </p>
                  <p>
                    Nothing is retained by the individual bar collector — bar
                    amounts are paid out through the Allocations table, so bar
                    staff also receive their normal Beverage department share.
                  </p>
                  <p>
                    After tip-out,{" "}
                    <span className="font-medium text-[#3D421F]/80">
                      {Number(deductionPercents.runnerHousekeeperPercent) || 0}%
                    </span>{" "}
                    of each floor waiter&apos;s remaining cash and CC is set aside
                    for the Runner / HK fund (paid to matching runner /
                    housekeeper roles). Disciplinary cuts then take a % of Retain
                    and move that amount into the general tips pool. OS&amp;E and
                    Staff activities % are also taken from Retain and added to
                    those deduction totals.
                  </p>
                </PolicyDisclosure>
              ) : null}
            </div>
            {showAsphContributorColumns ? (
              <div className="w-full max-w-sm shrink-0 rounded-lg border border-black/10 bg-white px-3 py-2 shadow-sm sm:w-96">
                <p className="text-xs font-medium uppercase tracking-wide text-black/45">
                  Month ASPH target
                </p>
                <div className="mt-1.5 flex items-center gap-3">
                  <p className="min-w-0 flex-1 text-[11px] leading-snug text-black/45">
                    {forecastAsphKpiThreshold != null
                      ? `Forecast default ${forecastAsphKpiThreshold.toFixed(2)}. Met ≥ target → ${Number(poolContributionRule?.waiterCcTipOutPctWhenKpiMet) || 0}% of sales; missed → ${Number(poolContributionRule?.waiterCcTipOutPctWhenKpiMissed) || 0}%.`
                      : `No Sales Forecast ASPH for this month. Met → ${Number(poolContributionRule?.waiterCcTipOutPctWhenKpiMet) || 0}% / missed → ${Number(poolContributionRule?.waiterCcTipOutPctWhenKpiMissed) || 0}% of sales.`}
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    {canEditAllocations ? (
                      <>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={asphThresholdDraft}
                          disabled={pending}
                          onChange={(e) =>
                            setAsphThresholdDraft(e.target.value)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              saveAsphKpiThreshold();
                            }
                          }}
                          className="h-8 w-24 rounded-md border border-black/10 bg-white px-2 text-sm tabular-nums text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20"
                          aria-label="ASPH KPI threshold for this month"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="border border-black/10"
                          disabled={pending}
                          onClick={saveAsphKpiThreshold}
                        >
                          Apply
                        </Button>
                      </>
                    ) : (
                      <span className="text-sm tabular-nums font-medium text-[#3D421F]">
                        {asphKpiThreshold != null
                          ? asphKpiThreshold.toFixed(2)
                          : "—"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
                <tr>
                  <th className="px-3 py-2.5 font-medium">
                    <SortLabel
                      label="Emp no"
                      sortKey="empNo"
                      activeKey={contributorSortKey}
                      sortDir={contributorSortDir}
                      onSort={onContributorSort}
                    />
                  </th>
                  <th className="px-3 py-2.5 font-medium">
                    <SortLabel
                      label="Name"
                      sortKey="name"
                      activeKey={contributorSortKey}
                      sortDir={contributorSortDir}
                      onSort={onContributorSort}
                    />
                  </th>
                  <th className="px-3 py-2.5 font-medium">
                    <SortLabel
                      label="Position"
                      sortKey="position"
                      activeKey={contributorSortKey}
                      sortDir={contributorSortDir}
                      onSort={onContributorSort}
                    />
                  </th>
                  <th className="px-3 py-2.5 font-medium">
                    <SortLabel
                      label="Department"
                      sortKey="departmentName"
                      activeKey={contributorSortKey}
                      sortDir={contributorSortDir}
                      onSort={onContributorSort}
                    />
                  </th>
                  <th className="px-3 py-2.5 font-medium text-center">
                    <SortLabel
                      label="Worked days"
                      sortKey="workedDays"
                      activeKey={contributorSortKey}
                      sortDir={contributorSortDir}
                      onSort={onContributorSort}
                      align="center"
                    />
                  </th>
                  <th className="px-3 py-2.5 font-medium text-right">
                    <SortLabel
                      label="CC tips"
                      sortKey="ccCollected"
                      activeKey={contributorSortKey}
                      sortDir={contributorSortDir}
                      onSort={onContributorSort}
                      align="end"
                    />
                  </th>
                  <th className="px-3 py-2.5 font-medium text-right">
                    <SortLabel
                      label="Cash tips"
                      sortKey="cashCollected"
                      activeKey={contributorSortKey}
                      sortDir={contributorSortDir}
                      onSort={onContributorSort}
                      align="end"
                    />
                  </th>
                  <th className="bg-[var(--venue-primary,#818a40)]/12 px-3 py-2.5 font-medium text-right text-[#3D421F]">
                    <SortLabel
                      label="Total Obtain"
                      sortKey="obtain"
                      activeKey={contributorSortKey}
                      sortDir={contributorSortDir}
                      onSort={onContributorSort}
                      align="end"
                    />
                  </th>
                  {showAsphContributorColumns ? (
                    <>
                      <th className="px-3 py-2.5 text-center font-medium">
                        <SortLabel
                          label="Waiter ASPH"
                          sortKey="asph"
                          activeKey={contributorSortKey}
                          sortDir={contributorSortDir}
                          onSort={onContributorSort}
                          align="center"
                        />
                      </th>
                      <th className="px-3 py-2.5 text-center font-medium leading-tight">
                        <SortLabel
                          label="Tip-out %"
                          sortKey="tipOutPercent"
                          activeKey={contributorSortKey}
                          sortDir={contributorSortDir}
                          onSort={onContributorSort}
                          align="center"
                        />
                      </th>
                    </>
                  ) : null}
                  <th className="px-3 py-2.5 font-medium text-right">
                    <SortLabel
                      label="Pool Contribution"
                      sortKey="contributedToPool"
                      activeKey={contributorSortKey}
                      sortDir={contributorSortDir}
                      onSort={onContributorSort}
                      align="end"
                    />
                  </th>
                  <th className="px-3 py-2.5 font-medium text-right">
                    <SortLabel
                      label="Deduction"
                      sortKey="deduction"
                      activeKey={contributorSortKey}
                      sortDir={contributorSortDir}
                      onSort={onContributorSort}
                      align="end"
                    />
                  </th>
                  <th className={moneyColGrayTh}>
                    <SortLabel
                      label="Retain"
                      sortKey="retain"
                      activeKey={contributorSortKey}
                      sortDir={contributorSortDir}
                      onSort={onContributorSort}
                      align="end"
                    />
                  </th>
                  <th className={moneyColRoundedTh}>
                    {indvGratuityLabel}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {sortedContributors.length === 0 ? (
                  <tr>
                    <td
                      colSpan={contributorColSpan}
                      className="px-3 py-10 text-center text-sm text-black/45"
                    >
                      No tip contributors for this period yet. Recalculate after
                      waiter sales are linked for the month.
                    </td>
                  </tr>
                ) : (
                  sortedContributors.map((row) => (
                    <tr
                      key={row.staffId ?? `${row.name}-${row.position ?? ""}`}
                      className="hover:bg-[var(--venue-secondary,#F0F3DD)]/25"
                    >
                      <td className="px-3 py-2.5 tabular-nums text-black/60">
                        <div className="flex items-center gap-2">
                          <StaffPhotoThumbnail
                            fullName={row.name}
                            photoUrl={row.photoUrl}
                            size="sm"
                            className="h-8 w-8 rounded-md text-[9px]"
                            empNo={row.empNo}
                            department={row.departmentName}
                            position={row.position}
                          />
                          <span>{row.empNo ?? "—"}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-medium text-[#3D421F]">
                        {row.name}
                      </td>
                      <td className="px-3 py-2.5 text-black/60">
                        {row.position ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-black/60">
                        {row.departmentName ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums">
                        {row.workedDays ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatMoney(row.ccCollected)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatMoney(row.cashCollected)}
                      </td>
                      <td className="bg-[var(--venue-primary,#818a40)]/10 px-3 py-2.5 text-right tabular-nums font-semibold text-[#3D421F]">
                        {formatMoney(row.obtain)}
                      </td>
                      {showAsphContributorColumns ? (
                        <>
                          <td className="px-3 py-2.5 text-center tabular-nums">
                            {row.asph != null ? Math.round(row.asph) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums">
                            {row.tipOutPercent != null ? (
                              <span
                                className="inline-flex flex-col items-center gap-1"
                                title={
                                  row.asphKpiMet == null
                                    ? undefined
                                    : row.asphKpiMet
                                      ? "ASPH KPI met"
                                      : "ASPH KPI missed"
                                }
                              >
                                <span>{row.tipOutPercent}%</span>
                                {row.asphKpiMet == null ? null : (
                                  <span
                                    className={cn(
                                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase leading-none",
                                      row.asphKpiMet
                                        ? "bg-emerald-100 text-emerald-700"
                                        : "bg-red-100 text-red-700",
                                    )}
                                  >
                                    {row.asphKpiMet ? "Met" : "Missed"}
                                  </span>
                                )}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </>
                      ) : null}
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                        {formatMoney(row.contributedToPool)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {row.allocation ? (
                          <DeductionCell
                            row={row.allocation}
                            options={disciplinaryOptions}
                            canEdit={canEditAllocations}
                            disabled={pending}
                            onSave={(warningLevel) => {
                              const alloc = row.allocation;
                              if (!alloc) return;
                              saveOverride(alloc.staff_id, { warningLevel });
                            }}
                          />
                        ) : row.deductionPct > 0 ? (
                          <span className="tabular-nums text-black/70">
                            {row.deductionPct}%
                          </span>
                        ) : (
                          <span className="text-black/40">—</span>
                        )}
                      </td>
                      <td className={`${moneyColGrayTd} font-medium`}>
                        {row.retain == null ? "—" : formatMoney(row.retain)}
                      </td>
                      <td className={moneyColRoundedTd}>
                        {row.retain == null
                          ? "—"
                          : formatMoney(
                              displayPayoutAmount(row.retain, payoutMode),
                            )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {sortedContributors.length > 0 ? (
                <tfoot className="border-t border-black/10 bg-black/[0.03]">
                  <tr className="text-sm font-medium text-[#3D421F]">
                    <td className="px-3 py-2.5" colSpan={4}>
                      {sortedContributors.length} contributor
                      {sortedContributors.length === 1 ? "" : "s"}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums">
                      {contributorTotals.workedDays || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatMoney(contributorTotals.ccCollected)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatMoney(contributorTotals.cashCollected)}
                    </td>
                    <td className="bg-[var(--venue-primary,#818a40)]/12 px-3 py-2.5 text-right tabular-nums font-semibold">
                      {formatMoney(contributorTotals.obtain)}
                    </td>
                    {showAsphContributorColumns ? (
                      <>
                        <td className="px-3 py-2.5" />
                        <td className="px-3 py-2.5" />
                      </>
                    ) : null}
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatMoney(contributorTotals.contributedToPool)}
                    </td>
                    <td className="px-3 py-2.5" />
                    <td className={`${moneyColGrayTh} font-medium tabular-nums`}>
                      {formatMoney(contributorTotals.retain)}
                    </td>
                    <td className={`${moneyColRoundedTh} font-semibold tabular-nums`}>
                      {formatMoney(contributorTotals.roundedRetain)}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-serif text-lg text-[#3D421F]">Allocations</h3>
            <p className="text-sm text-black/55">
              {kind === "service_charge"
                ? "Eligible staff share of the service charge pool for this period."
                : "Pool recipients other than tip collectors (listed under Contributors)."}
            </p>
            <PolicyDisclosure label="Distribution Policy">
              {kind === "service_charge" ? (
                <>
                  <p>
                    Service charge collected from Sales is split first:{" "}
                    <span className="font-medium text-[#3D421F]/80">
                      {Number(totals.serviceChargeStaffDistributablePercent) ||
                        50}
                      %
                    </span>{" "}
                    goes to the staff pool and the remainder is held as an
                    expenses reserve. The staff pool is paid out in full — the
                    grand total below always equals it.
                  </p>
                  <p>
                    Every eligible staff member is paid by{" "}
                    <span className="font-medium text-[#3D421F]/80">
                      points × worked days × (1 − disciplinary %)
                    </span>
                    , using one shared point rate for the whole venue. There is
                    no departmental split, and a disciplinary cut on one person
                    leaves more for the others.
                  </p>
                  <p>
                    Editable points and warning levels recalculate shares
                    immediately. Finalized runs feed Payroll as Service Charge
                    lines.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    After tip-outs land in the tips pool,{" "}
                    <span className="font-medium text-[#3D421F]/80">
                      {Number(deductionPercents.osePercent) || 0}%
                    </span>{" "}
                    OS&amp;E and{" "}
                    <span className="font-medium text-[#3D421F]/80">
                      {Number(deductionPercents.activitiesPercent) || 0}%
                    </span>{" "}
                    Staff activities are taken from the pool (and again from each
                    contributor&apos;s Retain). What remains is the net pool for
                    redistribution.
                  </p>
                  <p>
                    {departmentAllocationMode === "equal_point_value" ||
                    departmentAllocationMode === "bypass_department" ? (
                      <>
                        Bypass / redistribution mode uses one shared point rate
                        for the{" "}
                        <span className="font-medium text-[#3D421F]/80">
                          general
                        </span>{" "}
                        pool only — each eligible person&apos;s share is
                        proportional to{" "}
                        <span className="font-medium text-[#3D421F]/80">
                          points × worked days
                        </span>
                        , adjusted by disciplinary %.
                      </>
                    ) : (
                      <>
                        The general net pool is first split by department share
                        {departmentOrder.length > 0 ? (
                          <>
                            {" "}
                            (
                            {departmentOrder
                              .map(
                                (d) =>
                                  `${d.label} ${Number(deptPercents[d.key] ?? d.percent) || 0}%`,
                              )
                              .join(", ")}
                            )
                          </>
                        ) : null}
                        . Within each department, staff are paid by{" "}
                        <span className="font-medium text-[#3D421F]/80">
                          points × worked days × (1 − disciplinary %)
                        </span>
                        .
                      </>
                    )}{" "}
                    Floor waiters are excluded here — they are paid via Retain
                    under Contributors. A disciplinary cut on a pool recipient
                    lowers their weight so the same pot is shared among the
                    others.
                  </p>
                  <p>
                    Bar staff are listed here as well: on top of their Beverage
                    department share they receive the bar CC staff fund (by the
                    same weight rule) and an equal share of bar cash tips. Both
                    are paid regardless of the department mode.
                  </p>
                  <p>
                    Editable points and warning levels recalculate shares
                    immediately. Finalized runs feed Payroll as Tips lines.
                  </p>
                </>
              )}
            </PolicyDisclosure>
          </div>
          {kind === "gratuity" ? (
            <div
              className={cn(
                segmentedSubNavShellClass,
                "w-full max-w-sm shrink-0 sm:w-96",
              )}
              role="tablist"
              aria-label="Allocations view"
            >
              <button
                type="button"
                role="tab"
                aria-selected={allocationView === "department"}
                className={segmentedSubNavLinkClass(
                  allocationView === "department",
                )}
                onClick={() => setAllocationView("department")}
              >
                By department
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={allocationView === "all"}
                className={segmentedSubNavLinkClass(allocationView === "all")}
                onClick={() => setAllocationView("all")}
              >
                All staff
              </button>
            </div>
          ) : null}
        </div>

        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emp no, name, department, position…"
            className="h-10 w-full rounded-md border border-black/10 bg-white py-2 pl-9 pr-3 text-sm text-[#3D421F] outline-none transition placeholder:text-black/35 focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20"
            aria-label="Search allocations"
          />
        </div>

        <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
              <tr>
                <th className="px-3 py-2.5 font-medium">
                  <SortLabel
                    label="Emp no"
                    sortKey="emp_no"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">
                  <SortLabel
                    label="Name"
                    sortKey="full_name"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">
                  <SortLabel
                    label="Position"
                    sortKey="position_name"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                </th>
                {showDepartmentColumn ? (
                  <th className="px-3 py-2.5 font-medium">
                    <SortLabel
                      label="Department"
                      sortKey="department_name"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={onSort}
                    />
                  </th>
                ) : null}
                <th className="px-3 py-2.5 font-medium text-center">
                  <SortLabel
                    label="Points"
                    sortKey="points"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    align="center"
                  />
                </th>
                <th className="px-3 py-2.5 font-medium text-center">
                  <SortLabel
                    label="Worked days"
                    sortKey="worked_days"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    align="center"
                  />
                </th>
                <th className="px-3 py-2.5 font-medium text-right">
                  <SortLabel
                    label="Deduction"
                    sortKey="deduction"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    align="end"
                  />
                </th>
                <th className={moneyColGrayTh}>
                  <SortLabel
                    label="Retain"
                    sortKey="amount"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    align="end"
                  />
                </th>
                <th className={moneyColRoundedTh}>
                  {indvGratuityLabel}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {filteredSorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={colCount}
                    className="px-3 py-10 text-center text-sm text-black/45"
                  >
                    {allocations.length === 0
                      ? kind === "service_charge"
                        ? "No allocations yet. Recalculate after sales collections and attendance are available for this period."
                        : "No allocations yet. Recalculate after waiter tips and attendance are available for this period."
                      : poolAllocationRows.length === 0
                        ? "Tip collectors are listed under Contributors. No other pool recipients for this run."
                        : "No allocations match your search."}
                  </td>
                </tr>
              ) : allocationView === "department" ? (
                departmentGroups.map((group) => {
                  const sub = group.rows.reduce(
                    (acc, row) => {
                      const amount = Number(row.amount) || 0;
                      acc.points += Number(row.points) || 0;
                      acc.workedDays += Number(row.worked_days) || 0;
                      acc.amount += amount;
                      acc.roundedAmount += displayPayoutAmount(
                        amount,
                        payoutMode,
                      );
                      return acc;
                    },
                    {
                      points: 0,
                      workedDays: 0,
                      amount: 0,
                      roundedAmount: 0,
                    },
                  );
                  const sharePercent =
                    departmentOrder.find((d) => d.key === group.key)?.percent ??
                    null;

                  return (
                    <FragmentGroup key={group.key}>
                      <tr className="bg-[var(--venue-secondary,#F0F3DD)]/55 text-xs font-semibold text-[#3D421F]">
                        <td className="px-3 py-2" colSpan={3}>
                          <span className="uppercase tracking-wide">
                            {group.label}
                          </span>
                          {sharePercent != null ? (
                            <span className="ml-2 font-semibold normal-case tracking-normal tabular-nums text-[var(--venue-primary,#818a40)]">
                              {sharePercent}%
                            </span>
                          ) : null}
                          <span className="ml-2 font-normal normal-case tracking-normal text-black/45">
                            {group.rows.length} staff
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums">
                          {round2(sub.points)}
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums">
                          {round2(sub.workedDays)}
                        </td>
                        <td className="px-3 py-2" />
                        <td className={`${moneyColGrayTd} py-2`}>
                          {formatMoney(sub.amount)}
                        </td>
                        <td className={`${moneyColRoundedTd} py-2`}>
                          {formatMoney(sub.roundedAmount)}
                        </td>
                      </tr>
                      {group.rows.map((row) => renderAllocationRow(row))}
                    </FragmentGroup>
                  );
                })
              ) : (
                filteredSorted.map((row) => renderAllocationRow(row))
              )}
            </tbody>
            {filteredSorted.length > 0 ? (
              <tfoot className="border-t border-black/10 bg-black/[0.03]">
                <tr className="text-sm font-semibold text-[#3D421F]">
                  <td
                    className="px-3 py-2.5"
                    colSpan={showDepartmentColumn ? 4 : 3}
                  >
                    Grand total
                    {search.trim()
                      ? ` (${filteredSorted.length} of ${poolAllocationRows.length})`
                      : ` (${filteredSorted.length})`}
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums">
                    {round2(footerTotals.points)}
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums">
                    {round2(footerTotals.workedDays)}
                  </td>
                  <td className="px-3 py-2.5" />
                  <td className={`${moneyColGrayTh} font-semibold tabular-nums`}>
                    {formatMoney(footerTotals.amount)}
                  </td>
                  <td className={`${moneyColRoundedTh} font-semibold tabular-nums`}>
                    {formatMoney(footerTotals.roundedAmount)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </section>

      {run.notes ? (
        <p className="text-sm text-black/50">{run.notes}</p>
      ) : null}

      {redistributeOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
              role="presentation"
              onMouseDown={(event) => {
                if (!pending && event.target === event.currentTarget) {
                  setRedistributeOpen(false);
                }
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="redistribute-dialog-title"
                className="w-full max-w-md overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
                  <div>
                    <h2
                      id="redistribute-dialog-title"
                      className="font-serif text-xl text-[#3D421F]"
                    >
                      Redistribute pool
                    </h2>
                    <p className="mt-1 text-sm text-black/55">
                      Set reserved deductions first. Remaining{" "}
                      <span className="font-medium tabular-nums text-[#3D421F]">
                        {round2(
                          Math.max(
                            0,
                            100 -
                              (Number(dialogDeductions.osePercent) || 0) -
                              (Number(dialogDeductions.activitiesPercent) ||
                                0),
                          ),
                        )}
                        %
                      </span>{" "}
                      is split across departments by point weight so 1 pt value
                      matches in every department.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setRedistributeOpen(false)}
                    className="rounded-md p-1 text-black/40 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-50"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3 px-5 py-4">
                  {(
                    [
                      {
                        key: "osePercent",
                        label: "OS&E deduction",
                        hint: "Pool % before department shares",
                      },
                      {
                        key: "activitiesPercent",
                        label: "Staff activities",
                        hint: "Pool % before department shares",
                      },
                      {
                        key: "runnerHousekeeperPercent",
                        label: "Runner / HK fund",
                        hint: "% of waiter CC after tip-out",
                      },
                    ] as const
                  ).map((field) => (
                    <label
                      key={field.key}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium text-[#3D421F]">
                          {field.label}
                        </span>
                        <span className="block text-xs text-black/45">
                          {field.hint}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={dialogDeductions[field.key]}
                          disabled={pending}
                          onChange={(e) => {
                            const next = Math.max(
                              0,
                              Number(e.target.value) || 0,
                            );
                            setDialogDeductions((prev) => ({
                              ...prev,
                              [field.key]: next,
                            }));
                          }}
                          className="h-9 w-20 rounded-md border border-black/10 bg-white px-2 text-right text-sm tabular-nums text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20 disabled:bg-black/[0.03]"
                        />
                        <span className="text-black/45">%</span>
                      </span>
                    </label>
                  ))}
                </div>

                <div className="flex justify-end gap-2 border-t border-black/10 px-5 py-4">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="border border-black/10"
                    disabled={pending}
                    onClick={() => setRedistributeOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    onClick={applyRedistribution}
                  >
                    Apply redistribution
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function FragmentGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
