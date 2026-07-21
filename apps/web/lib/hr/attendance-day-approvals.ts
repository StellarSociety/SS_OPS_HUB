import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ATTENDANCE_APPROVED_STATUS,
  type AttendanceApprovalStatus,
} from "@/lib/hr/attendance-approval";

export type AttendanceDayApprovalTarget = {
  staffId: string | null;
  empNo: string;
  workDate: string;
};

export type AttendanceDayApprovalRow = {
  id: string;
  staffId: string | null;
  empNo: string;
  workDate: string;
  approvalStatus: AttendanceApprovalStatus;
};

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dayKey(empNo: string, workDate: string): string {
  return `${empNo.trim().toLowerCase()}::${workDate}`;
}

/**
 * Ensure attendance day rows exist for the given staff/dates and set approval.
 * Existing punch rows keep clock times / hours; missing days become `no_punches` stubs
 * so leave / ABS / OFF can be approved for payroll without fingerprint punches.
 */
export async function upsertAttendanceDayApprovals(
  service: SupabaseClient,
  params: {
    venueId: string;
    userId: string;
    days: AttendanceDayApprovalTarget[];
    approvalStatus: AttendanceApprovalStatus;
    notes?: string | null;
  },
): Promise<{ rows: AttendanceDayApprovalRow[]; error?: string }> {
  const unique = new Map<string, AttendanceDayApprovalTarget>();
  for (const day of params.days) {
    const empNo = day.empNo.trim();
    const workDate = day.workDate.slice(0, 10);
    if (!empNo || !isIsoDate(workDate)) continue;
    unique.set(dayKey(empNo, workDate), {
      staffId: day.staffId,
      empNo,
      workDate,
    });
  }

  const targets = [...unique.values()];
  if (targets.length === 0) {
    return { rows: [], error: "No valid attendance days to approve." };
  }

  const empNos = [...new Set(targets.map((d) => d.empNo))];
  const workDates = [...new Set(targets.map((d) => d.workDate))];
  const now = new Date().toISOString();

  const { data: existing, error: existingError } = await service
    .from("hr_attendance_days")
    .select("id, staff_id, emp_no, work_date, approval_status")
    .eq("venue_id", params.venueId)
    .in("emp_no", empNos)
    .in("work_date", workDates);

  if (existingError) {
    return { rows: [], error: existingError.message };
  }

  const existingByKey = new Map<
    string,
    {
      id: string;
      staff_id: string | null;
      emp_no: string;
      work_date: string;
      approval_status: string;
    }
  >();
  for (const row of existing ?? []) {
    existingByKey.set(
      dayKey(String(row.emp_no), String(row.work_date).slice(0, 10)),
      {
        id: String(row.id),
        staff_id: (row.staff_id as string | null) ?? null,
        emp_no: String(row.emp_no),
        work_date: String(row.work_date).slice(0, 10),
        approval_status: String(row.approval_status ?? "pending"),
      },
    );
  }

  const toInsert: AttendanceDayApprovalTarget[] = [];
  const toUpdateIds: string[] = [];
  const staffPatches: { id: string; staffId: string }[] = [];

  for (const target of targets) {
    const key = dayKey(target.empNo, target.workDate);
    const found = existingByKey.get(key);
    if (!found) {
      toInsert.push(target);
      continue;
    }
    toUpdateIds.push(found.id);
    if (!found.staff_id && target.staffId) {
      staffPatches.push({ id: found.id, staffId: target.staffId });
    }
  }

  if (toUpdateIds.length > 0) {
    const { error: updateError } = await service
      .from("hr_attendance_days")
      .update({
        approval_status: params.approvalStatus,
        notes: params.notes ?? undefined,
        updated_by: params.userId,
        updated_at: now,
      })
      .eq("venue_id", params.venueId)
      .in("id", toUpdateIds);

    if (updateError) {
      return { rows: [], error: updateError.message };
    }
  }

  for (const patch of staffPatches) {
    const { error: staffError } = await service
      .from("hr_attendance_days")
      .update({
        staff_id: patch.staffId,
        updated_by: params.userId,
        updated_at: now,
      })
      .eq("id", patch.id)
      .eq("venue_id", params.venueId)
      .is("staff_id", null);
    if (staffError) {
      console.error("[hr] attendance staff patch:", staffError.message);
    }
  }

  if (toInsert.length > 0) {
    const insertRows = toInsert.map((day) => ({
      venue_id: params.venueId,
      staff_id: day.staffId,
      emp_no: day.empNo,
      work_date: day.workDate,
      clock_in: null,
      clock_out: null,
      total_hours: 0,
      punch_count: 0,
      status: "no_punches" as const,
      approval_status: params.approvalStatus,
      import_batch_id: null,
      source: "system" as const,
      notes: params.notes ?? null,
      updated_by: params.userId,
      updated_at: now,
    }));

    const { data: inserted, error: insertError } = await service
      .from("hr_attendance_days")
      .upsert(insertRows, { onConflict: "venue_id,emp_no,work_date" })
      .select("id, staff_id, emp_no, work_date, approval_status");

    if (insertError) {
      return { rows: [], error: insertError.message };
    }

    for (const row of inserted ?? []) {
      existingByKey.set(
        dayKey(String(row.emp_no), String(row.work_date).slice(0, 10)),
        {
          id: String(row.id),
          staff_id: (row.staff_id as string | null) ?? null,
          emp_no: String(row.emp_no),
          work_date: String(row.work_date).slice(0, 10),
          approval_status: String(
            row.approval_status ?? params.approvalStatus,
          ),
        },
      );
    }
  }

  const rows: AttendanceDayApprovalRow[] = targets.map((target) => {
    const found = existingByKey.get(dayKey(target.empNo, target.workDate));
    return {
      id: found?.id ?? "",
      staffId: found?.staff_id ?? target.staffId,
      empNo: target.empNo,
      workDate: target.workDate,
      approvalStatus: params.approvalStatus,
    };
  }).filter((row) => Boolean(row.id));

  return { rows };
}

export function isAttendanceDayApproved(
  status: string | null | undefined,
): boolean {
  return status === ATTENDANCE_APPROVED_STATUS;
}
