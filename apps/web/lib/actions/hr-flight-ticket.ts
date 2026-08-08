"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { loadFlightTicketEntitlements } from "@/lib/hr/benefits/flight-ticket-store";
import type { FlightTicketEntitlement } from "@/lib/hr/benefits/flight-ticket";
import { canEditBenefits } from "@/lib/hr/permissions";
import { HR_MODULE_KEY } from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

export type FlightTicketActionResult =
  | { ok: true; preparedCount: number; monthCount: number }
  | { ok: false; error: string };

function isPrepareCandidate(row: FlightTicketEntitlement): boolean {
  return (
    (row.status === "due" || row.status === "pending") &&
    row.payableAmount > 0 &&
    !!row.payrollMonth
  );
}

async function upsertMonthRun(input: {
  service: ReturnType<typeof createServiceClient>;
  venueId: string;
  userId: string;
  monthKey: string;
  payableRows: FlightTicketEntitlement[];
  now: string;
}): Promise<
  { ok: true; runId: string; preparedCount: number } | { ok: false; error: string }
> {
  const { service, venueId, userId, monthKey, payableRows, now } = input;

  const periodStart = payableRows
    .map((r) => r.workYearStart)
    .filter(Boolean)
    .sort()[0]!;
  const periodEnd = payableRows
    .map((r) => r.workYearEnd)
    .filter(Boolean)
    .sort()
    .at(-1)!;

  const { data: existingRun } = await service
    .from("hr_benefit_runs")
    .select("id, status")
    .eq("venue_id", venueId)
    .eq("benefit_kind", "flight_ticket")
    .eq("benefit_month", monthKey)
    .maybeSingle();

  let runId = existingRun?.id as string | undefined;

  const totals = {
    recipientCount: payableRows.length,
    totalDistributed: payableRows.reduce((sum, r) => sum + r.payableAmount, 0),
  };

  if (!runId) {
    const { data: inserted, error: insertError } = await service
      .from("hr_benefit_runs")
      .insert({
        venue_id: venueId,
        benefit_kind: "flight_ticket",
        benefit_month: monthKey,
        period_start: periodStart,
        period_end: periodEnd,
        distribution_date: monthKey,
        status: "finalized",
        totals,
        settings_snapshot: {
          source: "nationality_fly_home_ticket_value",
          rule: "One ticket per completed work year; unpaid leave (UPL/ABS) reduces payable pro-rata; paid leave counts as worked.",
        },
        created_by: userId,
        updated_by: userId,
      })
      .select("id")
      .single();
    if (insertError || !inserted) {
      return {
        ok: false,
        error: insertError?.message ?? "Failed to create flight ticket run.",
      };
    }
    runId = inserted.id as string;
  } else {
    await service
      .from("hr_benefit_runs")
      .update({
        period_start: periodStart,
        period_end: periodEnd,
        distribution_date: monthKey,
        status:
          existingRun?.status === "applied_to_payroll"
            ? "applied_to_payroll"
            : "finalized",
        totals,
        updated_by: userId,
        updated_at: now,
      })
      .eq("id", runId)
      .eq("venue_id", venueId);
  }

  const { data: existingAllocs } = await service
    .from("hr_benefit_allocations")
    .select("id, staff_id, status")
    .eq("venue_id", venueId)
    .eq("run_id", runId)
    .eq("benefit_type", "flight_ticket");

  const existingByStaff = new Map(
    (existingAllocs ?? []).map((a) => [
      String(a.staff_id),
      { id: String(a.id), status: String(a.status) },
    ]),
  );

  let preparedCount = 0;
  for (const row of payableRows) {
    const existing = existingByStaff.get(row.staffId);
    if (existing?.status === "applied_to_payroll") {
      preparedCount += 1;
      continue;
    }

    const payload = {
      venue_id: venueId,
      run_id: runId,
      period_start: row.workYearStart,
      period_end: row.workYearEnd,
      staff_id: row.staffId,
      benefit_type: "flight_ticket",
      points: null,
      amount: row.payableAmount,
      worked_days: row.creditedDays,
      status: "finalized",
      meta: {
        anniversaryDate: row.anniversaryDate,
        yearsCompleted: row.yearsCompleted,
        ticketValuePerYear: row.ticketValuePerYear,
        calendarDays: row.calendarDays,
        unpaidLeaveDays: row.unpaidLeaveDays,
        creditedDays: row.creditedDays,
        deductionAmount: row.deductionAmount,
        nationalityName: row.nationalityName,
        contractKind: row.contractKind,
      },
      updated_at: now,
    };

    if (existing) {
      const { error } = await service
        .from("hr_benefit_allocations")
        .update(payload)
        .eq("id", existing.id)
        .eq("venue_id", venueId);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await service.from("hr_benefit_allocations").insert({
        ...payload,
        created_at: now,
      });
      if (error) return { ok: false, error: error.message };
    }
    preparedCount += 1;
  }

  return { ok: true, runId, preparedCount };
}

