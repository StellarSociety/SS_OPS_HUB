import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateGratuityRun,
  type GratuityStaffInput,
} from "./calculate-gratuity";
import { calculateServiceChargeRun } from "./calculate-service-charge";
import {
  isBarRole,
  isWaiterFloorRole,
  matchWaitersToStaff,
  normalizePersonName,
} from "./match";
import {
  mergeGratuitySettings,
  mergeServiceChargeSettings,
  isBenefitRunLocked,
  type BenefitKind,
  type HrGratuitySettings,
  type HrServiceChargeSettings,
} from "./types";
import {
  loadBenefitPoolCollectionsForMonth,
  syncDerivedPoolCollectionsFromGratuityRun,
} from "./pool-collections";
import {
  appliedDeductionsByStaffForMonth,
  collectedBenefitDeductionCuts,
  mapBenefitDeductionRow,
  round2,
  sumPaidDistributedAfterFloor,
  countPaidRecipientsAfterFloor,
  mergeBenefitPayout,
  mergeBenefitRunPerson,
  type BenefitDeductionEntry,
  type BenefitPayoutMap,
  type BenefitRunRosterMap,
} from "./deductions";
import {
  applyStaffOverrides,
  readStaffOverridesFromSnapshot,
} from "./staff-overrides";
import { employmentEndedAsFromTerminationType, HR_SETTINGS_KEYS } from "@/lib/hr/types";
import { getHrVenueSetting } from "@/lib/hr/store";
import {
  countBenefitsWorkedDaysFromSchedule,
  BENEFITS_WORKED_DAYS_RULE,
  type BenefitsWorkedDaysSettings,
} from "./worked-days";

type ServiceClient = SupabaseClient;

