import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  anniversaryInYear,
  buildFlightTicketEntitlement,
  completedServiceYearsAsOf,
  dubaiTodayIso,
  isFlightTicketAllocationSettled,
  listUnpaidLeaveDaysInRange,
  payrollMonthFromAnniversary,
  resolveDisplayAnniversaryYear,
  type FlightTicketEntitlement,
  type FlightTicketStaffInput,
} from "@/lib/hr/benefits/flight-ticket";
import {
  EMPLOYMENT_STATUS_NAMES,
  normalizeEmploymentStatusName,
} from "@/lib/hr/employment-status";
import { listAllStaff, listScheduleDaysByDateRange } from "@/lib/hr/store";

function money(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/**
 * Load flight-ticket entitlements for all eligible venue staff.
 * Shows current-month Due, unsettled past anniversaries as Pending, else Upcoming.
 */
export async function loadFlightTicketEntitlements(
  supabase: SupabaseClient,
  venueId: string,
  asOfDate = dubaiTodayIso(),
): Promise<{
  asOfDate: string;
  rows: FlightTicketEntitlement[];
  migrationRequired: boolean;
}> {
  const staff = (await listAllStaff(supabase)).filter(
    (s) => s.home_venue_id === venueId,
  );

  const eligibleStatuses = new Set<string>([
    EMPLOYMENT_STATUS_NAMES.onBoard,
    EMPLOYMENT_STATUS_NAMES.offBoard,
  ]);

  let migrationRequired = false;
  const allocationByKey = new Map<
    string,
    { id: string; status: string; paidOnPayrollMonth: string | null }
  >();

  const { data: runs, error: runError } = await supabase
    .from("hr_benefit_runs")
    .select("id, benefit_month")
    .eq("venue_id", venueId)
    .eq("benefit_kind", "flight_ticket");

  if (runError) {
    if (
      /hr_benefit_runs|schema cache|does not exist|flight_ticket|check/i.test(
        runError.message,
      )
    ) {
      migrationRequired = true;
    } else {
      console.error("[flight-ticket] load runs:", runError.message);
    }
  }

  const runMonthById = new Map<string, string>();
  for (const run of runs ?? []) {
    runMonthById.set(String(run.id), String(run.benefit_month).slice(0, 10));
  }

  if (runMonthById.size > 0) {
    const { data: allocs, error: allocError } = await supabase
      .from("hr_benefit_allocations")
      .select("id, staff_id, status, run_id, payroll_line_id")
      .eq("venue_id", venueId)
      .eq("benefit_type", "flight_ticket")
      .in("run_id", [...runMonthById.keys()]);
    if (allocError) {
      console.error("[flight-ticket] load allocations:", allocError.message);
    } else {
      const lineIds = [
        ...new Set(
          (allocs ?? [])
            .map((a) => a.payroll_line_id as string | null)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const payrollMonthByLineId = new Map<string, string>();
      if (lineIds.length > 0) {
        const { data: lines } = await supabase
          .from("hr_payroll_lines")
          .select("id, run:hr_payroll_runs(payroll_month)")
          .in("id", lineIds);
        for (const line of lines ?? []) {
          const runRaw = line.run as
            | { payroll_month?: string }
            | { payroll_month?: string }[]
            | null;
          const run = Array.isArray(runRaw) ? runRaw[0] : runRaw;
          const month = run?.payroll_month
            ? String(run.payroll_month).slice(0, 10)
            : null;
          if (month) payrollMonthByLineId.set(String(line.id), month);
        }
      }

      // Fallback: FLIGHT_TICKET lines linked by staff + benefit month meta
      const paidByStaffBenefitMonth = new Map<string, string>();
      const { data: flightLines } = await supabase
        .from("hr_payroll_lines")
        .select(
          "meta, run:hr_payroll_runs!inner(payroll_month), run_employee:hr_payroll_run_employees!inner(staff_id)",
        )
        .eq("venue_id", venueId)
        .eq("code", "FLIGHT_TICKET")
        .eq("source", "benefits");
      for (const line of flightLines ?? []) {
        const empRaw = line.run_employee as
          | { staff_id?: string }
          | { staff_id?: string }[]
          | null;
        const emp = Array.isArray(empRaw) ? empRaw[0] : empRaw;
        const staffId = emp?.staff_id ? String(emp.staff_id) : "";
        const meta = (line.meta ?? {}) as { benefitMonth?: string };
        const benefitMonth = meta.benefitMonth
          ? String(meta.benefitMonth).slice(0, 10)
          : "";
        const runRaw = line.run as
          | { payroll_month?: string }
          | { payroll_month?: string }[]
          | null;
        const run = Array.isArray(runRaw) ? runRaw[0] : runRaw;
        const payrollMonth = run?.payroll_month
          ? String(run.payroll_month).slice(0, 10)
          : null;
        if (staffId && benefitMonth && payrollMonth) {
          paidByStaffBenefitMonth.set(`${staffId}:${benefitMonth}`, payrollMonth);
        }
      }

      for (const a of allocs ?? []) {
        const month = runMonthById.get(String(a.run_id));
        if (!month) continue;
        const lineId = a.payroll_line_id
          ? String(a.payroll_line_id)
          : null;
        let paidOn =
          (lineId ? payrollMonthByLineId.get(lineId) : null) ??
          paidByStaffBenefitMonth.get(`${a.staff_id}:${month}`) ??
          null;
        // If applied but no payroll line found, fall back to benefit month itself.
        if (
          !paidOn &&
          String(a.status) === "applied_to_payroll"
        ) {
          paidOn = month;
        }
        allocationByKey.set(`${a.staff_id}:${month}`, {
          id: String(a.id),
          status: String(a.status),
          paidOnPayrollMonth: paidOn,
        });
      }
    }
  }

  const currentMonthKey = `${asOfDate.slice(0, 7)}-01`;
  const candidates: Array<{
    staff: FlightTicketStaffInput;
    anniversaryYear: number;
  }> = [];

  for (const s of staff) {
    const statusName = normalizeEmploymentStatusName(
      s.employment_status?.name,
    );
    if (statusName && !eligibleStatuses.has(statusName)) continue;

    const joining = s.joining_date?.trim()?.slice(0, 10) ?? "";
    const ticketValue = money(
      s.nationality?.fly_home_ticket_value ?? s.fly_home_ticket_per_year,
    );

    const input: FlightTicketStaffInput = {
      id: s.id,
      empNo: s.emp_no,
      fullName: s.full_name,
      photoUrl: s.photo_url ?? null,
      departmentName: s.department?.name ?? null,
      positionName: s.position?.name ?? null,
      employmentStatusName: s.employment_status?.name ?? null,
      workingStatusName: s.working_status?.name ?? null,
      contractKind: s.contract_kind?.trim() || null,
      nationalityName: s.nationality?.name ?? null,
      joiningDate: /^\d{4}-\d{2}-\d{2}$/.test(joining) ? joining : null,
      terminationDate: s.termination_date?.slice(0, 10) ?? null,
      ticketValuePerYear: ticketValue,
    };

    let anniversaryYear: number;
    if (input.joiningDate) {
      const completed = completedServiceYearsAsOf(input.joiningDate, asOfDate);
      const joinYear = Number(input.joiningDate.slice(0, 4));
      let latestCompletedSettled = true;
      if (completed >= 1) {
        const latestYear = joinYear + completed;
        const latestAnn = anniversaryInYear(input.joiningDate, latestYear);
        const latestPayroll = latestAnn
          ? payrollMonthFromAnniversary(latestAnn)
          : null;
        if (latestPayroll && latestPayroll < currentMonthKey) {
          const alloc = allocationByKey.get(`${s.id}:${latestPayroll}`);
          latestCompletedSettled = isFlightTicketAllocationSettled(
            alloc?.status,
          );
        }
      }
      anniversaryYear =
        resolveDisplayAnniversaryYear(input.joiningDate, asOfDate, {
          latestCompletedSettled,
        }) ?? Number(asOfDate.slice(0, 4));
    } else {
      anniversaryYear = Number(asOfDate.slice(0, 4));
    }

    candidates.push({ staff: input, anniversaryYear });
  }

  const draftRows = candidates.map(({ staff, anniversaryYear }) =>
    buildFlightTicketEntitlement({
      staff,
      anniversaryYear,
      unpaidLeaveDays: 0,
      allocation: null,
      asOfDate,
    }),
  );

  const dueWindows = draftRows.filter(
    (r) => r.workYearStart && r.workYearEnd && r.yearsCompleted >= 1,
  );

  const unpaidByStaff = new Map<
    string,
    { days: number; entries: Array<{ date: string; labelCode: string }> }
  >();
  if (dueWindows.length > 0) {
    const CHUNK = 20;
    for (let i = 0; i < dueWindows.length; i += CHUNK) {
      const chunk = dueWindows.slice(i, i + CHUNK);
      const fromDate = chunk.map((r) => r.workYearStart!).sort()[0]!;
      const toDate = chunk
        .map((r) => r.workYearEnd!)
        .sort()
        .at(-1)!;
      const schedule = await listScheduleDaysByDateRange(supabase, venueId, {
        fromDate,
        toDate,
        staffIds: chunk.map((r) => r.staffId),
        empNos: chunk.map((r) => r.empNo),
      });

      const byStaff = new Map<
        string,
        Array<{ workDate: string; labelCode: string }>
      >();
      for (const day of schedule) {
        if (!day.staff_id && !day.emp_no) continue;
        const list =
          byStaff.get(day.staff_id) ?? byStaff.get(day.emp_no) ?? [];
        list.push({
          workDate: String(day.work_date).slice(0, 10),
          labelCode: day.label_code,
        });
        if (day.staff_id) byStaff.set(day.staff_id, list);
        if (day.emp_no) byStaff.set(day.emp_no, list);
      }

      for (const row of chunk) {
        const labels =
          byStaff.get(row.staffId) ?? byStaff.get(row.empNo) ?? [];
        const unpaid = listUnpaidLeaveDaysInRange(
          labels,
          row.workYearStart!,
          row.workYearEnd!,
        );
        unpaidByStaff.set(row.staffId, {
          days: unpaid.length,
          entries: unpaid,
        });
      }
    }
  }

  const rows = candidates
    .map(({ staff, anniversaryYear }) => {
      const unpaid = unpaidByStaff.get(staff.id) ?? {
        days: 0,
        entries: [],
      };
      const draft = buildFlightTicketEntitlement({
        staff,
        anniversaryYear,
        unpaidLeaveDays: unpaid.days,
        unpaidLeaveEntries: unpaid.entries,
        allocation: null,
        asOfDate,
      });
      const alloc =
        draft.payrollMonth != null
          ? (allocationByKey.get(`${staff.id}:${draft.payrollMonth}`) ?? null)
          : null;
      return buildFlightTicketEntitlement({
        staff,
        anniversaryYear,
        unpaidLeaveDays: unpaid.days,
        unpaidLeaveEntries: unpaid.entries,
        allocation: alloc,
        asOfDate,
      });
    })
    .sort((a, b) => {
      const monthCmp = (a.payrollMonth ?? "").localeCompare(b.payrollMonth ?? "");
      if (monthCmp !== 0) return monthCmp;
      const joinCmp = (a.joiningDate ?? "").localeCompare(b.joiningDate ?? "");
      if (joinCmp !== 0) return joinCmp;
      return a.empNo.localeCompare(b.empNo);
    });

  return { asOfDate, rows, migrationRequired };
}

/** @deprecated Prefer loadFlightTicketEntitlements; kept for month-scoped prepare. */
export async function loadFlightTicketEntitlementsForMonth(
  supabase: SupabaseClient,
  venueId: string,
  monthKey: string,
): Promise<{
  monthKey: string;
  rows: FlightTicketEntitlement[];
  migrationRequired: boolean;
}> {
  const raw = monthKey.trim();
  const payrollMonth =
    raw.length === 7 ? `${raw}-01` : raw.slice(0, 10);
  const loaded = await loadFlightTicketEntitlements(supabase, venueId);
  return {
    monthKey: payrollMonth,
    rows: loaded.rows.filter((r) => r.payrollMonth === payrollMonth),
    migrationRequired: loaded.migrationRequired,
  };
}
