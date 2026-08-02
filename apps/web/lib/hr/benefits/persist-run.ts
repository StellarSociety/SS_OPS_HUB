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
} from "./match";
import {
  mergeGratuitySettings,
  mergeServiceChargeSettings,
  type BenefitKind,
  type HrGratuitySettings,
  type HrServiceChargeSettings,
} from "./types";
import { loadBenefitPoolCollectionsForMonth } from "./pool-collections";
import {
  applyStaffOverrides,
  readStaffOverridesFromSnapshot,
} from "./staff-overrides";
import { employmentEndedAsFromTerminationType } from "@/lib/hr/types";

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

async function loadStaffForBenefits(
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
    const department = row.department;
    const position = row.position;
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
    };
    cur.cash_gs += Number(row.gratuity_cash_gs) || 0;
    cur.cc_gs += Number(row.gratuity_cc_gs) || 0;
    cur.total_sales_gs += Number(row.total_sales_gs) || 0;
    cur.total_covers += Number(row.total_covers) || 0;
    byWaiter.set(id, cur);
  }

  return {
    waiters: (waiters ?? []) as Array<{
      id: string;
      name: string;
      position: string;
      staff_id: string | null;
    }>,
    salesByWaiter: [...byWaiter.values()],
  };
}

async function loadScheduleDays(
  service: ServiceClient,
  venueId: string,
  periodStart: string,
  periodEnd: string,
  staffIds: string[],
) {
  if (staffIds.length === 0) return [];
  const { data, error } = await service
    .from("hr_schedule_days")
    .select("staff_id, work_date, label_code")
    .eq("venue_id", venueId)
    .gte("work_date", periodStart)
    .lte("work_date", periodEnd)
    .in("staff_id", staffIds);

  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => ({
    staff_id: d.staff_id as string,
    work_date: String(d.work_date).slice(0, 10),
    label_code: (d.label_code as string | null) ?? null,
  }));
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
  if (run.status === "applied_to_payroll" || run.status === "cancelled") {
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
    const settings = mergeGratuitySettings(
      (run.settings_snapshot ?? {}) as Partial<HrGratuitySettings>,
    );
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

    // Keep run snapshot in sync so the Contributors UI can show / edit the value.
    if (
      storedThreshold === undefined ||
      snapshot.forecastAsphKpiThreshold !== forecastAsph
    ) {
      const nextSnapshot = {
        ...snapshot,
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
  } else {
    const settings = mergeServiceChargeSettings(
      (run.settings_snapshot ?? {}) as Partial<HrServiceChargeSettings>,
    );
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