/**
 * Prepare finalized flight-ticket allocations for selected staff only.
 * Unselected Due/Pending rows stay open and appear as Pending next month.
 */
export async function prepareFlightTicketBenefits(input?: {
  staffIds?: string[];
}): Promise<FlightTicketActionResult> {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { user, venue, permissions, supabase } = ctx;

  if (!canEditBenefits(permissions, venue.id)) {
    return { ok: false, error: "No permission to prepare flight ticket benefits." };
  }

  const loaded = await loadFlightTicketEntitlements(supabase, venue.id);
  if (loaded.migrationRequired) {
    return {
      ok: false,
      error:
        "Database migration required for flight tickets. Apply 20260809001000_hr_flight_ticket_benefit.sql.",
    };
  }

  const selected = new Set(
    (input?.staffIds ?? []).map((id) => id.trim()).filter(Boolean),
  );
  if (selected.size === 0) {
    return { ok: false, error: "Select at least one employee to prepare." };
  }

  const payableRows = loaded.rows.filter(
    (r) => isPrepareCandidate(r) && selected.has(r.staffId),
  );
  if (payableRows.length === 0) {
    return {
      ok: false,
      error: "No payable Due/Pending flight-ticket entitlements in the selection.",
    };
  }

  const byMonth = new Map<string, FlightTicketEntitlement[]>();
  for (const row of payableRows) {
    const month = row.payrollMonth!;
    const list = byMonth.get(month) ?? [];
    list.push(row);
    byMonth.set(month, list);
  }

  const service = createServiceClient();
  const now = new Date().toISOString();
  let preparedCount = 0;
  const runIds: string[] = [];

  for (const [monthKey, rows] of [...byMonth.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const result = await upsertMonthRun({
      service,
      venueId: venue.id,
      userId: user.id,
      monthKey,
      payableRows: rows,
      now,
    });
    if (!result.ok) return result;
    preparedCount += result.preparedCount;
    runIds.push(result.runId);
  }

  await writeAuditLog({
    actor_id: user.id,
    venue_id: venue.id,
    action: "benefits.flight_ticket_prepared",
    module_key: HR_MODULE_KEY,
    entity: "hr_benefit_runs",
    entity_id: runIds[0] ?? null,
    after: {
      benefit_kind: "flight_ticket",
      prepared_count: preparedCount,
      month_count: byMonth.size,
      months: [...byMonth.keys()],
      staff_ids: [...selected],
    },
  });

  revalidatePath("/hr/benefits/flight-ticket", "page");
  revalidatePath("/hr/benefits", "layout");
  revalidatePath("/hr/payroll", "page");

  return { ok: true, preparedCount, monthCount: byMonth.size };
}

/** @deprecated Use prepareFlightTicketBenefits({ staffIds }). */
export async function prepareFlightTicketBenefitsForMonth(
  _benefitMonth: string,
): Promise<FlightTicketActionResult> {
  return {
    ok: false,
    error: "Select employees in the prepare dialog first.",
  };
}