/** Venue ASPH target from Sales Forecast for YYYY-MM / YYYY-MM-01. */
export async function loadForecastVenueAsphForMonth(
  service: ServiceClient,
  venueId: string,
  benefitMonth: string,
): Promise<number | null> {
  const monthKey = String(benefitMonth).slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return null;
  const { data, error } = await service
    .from("venue_monthly_forecasts")
    .select("forecast_venue_asph")
    .eq("venue_id", venueId)
    .eq("month_key", monthKey)
    .maybeSingle();
  if (error || !data) return null;
  const n = Number(data.forecast_venue_asph);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function readAsphKpiThresholdFromSnapshot(
  snapshot: unknown,
): number | null | undefined {
  if (!snapshot || typeof snapshot !== "object") return undefined;
  const raw = (snapshot as Record<string, unknown>).asphKpiThreshold;
  if (raw === null) return null;
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

type StaffBenefitRow = {
  id: string;
  emp_no: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  department_id: string | null;
  position_id: string | null;
  joining_date: string | null;
  termination_date: string | null;
  termination_type?: string | null;
  department: { name?: string } | null;
  position: { name?: string } | null;
};

export async function loadStaffForBenefits(
  service: ServiceClient,
  venueId: string,
): Promise<GratuityStaffInput[]> {
  const selectWithTermination =
    "id, emp_no, full_name, first_name, last_name, department_id, position_id, joining_date, termination_date, termination_type, department:departments(name), position:positions(name)";

  const initial = await service
    .from("staff")
    .select(selectWithTermination)
    .eq("home_venue_id", venueId);

  let rows: StaffBenefitRow[];
  if (
    initial.error &&
    /termination_type|schema cache|column/i.test(initial.error.message)
  ) {
    const selectWithoutTermination =
      "id, emp_no, full_name, first_name, last_name, department_id, position_id, joining_date, termination_date, department:departments(name), position:positions(name)";
    const fallback = await service
      .from("staff")
      .select(selectWithoutTermination)
      .eq("home_venue_id", venueId);
    if (fallback.error) throw new Error(fallback.error.message);
    rows = (fallback.data ?? []) as StaffBenefitRow[];
  } else {
    if (initial.error) throw new Error(initial.error.message);
    rows = (initial.data ?? []) as StaffBenefitRow[];
  }

  return rows.map((row) => {
    const department = Array.isArray(row.department)
      ? row.department[0]
      : row.department;
    const position = Array.isArray(row.position)
      ? row.position[0]
      : row.position;
    const deptName = department?.name ?? null;
    const posName = position?.name ?? null;
    const terminationType = row.termination_type as string | null | undefined;
    const employmentEndedAs =
      employmentEndedAsFromTerminationType(terminationType);

    return {
      id: row.id as string,
      emp_no: (row.emp_no as string | null) ?? null,
      full_name: (row.full_name as string) ?? "",
      department_id: (row.department_id as string | null) ?? null,
      department_name: deptName,
      position_id: (row.position_id as string | null) ?? null,
      position_name: posName,
      joining_date: (row.joining_date as string | null) ?? null,
      termination_date: (row.termination_date as string | null) ?? null,
      is_floor_waiter: isWaiterFloorRole(posName) && !isBarRole(posName, deptName),
      employment_ended_as: employmentEndedAs,
    };
  });
}

async function loadWaiterPeriodSales(
  service: ServiceClient,
  venueId: string,
  periodStart: string,
  periodEnd: string,
) {
  let waitersQuery = service
    .from("venue_waiters")
    .select("id, name, position, staff_id")
    .eq("venue_id", venueId);

  let { data: waiters, error: waitersError } = await waitersQuery;
  if (waitersError && /staff_id|schema cache|column/i.test(waitersError.message)) {
    const fallback = await service
      .from("venue_waiters")
      .select("id, name, position")
      .eq("venue_id", venueId);
    if (fallback.error) throw new Error(fallback.error.message);
    waiters = (fallback.data ?? []).map((w) => ({ ...w, staff_id: null }));
    waitersError = null;
  }
  if (waitersError) throw new Error(waitersError.message);

  const { data: sales, error: salesError } = await service
    .from("venue_waiter_daily_sales")
    .select(
      "waiter_id, sale_date, gratuity_cash_gs, gratuity_cc_gs, total_sales_gs, total_covers",
    )
    .eq("venue_id", venueId)
    .gte("sale_date", periodStart)
    .lte("sale_date", periodEnd);

  if (salesError) throw new Error(salesError.message);

  type Agg = {
    waiter_id: string;
    cash_gs: number;
    cc_gs: number;
    total_sales_gs: number;
    total_covers: number;
    collectionDates: Set<string>;
  };
  const byWaiter = new Map<string, Agg>();
  for (const row of sales ?? []) {
    const id = row.waiter_id as string;
    const cur = byWaiter.get(id) ?? {
      waiter_id: id,
      cash_gs: 0,
      cc_gs: 0,
      total_sales_gs: 0,
      total_covers: 0,
      collectionDates: new Set<string>(),
    };
    const cash = Number(row.gratuity_cash_gs) || 0;
    const cc = Number(row.gratuity_cc_gs) || 0;
    cur.cash_gs += cash;
    cur.cc_gs += cc;
    cur.total_sales_gs += Number(row.total_sales_gs) || 0;
    cur.total_covers += Number(row.total_covers) || 0;
    if (cash > 0 || cc > 0) {
      const date = String(row.sale_date ?? "").slice(0, 10);
      if (date) cur.collectionDates.add(date);
    }
    byWaiter.set(id, cur);
  }

  return {
    waiters: (waiters ?? []) as Array<{
      id: string;
      name: string;
      position: string;
      staff_id: string | null;
    }>,
    salesByWaiter: [...byWaiter.values()].map((agg) => ({
      waiter_id: agg.waiter_id,
      cash_gs: agg.cash_gs,
      cc_gs: agg.cc_gs,
      total_sales_gs: agg.total_sales_gs,
      total_covers: agg.total_covers,
      collectionDates: [...agg.collectionDates].sort(),
    })),
  };
}

export type WaiterGratuityCollectionDays = {
  days: number;
  dates: string[];
};

function unionCollectionDays(
  map: Record<string, Set<string>>,
  key: string,
  dates: string[],
) {
  if (!key || dates.length === 0) return;
  const set = map[key] ?? new Set<string>();
  for (const date of dates) {
    if (date) set.add(date);
  }
  map[key] = set;
}

function freezeCollectionDays(
  map: Record<string, Set<string>>,
): Record<string, WaiterGratuityCollectionDays> {
  return Object.fromEntries(
    Object.entries(map).map(([key, dates]) => {
      const sorted = [...dates].sort();
      return [key, { days: sorted.length, dates: sorted }];
    }),
  );
}

/**
 * Days each waiter collected cash or CC gratuity in the benefit period.
 * Used by the Contributors table (not roster “worked days”).
 */
export async function loadWaiterGratuityCollectionDaysByStaff(
  service: ServiceClient,
  venueId: string,
  periodStart: string,
  periodEnd: string,
): Promise<{
  byStaffId: Record<string, WaiterGratuityCollectionDays>;
  byNormalizedName: Record<string, WaiterGratuityCollectionDays>;
}> {
  const { waiters, salesByWaiter } = await loadWaiterPeriodSales(
    service,
    venueId,
    periodStart,
    periodEnd,
  );
  const { data: staffRows, error: staffError } = await service
    .from("staff")
    .select("id, full_name")
    .eq("home_venue_id", venueId);
  if (staffError) throw new Error(staffError.message);

  const matched = matchWaitersToStaff(
    waiters.map((w) => ({
      id: w.id,
      name: w.name,
      staff_id: w.staff_id,
    })),
    (staffRows ?? []).map((s) => ({
      id: s.id as string,
      full_name: String(s.full_name ?? ""),
    })),
  );

  const byStaffId: Record<string, Set<string>> = {};
  const byNormalizedName: Record<string, Set<string>> = {};

  for (const agg of salesByWaiter) {
    if (agg.collectionDates.length === 0) continue;
    const w = waiters.find((x) => x.id === agg.waiter_id);
    const staffId = w?.staff_id || matched.get(agg.waiter_id) || null;
    if (staffId) {
      unionCollectionDays(byStaffId, staffId, agg.collectionDates);
    }
    const nameKey = normalizePersonName(w?.name ?? "");
    if (nameKey) {
      unionCollectionDays(byNormalizedName, nameKey, agg.collectionDates);
    }
  }

  return {
    byStaffId: freezeCollectionDays(byStaffId),
    byNormalizedName: freezeCollectionDays(byNormalizedName),
  };
}

/** Live roster worked-day counts for Allocations (SHIFT + OFF, never PH). */
export async function loadBenefitWorkedDaysByStaff(
  service: ServiceClient,
  venueId: string,
  periodStart: string,
  periodEnd: string,
  settings: BenefitsWorkedDaysSettings = BENEFITS_WORKED_DAYS_RULE,
): Promise<Record<string, number>> {
  const data = await loadScheduleDayRows(service, venueId, periodStart, periodEnd);

  const byStaff = new Map<
    string,
    Array<{ work_date: string; label_code: string | null }>
  >();
  for (const row of data) {
    const staffId = String(row.staff_id ?? "");
    if (!staffId) continue;
    const list = byStaff.get(staffId) ?? [];
    list.push({
      work_date: String(row.work_date).slice(0, 10),
      label_code: row.label_code,
    });
    byStaff.set(staffId, list);
  }

  const out: Record<string, number> = {};
  for (const [staffId, days] of byStaff) {
    out[staffId] = countBenefitsWorkedDaysFromSchedule(days, settings);
  }
  return out;
}

async function loadScheduleDayRows(
  service: ServiceClient,
  venueId: string,
  periodStart: string,
  periodEnd: string,
  staffIds?: string[],
) {
  const pageSize = 1000;
  const maxRows = 50_000;
  const staffFilter =
    staffIds && staffIds.length > 0 ? new Set(staffIds) : null;
  const filterInQuery = Boolean(staffFilter && staffFilter.size <= 40);
  const rows: Array<{
    staff_id: string;
    work_date: string;
    label_code: string | null;
  }> = [];
  let from = 0;

  while (rows.length < maxRows) {
    const to = from + pageSize - 1;
    let query = service
      .from("hr_schedule_days")
      .select("staff_id, work_date, label_code")
      .eq("venue_id", venueId)
      .gte("work_date", periodStart)
      .lte("work_date", periodEnd)
      .order("work_date")
      .order("staff_id")
      .range(from, to);
    if (filterInQuery && staffIds) {
      query = query.in("staff_id", staffIds);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const page = data ?? [];
    for (const row of page) {
      const staffId = String(row.staff_id ?? "");
      if (!staffId) continue;
      if (staffFilter && !filterInQuery && !staffFilter.has(staffId)) continue;
      rows.push({
        staff_id: staffId,
        work_date: String(row.work_date).slice(0, 10),
        label_code: (row.label_code as string | null) ?? null,
      });
    }
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function loadScheduleDays(
  service: ServiceClient,
  venueId: string,
  periodStart: string,
  periodEnd: string,
  staffIds: string[],
) {
  if (staffIds.length === 0) return [];
  return loadScheduleDayRows(
    service,
    venueId,
    periodStart,
    periodEnd,
    staffIds,
  );
}

async function loadServiceChargeCollected(
  service: ServiceClient,
  venueId: string,
  periodStart: string,
  periodEnd: string,
): Promise<number> {
  const { data, error } = await service
    .from("venue_daily_sales")
    .select("service_charge_collected_gs")
    .eq("venue_id", venueId)
    .gte("sale_date", periodStart)
    .lte("sale_date", periodEnd);

  if (error) throw new Error(error.message);
  return (data ?? []).reduce(
    (s, r) => s + (Number(r.service_charge_collected_gs) || 0),
    0,
  );
}

async function replaceAllocations(
  service: ServiceClient,
  args: {
    venueId: string;
    runId: string;
    periodStart: string;
    periodEnd: string;
    benefitType: "tips" | "service_charge";
    allocations: Array<{
      staff_id: string;
      benefit_type: "tips" | "service_charge";
      points: number | null;
      worked_days: number | null;
      amount: number;
      meta: Record<string, unknown>;
    }>;
  },
) {
  const { error: delError } = await service
    .from("hr_benefit_allocations")
    .delete()
    .eq("venue_id", args.venueId)
    .eq("run_id", args.runId);

  if (delError) throw new Error(delError.message);

  if (args.allocations.length === 0) return;

  const rows = args.allocations.map((a) => ({
    venue_id: args.venueId,
    run_id: args.runId,
    period_start: args.periodStart,
    period_end: args.periodEnd,
    staff_id: a.staff_id,
    benefit_type: a.benefit_type,
    points: a.points,
    worked_days: a.worked_days,
    amount: a.amount,
    status: "draft",
    meta: a.meta,
  }));

  // Chunk inserts to avoid payload limits
  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await service.from("hr_benefit_allocations").insert(chunk);
    if (error) throw new Error(error.message);
  }
}

function asMetaNumber(meta: Record<string, unknown>, key: string): number {
  const n = Number(meta[key]);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function paidPayoutInputFromRun(args: {
  allocations: Array<{
    staff_id: string;
    amount: number;
    meta: Record<string, unknown>;
  }>;
  contributors: Array<{
    staffId?: string | null;
    retain?: number | null;
    withheld?: boolean;
  }>;
}) {
  return {
    allocations: args.allocations.map((row) => {
      const meta = (row.meta ?? {}) as Record<string, unknown>;
      return {
        staffId: row.staff_id,
        amount: Number(row.amount) || 0,
        poolShare: asMetaNumber(meta, "poolShare"),
        retain: asMetaNumber(meta, "retain"),
        excluded: meta.excluded === true,
      };
    }),
    contributors: args.contributors.map((row) => ({
      staffId: row.staffId,
      retain: Number(row.retain) || 0,
      withheld: Boolean(row.withheld),
    })),
  };
}

/**
 * Benefit deductions taken from this run’s payouts, using the same retain-then-pool
 * split as the run page. Relies on allocations already being persisted for payouts.
 */
async function benefitDeductionsCollectedForRun(args: {
  service: ServiceClient;
  venueId: string;
  kind: BenefitKind;
  benefitMonth: string;
  allocations: Array<{
    staff_id: string;
    amount: number;
    meta: Record<string, unknown>;
  }>;
  contributors: Array<{
    staffId?: string | null;
    retain?: number | null;
    withheld?: boolean;
  }>;
}): Promise<{
  collected: number;
  paidDistributed: number;
  paidRecipients: number;
}> {
  const { service, venueId, kind, benefitMonth, allocations, contributors } =
    args;
  const payoutInput = paidPayoutInputFromRun({ allocations, contributors });
  const paidWithoutCuts = () => ({
    collected: 0,
    paidDistributed: sumPaidDistributedAfterFloor({
      appliedByStaff: new Map(),
      ...payoutInput,
    }),
    paidRecipients: countPaidRecipientsAfterFloor({
      appliedByStaff: new Map(),
      ...payoutInput,
    }),
  });

  const { data: deductionRows, error: deductionError } = await service
    .from("hr_benefit_deductions")
    .select(
      "id, name, total_amount, benefit_kind, target_type, department_id, department_name, staff_snapshot, month_count, start_month, later_split_mode, created_at, cancelled_at",
    )
    .eq("venue_id", venueId);

  if (deductionError) {
    if (
      /hr_benefit_deductions|schema cache|does not exist/i.test(
        deductionError.message,
      )
    ) {
      return paidWithoutCuts();
    }
    throw new Error(deductionError.message);
  }

  const entries = (deductionRows ?? [])
    .map((row) =>
      mapBenefitDeductionRow({
        id: String(row.id),
        name: String(row.name ?? ""),
        total_amount: row.total_amount,
        benefit_kind: String(row.benefit_kind ?? ""),
        target_type: String(row.target_type ?? ""),
        department_id:
          row.department_id == null ? null : String(row.department_id),
        department_name:
          row.department_name == null ? null : String(row.department_name),
        staff_snapshot: row.staff_snapshot,
        month_count: row.month_count,
        start_month: String(row.start_month ?? ""),
        later_split_mode: (row as { later_split_mode?: unknown })
          .later_split_mode,
        created_at: String(row.created_at ?? ""),
        cancelled_at:
          row.cancelled_at == null ? null : String(row.cancelled_at),
      }),
    )
    .filter((row): row is BenefitDeductionEntry => row != null);

  if (entries.length === 0) {
    return paidWithoutCuts();
  }

  const { data: runs, error: runError } = await service
    .from("hr_benefit_runs")
    .select("id, benefit_kind, benefit_month, status")
    .eq("venue_id", venueId)
    .in("benefit_kind", ["gratuity", "service_charge"])
    .neq("status", "cancelled");

  if (runError) throw new Error(runError.message);

  const runMeta = new Map<string, { kind: BenefitKind; month: string }>();
  let rosters: BenefitRunRosterMap = {};
  for (const run of runs ?? []) {
    const runKind = String(run.benefit_kind);
    if (runKind !== "gratuity" && runKind !== "service_charge") continue;
    runMeta.set(String(run.id), {
      kind: runKind,
      month: String(run.benefit_month).slice(0, 10),
    });
  }

  const runIds = [...runMeta.keys()];
  let payouts: BenefitPayoutMap = {};
  if (runIds.length > 0) {
    const { data: payoutAllocations, error: allocError } = await service
      .from("hr_benefit_allocations")
      .select(
        "run_id, staff_id, amount, staff:staff_id(emp_no, full_name, department_id, department:departments(name))",
      )
      .eq("venue_id", venueId)
      .in("run_id", runIds);
    if (allocError) throw new Error(allocError.message);

    for (const row of payoutAllocations ?? []) {
      const meta = runMeta.get(String(row.run_id));
      if (!meta) continue;
      const staffId = String(row.staff_id);
      const amount = Number(row.amount) || 0;
      const staff = row.staff as
        | {
            emp_no?: string | null;
            full_name?: string | null;
            department_id?: string | null;
            department?: { name?: string } | null;
          }
        | null;
      payouts = mergeBenefitPayout(payouts, meta.kind, meta.month, staffId, amount);
      rosters = mergeBenefitRunPerson(rosters, meta.kind, meta.month, {
        staffId,
        amount,
        empNo: staff?.emp_no ? String(staff.emp_no) : null,
        fullName: staff?.full_name ? String(staff.full_name) : "Staff",
        departmentId: staff?.department_id ? String(staff.department_id) : null,
        departmentName: staff?.department?.name
          ? String(staff.department.name)
          : null,
      });
    }
  }

  const appliedByStaff = appliedDeductionsByStaffForMonth(
    entries,
    payouts,
    kind,
    benefitMonth,
    rosters,
  );
  if (appliedByStaff.size === 0) {
    return paidWithoutCuts();
  }

  return {
    collected: collectedBenefitDeductionCuts({
      appliedByStaff,
      ...payoutInput,
    }),
    paidDistributed: sumPaidDistributedAfterFloor({
      appliedByStaff,
      ...payoutInput,
    }),
    paidRecipients: countPaidRecipientsAfterFloor({
      appliedByStaff,
      ...payoutInput,
    }),
  };
}

export async function persistCalculatedBenefitRun(args: {
  service: ServiceClient;
  venueId: string;
  runId: string;
  kind: BenefitKind;
  userId: string;
  /** Defaults to "calculated". Use "draft" when explicitly saving current settings. */
  resultStatus?: "draft" | "calculated";
}): Promise<{ warnings: string[] }> {
  const { service, venueId, runId, kind, userId } = args;
  const resultStatus = args.resultStatus ?? "calculated";

  const { data: run, error: runError } = await service
    .from("hr_benefit_runs")
    .select(
      "id, benefit_kind, benefit_month, period_start, period_end, distribution_date, status, settings_snapshot",
    )
    .eq("venue_id", venueId)
    .eq("id", runId)
    .maybeSingle();

  if (runError) throw new Error(runError.message);
  if (!run) throw new Error("Benefit run not found.");
  if (run.benefit_kind !== kind) {
    throw new Error("Benefit run kind mismatch.");
  }
  if (isBenefitRunLocked(String(run.status))) {
    throw new Error(`Cannot recalculate a run in status "${run.status}".`);
  }

  const periodStart = String(run.period_start).slice(0, 10);
  const periodEnd = String(run.period_end).slice(0, 10);
  const benefitMonth = String(run.benefit_month).slice(0, 10);
  const poolCollections = await loadBenefitPoolCollectionsForMonth(
    service,
    venueId,
    benefitMonth,
  );
  const staffRaw = await loadStaffForBenefits(service, venueId);
  const staffOverrides = readStaffOverridesFromSnapshot(run.settings_snapshot);
  const staff = applyStaffOverrides(staffRaw, staffOverrides);
  const scheduleDays = await loadScheduleDays(
    service,
    venueId,
    periodStart,
    periodEnd,
    staff.map((s) => s.id),
  );

  let warnings: string[] = [];
  let totals: Record<string, unknown> = {};
  let poolMeta: Record<string, unknown> = {};

  if (kind === "gratuity") {
    const livePolicy = mergeGratuitySettings(
      await getHrVenueSetting<Partial<HrGratuitySettings>>(
        service,
        venueId,
        HR_SETTINGS_KEYS.benefitsGratuity,
        {},
      ),
    );
    const settings = {
      ...mergeGratuitySettings(
        (run.settings_snapshot ?? {}) as Partial<HrGratuitySettings>,
      ),
      pointTiers: livePolicy.pointTiers,
    };
    const { waiters, salesByWaiter } = await loadWaiterPeriodSales(
      service,
      venueId,
      periodStart,
      periodEnd,
    );
    const matched = matchWaitersToStaff(
      waiters.map((w) => ({
        id: w.id,
        name: w.name,
        staff_id: w.staff_id,
      })),
      staff.map((s) => ({
        id: s.id,
        full_name: s.full_name,
      })),
    );

    // Mark floor waiters from sales roster when linked
    const floorWaiterStaffIds = new Set<string>();
    for (const w of waiters) {
      const sid = w.staff_id || matched.get(w.id);
      if (!sid) continue;
      if (isWaiterFloorRole(w.position) && !isBarRole(w.position)) {
        floorWaiterStaffIds.add(sid);
      }
    }
    for (const s of staff) {
      if (floorWaiterStaffIds.has(s.id)) s.is_floor_waiter = true;
    }

    const waiterSales = salesByWaiter.map((agg) => {
      const w = waiters.find((x) => x.id === agg.waiter_id);
      const staffId =
        w?.staff_id || matched.get(agg.waiter_id) || null;
      return {
        waiter_id: agg.waiter_id,
        staff_id: staffId,
        waiter_name: w?.name ?? agg.waiter_id,
        position: w?.position ?? "",
        cash_gs: agg.cash_gs,
        cc_gs: agg.cc_gs,
        total_sales_gs: agg.total_sales_gs,
        total_covers: agg.total_covers,
        collectionDates: agg.collectionDates,
      };
    });

    const snapshot =
      (run.settings_snapshot as Record<string, unknown> | null) ?? {};
    const equalizeDepartmentPointValue =
      snapshot.departmentAllocationMode === "equal_point_value" ||
      snapshot.departmentAllocationMode === "bypass_department";

    const forecastAsph = await loadForecastVenueAsphForMonth(
      service,
      venueId,
      benefitMonth,
    );
    const storedThreshold = readAsphKpiThresholdFromSnapshot(snapshot);
    const asphKpiThreshold =
      storedThreshold !== undefined ? storedThreshold : forecastAsph;

    // Keep run snapshot in sync so the Contributors UI can show / edit the value
    // and Allocations inherit the live Pay → Benefits points mapping.
    if (
      storedThreshold === undefined ||
      snapshot.forecastAsphKpiThreshold !== forecastAsph ||
      snapshot.pointTiers !== livePolicy.pointTiers
    ) {
      const nextSnapshot = {
        ...snapshot,
        pointTiers: livePolicy.pointTiers,
        asphKpiThreshold,
        forecastAsphKpiThreshold: forecastAsph,
      };
      await service
        .from("hr_benefit_runs")
        .update({
          settings_snapshot: nextSnapshot,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId)
        .eq("venue_id", venueId);
    }

    const result = calculateGratuityRun({
      settings,
      periodStart,
      periodEnd,
      staff,
      waiterSales,
      scheduleDays,
      poolCollections,
      equalizeDepartmentPointValue,
      asphKpiThreshold,
      waiveWithheldRetain: snapshot.waiveWithheldRetain === true,
      withheldRetainToPool: snapshot.withheldRetainToPool === true,
    });

    warnings = [...result.warnings];
    if (
      settings.waiterCcTipOutMode === "asph_kpi" &&
      settings.asphKpiEnabled &&
      (asphKpiThreshold == null || asphKpiThreshold <= 0)
    ) {
      warnings.push(
        "ASPH KPI tip-out is active but no venue ASPH target is set for this month (Sales → Forecast). Using the missed-KPI tip-out % for all waiters until a threshold is set.",
      );
    }
    totals = {
      ...result.totals,
      pool: result.pool,
      contributors: result.contributors,
      warnings,
    };
    poolMeta = { pool: result.pool, warnings };

    await replaceAllocations(service, {
      venueId,
      runId,
      periodStart,
      periodEnd,
      benefitType: "tips",
      allocations: result.allocations,
    });
    const {
      collected: benefitDeductions,
      paidDistributed,
      paidRecipients,
    } = await benefitDeductionsCollectedForRun({
      service,
      venueId,
      kind: "gratuity",
      benefitMonth,
      allocations: result.allocations,
      contributors: result.contributors,
    });
    result.pool.benefitDeductions = benefitDeductions;
    const collectionsTotal = round2(
      (Number(result.pool.ose) || 0) +
        (Number(result.pool.activities) || 0) +
        (Number(result.pool.roundingCollected) || 0) +
        (Number(result.pool.withheldRetain) || 0) +
        benefitDeductions,
    );
    totals = {
      ...result.totals,
      totalDistributedPaid: paidDistributed,
      recipientCount: paidRecipients,
      collectionsTotal,
      pool: result.pool,
      contributors: result.contributors,
      warnings,
    };
    poolMeta = { pool: result.pool, warnings };
    await syncDerivedPoolCollectionsFromGratuityRun({
      service,
      venueId,
      benefitMonth,
      roundingAmount: result.pool.roundingCollected,
      withheldRetainAmount: result.pool.withheldRetain,
      benefitDeductionAmount: benefitDeductions,
      userId,
    });
  } else {
    const livePolicy = mergeServiceChargeSettings(
      await getHrVenueSetting<Partial<HrServiceChargeSettings>>(
        service,
        venueId,
        HR_SETTINGS_KEYS.benefitsServiceCharge,
        {},
      ),
    );
    const settings = {
      ...mergeServiceChargeSettings(
        (run.settings_snapshot ?? {}) as Partial<HrServiceChargeSettings>,
      ),
      pointTiers: livePolicy.pointTiers,
    };
    const collected = await loadServiceChargeCollected(
      service,
      venueId,
      periodStart,
      periodEnd,
    );
    const result = calculateServiceChargeRun({
      settings,
      serviceChargeCollected: collected,
      staff,
      scheduleDays,
    });
    warnings = result.warnings;
    totals = { ...result.totals, warnings };
    poolMeta = { warnings };

    await replaceAllocations(service, {
      venueId,
      runId,
      periodStart,
      periodEnd,
      benefitType: "service_charge",
      allocations: result.allocations,
    });
  }

  const { error: updateError } = await service
    .from("hr_benefit_runs")
    .update({
      status: resultStatus,
      totals,
      updated_by: userId,
      updated_at: new Date().toISOString(),
      notes:
        warnings.length > 0
          ? `Calculated with ${warnings.length} warning(s).`
          : null,
    })
    .eq("id", runId)
    .eq("venue_id", venueId);

  if (updateError) throw new Error(updateError.message);

  await service.from("hr_benefit_run_events").insert({
    venue_id: venueId,
    run_id: runId,
    actor_id: userId,
    from_status: run.status,
    to_status: resultStatus,
    comment:
      resultStatus === "draft"
        ? warnings.length > 0
          ? `Saved draft (${warnings.length} warnings)`
          : "Saved draft"
        : warnings.length > 0
          ? `Recalculated (${warnings.length} warnings)`
          : "Recalculated",
  });

  void poolMeta;
  return { warnings };
}

export async function finalizeBenefitAllocations(args: {
  service: ServiceClient;
  venueId: string;
  runId: string;
  userId: string;
}): Promise<void> {
  const { service, venueId, runId, userId } = args;

  const { data: run, error } = await service
    .from("hr_benefit_runs")
    .select("id, status")
    .eq("venue_id", venueId)
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!run) throw new Error("Benefit run not found.");
  if (!["calculated", "review", "draft"].includes(run.status)) {
    throw new Error(`Cannot finalize from status "${run.status}".`);
  }

  const { error: allocError } = await service
    .from("hr_benefit_allocations")
    .update({ status: "finalized", updated_at: new Date().toISOString() })
    .eq("venue_id", venueId)
    .eq("run_id", runId);
  if (allocError) throw new Error(allocError.message);

  const { error: runError } = await service
    .from("hr_benefit_runs")
    .update({
      status: "finalized",
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("venue_id", venueId);
  if (runError) throw new Error(runError.message);

  await service.from("hr_benefit_run_events").insert({
    venue_id: venueId,
    run_id: runId,
    actor_id: userId,
    from_status: run.status,
    to_status: "finalized",
    comment: "Allocations finalized for payroll pickup",
  });
}

export async function reopenBenefitAllocations(args: {
  service: ServiceClient;
  venueId: string;
  runId: string;
  userId: string;
}): Promise<{ previousStatus: string }> {
  const { service, venueId, runId, userId } = args;

  const { data: run, error } = await service
    .from("hr_benefit_runs")
    .select("id, status")
    .eq("venue_id", venueId)
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!run) throw new Error("Benefit run not found.");
  if (!["finalized", "applied_to_payroll"].includes(String(run.status))) {
    throw new Error(`Cannot reopen a run in status "${run.status}".`);
  }

  const now = new Date().toISOString();
  const { error: allocError } = await service
    .from("hr_benefit_allocations")
    .update({
      status: "draft",
      payroll_line_id: null,
      updated_at: now,
    })
    .eq("venue_id", venueId)
    .eq("run_id", runId);
  if (allocError) throw new Error(allocError.message);

  const { error: runError } = await service
    .from("hr_benefit_runs")
    .update({
      status: "review",
      updated_by: userId,
      updated_at: now,
    })
    .eq("id", runId)
    .eq("venue_id", venueId);
  if (runError) throw new Error(runError.message);

  await service.from("hr_benefit_run_events").insert({
    venue_id: venueId,
    run_id: runId,
    actor_id: userId,
    from_status: run.status,
    to_status: "review",
    comment: "Reopened for alterations",
  });

  return { previousStatus: String(run.status) };
}
