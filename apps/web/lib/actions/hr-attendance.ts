"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { saveScheduleDayChanges } from "@/lib/actions/hr";
import {
  assignWorkDate,
  civilPartsToIso,
  parseAttendanceBuffer,
  type AttendanceDayResult,
  type AttendancePunchRaw,
} from "@/lib/hr/attendance-import";
import { canAdminLookups, canAccessStaff, canEditSchedules, canEditStaff } from "@/lib/hr/permissions";
import {
  getHrVenueSetting,
  refreshAttendanceMonths,
} from "@/lib/hr/store";
import { ATTENDANCE_APPROVED_STATUS } from "@/lib/hr/attendance-approval";
import {
  upsertAttendanceDayApprovals,
  type AttendanceDayApprovalTarget,
} from "@/lib/hr/attendance-day-approvals";
import { buildAttendanceValidationRows } from "@/lib/hr/build-attendance-validation-rows";
import { monthKeyFromWorkDate } from "@/lib/hr/attendance-months";
import { resolveActiveVenue } from "@/lib/venue/active-venue";
import {
  DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  type HrAttendanceImportRules,
} from "@/lib/hr/types";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { mirrorAttendanceApprovalsToLeave } from "@/lib/actions/hr-leave";

async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const venue = await resolveActiveVenue(supabase);
  if (!venue) redirect("/select-venue");

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  return { supabase, user, venue, permissions: permissions ?? [] };
}

export type AttendanceImportPayload = {
  filename: string;
  punches: AttendancePunchRaw[];
  days: AttendanceDayResult[];
  parseErrors: string[];
  timezone: string;
  overnightCutoffTime: string;
};

export async function saveHrAttendanceImportRules(
  formData: FormData,
): Promise<void> {
  const { user, venue, permissions } = await getAuthContext();

  if (!canAdminLookups(permissions, venue.id)) {
    return;
  }

  const overnightCutoffTime = String(
    formData.get("overnight_cutoff_time") ??
      DEFAULT_HR_ATTENDANCE_IMPORT_RULES.overnightCutoffTime,
  ).trim();
  const maxShiftHours = Number(formData.get("max_shift_hours"));
  const scheduleVarianceMinutes = Number(
    formData.get("schedule_variance_minutes"),
  );
  const timezone = String(
    formData.get("timezone") ?? DEFAULT_HR_ATTENDANCE_IMPORT_RULES.timezone,
  ).trim();

  const value: HrAttendanceImportRules = {
    overnightCutoffTime: /^\d{1,2}:\d{2}$/.test(overnightCutoffTime)
      ? overnightCutoffTime
      : DEFAULT_HR_ATTENDANCE_IMPORT_RULES.overnightCutoffTime,
    maxShiftHours:
      Number.isFinite(maxShiftHours) && maxShiftHours > 0
        ? maxShiftHours
        : DEFAULT_HR_ATTENDANCE_IMPORT_RULES.maxShiftHours,
    scheduleVarianceMinutes:
      Number.isFinite(scheduleVarianceMinutes) && scheduleVarianceMinutes >= 0
        ? scheduleVarianceMinutes
        : DEFAULT_HR_ATTENDANCE_IMPORT_RULES.scheduleVarianceMinutes,
    timezone: timezone || DEFAULT_HR_ATTENDANCE_IMPORT_RULES.timezone,
  };

  const service = createServiceClient();
  const { error } = await service.from("hr_venue_settings").upsert(
    {
      venue_id: venue.id,
      key: HR_SETTINGS_KEYS.attendanceImportRules,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "venue_id,key" },
  );
  if (error) {
    console.error("[hr] attendance import rules save failed:", error.message);
    return;
  }

  await writeAuditLog({
    actor_id: user.id,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "hr_venue_settings",
    entity_id: HR_SETTINGS_KEYS.attendanceImportRules,
    venue_id: venue.id,
    after: value,
  });

  revalidatePath("/hr/settings", "layout");
  revalidatePath("/hr/attendance", "layout");
}

/** Upload InOutData.xls/.xlsx — parse and import on the server (avoids huge client payloads). */
export async function importAttendanceFromFile(formData: FormData) {
  const { supabase, user, venue, permissions } = await getAuthContext();

  if (!canEditStaff(permissions, venue.id)) {
    return { error: "You do not have permission to import attendance." };
  }
  if (venue.is_global) {
    return { error: "Import attendance at a specific venue, not Global." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an InOutData .xls or .xlsx file to import." };
  }

  const rules = await getHrVenueSetting(
    supabase,
    venue.id,
    HR_SETTINGS_KEYS.attendanceImportRules,
    DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
  );

  let parsed;
  try {
    const buffer = await file.arrayBuffer();
    parsed = await parseAttendanceBuffer(buffer, rules);
  } catch (err) {
    console.error("[hr] attendance file read:", err);
    return {
      error:
        "Could not read the Excel file. Use the fingerprint machine InOutData export (.xls).",
    };
  }

  if (!parsed.days.length) {
    return {
      error:
        parsed.errors[0] ??
        "No punches found. InOutData format: column C = employee ID, column D = Date/Time.",
    };
  }

  return importAttendanceFromParsed({
    filename: file.name,
    punches: parsed.punches,
    days: parsed.days,
    parseErrors: parsed.errors,
    timezone: rules.timezone,
    overnightCutoffTime: rules.overnightCutoffTime,
  });
}

export async function importAttendanceFromParsed(
  payload: AttendanceImportPayload,
) {
  const { user, venue, permissions } = await getAuthContext();

  if (!canEditStaff(permissions, venue.id)) {
    return { error: "You do not have permission to import attendance." };
  }
  if (venue.is_global) {
    return { error: "Import attendance at a specific venue, not Global." };
  }
  if (!payload.days.length && !payload.punches.length) {
    return { error: "No attendance punches found in the file." };
  }

  const service = createServiceClient();

  const { data: staffRows, error: staffError } = await service
    .from("staff")
    .select("id, emp_no, full_name")
    .eq("home_venue_id", venue.id);
  if (staffError) {
    return { error: `Could not load staff: ${staffError.message}` };
  }

  const staffByEmp = new Map(
    (staffRows ?? []).map((s) => [String(s.emp_no).trim().toLowerCase(), s]),
  );

  const unmatchedSet = new Set<string>();
  for (const day of payload.days) {
    if (!staffByEmp.has(day.empNo.trim().toLowerCase())) {
      unmatchedSet.add(day.empNo);
    }
  }

  const workDates = payload.days
    .map((d) => d.workDate)
    .filter(Boolean)
    .sort();
  const distinctWorkDates = [...new Set(workDates)];
  const minWorkDate = distinctWorkDates[0] ?? null;
  const maxWorkDate = distinctWorkDates[distinctWorkDates.length - 1] ?? null;
  const monthKeys = [
    ...new Set(
      distinctWorkDates
        .map((d) => monthKeyFromWorkDate(d))
        .filter((k): k is string => Boolean(k)),
    ),
  ];

  const { data: batch, error: batchError } = await service
    .from("hr_attendance_import_batches")
    .insert({
      venue_id: venue.id,
      filename: payload.filename || null,
      row_count: payload.punches.length,
      day_count: payload.days.length,
      unmatched_emp_nos: [...unmatchedSet],
      imported_by: user.id,
      notes:
        payload.parseErrors.length > 0
          ? payload.parseErrors.slice(0, 20).join("\n")
          : null,
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    return {
      error: `Could not create import batch: ${batchError?.message ?? "unknown"}`,
    };
  }

  const batchId = batch.id as string;

  // Optional columns from hr_attendance_months migration — ignore if not applied yet.
  if (minWorkDate && maxWorkDate) {
    const { error: spanError } = await service
      .from("hr_attendance_import_batches")
      .update({
        min_work_date: minWorkDate,
        max_work_date: maxWorkDate,
        distinct_day_count: distinctWorkDates.length,
      })
      .eq("id", batchId)
      .eq("venue_id", venue.id);
    if (spanError) {
      console.warn(
        "[hr] import batch date span update skipped:",
        spanError.message,
      );
    }
  }
  const timezone =
    payload.timezone || DEFAULT_HR_ATTENDANCE_IMPORT_RULES.timezone;
  const overnightCutoff =
    payload.overnightCutoffTime ||
    DEFAULT_HR_ATTENDANCE_IMPORT_RULES.overnightCutoffTime;

  // Upsert punches
  const punchRows = payload.punches.map((p) => {
    const staff = staffByEmp.get(p.empNo.trim().toLowerCase());
    return {
      venue_id: venue.id,
      import_batch_id: batchId,
      staff_id: staff?.id ?? null,
      emp_no: p.empNo,
      punch_at: civilPartsToIso(p, timezone),
      work_date: assignWorkDate(p, overnightCutoff),
      device_name: p.name || null,
      department_name: p.departmentName || null,
      location_id: p.locationId || null,
    };
  });

  // Chunk punch upserts
  for (let i = 0; i < punchRows.length; i += 500) {
    const chunk = punchRows.slice(i, i + 500);
    const { error } = await service.from("hr_attendance_punches").upsert(chunk, {
      onConflict: "venue_id,emp_no,punch_at",
    });
    if (error) {
      console.error("[hr] punch upsert:", error.message);
      return { error: `Punch import failed: ${error.message}` };
    }
  }

  const now = new Date().toISOString();
  const dayRows = payload.days.map((d) => {
    const staff = staffByEmp.get(d.empNo.trim().toLowerCase());
    return {
      venue_id: venue.id,
      staff_id: staff?.id ?? null,
      emp_no: d.empNo,
      work_date: d.workDate,
      clock_in: d.clockInIso,
      clock_out: d.clockOutIso,
      total_hours: d.totalHours,
      punch_count: d.punchCount,
      status: d.status,
      approval_status: "pending" as const,
      import_batch_id: batchId,
      source: "import" as const,
      notes: d.notes,
      updated_by: user.id,
      updated_at: now,
    };
  });

  for (let i = 0; i < dayRows.length; i += 200) {
    const chunk = dayRows.slice(i, i + 200);
    const { error } = await service.from("hr_attendance_days").upsert(chunk, {
      onConflict: "venue_id,emp_no,work_date",
    });
    if (error) {
      console.error("[hr] attendance day upsert:", error.message);
      return { error: `Attendance day import failed: ${error.message}` };
    }
  }

  await writeAuditLog({
    actor_id: user.id,
    action: "import",
    module_key: HR_MODULE_KEY,
    entity: "hr_attendance_import_batches",
    entity_id: batchId,
    venue_id: venue.id,
    after: {
      filename: payload.filename,
      punches: payload.punches.length,
      days: payload.days.length,
      unmatched: [...unmatchedSet],
      months: monthKeys,
    },
  });

  await refreshAttendanceMonths(service, venue.id, monthKeys);

  revalidatePath("/hr/attendance", "layout");
  revalidatePath("/hr/settings/data-management", "layout");

  return {
    inserted: dayRows.length,
    updated: 0,
    total: dayRows.length,
    punchCount: punchRows.length,
    unmatchedEmpNos: [...unmatchedSet],
    batchId,
    errors: payload.parseErrors.slice(0, 50),
  };
}

/** Delete one import batch and all punches / employee-day rows from that import. */
export async function deleteAttendanceImportBatch(batchId: string) {
  const { user, venue, permissions } = await getAuthContext();

  if (!canEditStaff(permissions, venue.id)) {
    return { error: "You do not have permission to delete attendance imports." };
  }
  if (venue.is_global) {
    return { error: "Delete attendance imports at a specific venue, not Global." };
  }
  if (!batchId) {
    return { error: "Missing import batch." };
  }

  const service = createServiceClient();

  const { data: batch, error: batchLookupError } = await service
    .from("hr_attendance_import_batches")
    .select("id, filename, row_count, day_count")
    .eq("id", batchId)
    .eq("venue_id", venue.id)
    .maybeSingle();

  if (batchLookupError) {
    return { error: batchLookupError.message };
  }
  if (!batch) {
    return { error: "Import batch not found." };
  }

  // Capture month keys before delete so we can refresh the monthly index.
  const monthKeySet = new Set<string>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data: dayRows, error: monthLookupError } = await service
      .from("hr_attendance_days")
      .select("work_date")
      .eq("venue_id", venue.id)
      .eq("import_batch_id", batchId)
      .range(from, from + pageSize - 1);
    if (monthLookupError) {
      console.error(
        "[hr] delete import month lookup:",
        monthLookupError.message,
      );
      break;
    }
    for (const row of dayRows ?? []) {
      const key = monthKeyFromWorkDate(String(row.work_date ?? ""));
      if (key) monthKeySet.add(key);
    }
    if (!dayRows || dayRows.length < pageSize) break;
    from += pageSize;
  }

  const { error: punchesError } = await service
    .from("hr_attendance_punches")
    .delete()
    .eq("venue_id", venue.id)
    .eq("import_batch_id", batchId);
  if (punchesError) {
    console.error("[hr] delete import punches:", punchesError.message);
    return { error: `Could not delete punches: ${punchesError.message}` };
  }

  const { error: daysError } = await service
    .from("hr_attendance_days")
    .delete()
    .eq("venue_id", venue.id)
    .eq("import_batch_id", batchId);
  if (daysError) {
    console.error("[hr] delete import days:", daysError.message);
    return { error: `Could not delete attendance days: ${daysError.message}` };
  }

  const { error: batchDeleteError } = await service
    .from("hr_attendance_import_batches")
    .delete()
    .eq("id", batchId)
    .eq("venue_id", venue.id);
  if (batchDeleteError) {
    console.error("[hr] delete import batch:", batchDeleteError.message);
    return { error: `Could not delete import batch: ${batchDeleteError.message}` };
  }

  await writeAuditLog({
    actor_id: user.id,
    action: "delete",
    module_key: HR_MODULE_KEY,
    entity: "hr_attendance_import_batches",
    entity_id: batchId,
    venue_id: venue.id,
    before: {
      filename: batch.filename,
      row_count: batch.row_count,
      day_count: batch.day_count,
      months: [...monthKeySet],
    },
  });

  await refreshAttendanceMonths(service, venue.id, [...monthKeySet]);

  revalidatePath("/hr/attendance", "layout");
  revalidatePath("/hr/settings/data-management", "layout");

  return { ok: true as const };
}

export async function updateAttendanceApproval(params: {
  id: string;
  approvalStatus: "pending" | "approved" | "rejected" | "flagged";
  notes?: string;
}) {
  return approveAttendanceDays({
    ids: [params.id],
    approvalStatus: params.approvalStatus,
    notes: params.notes,
  });
}

/**
 * Bulk-set approval status on attendance day rows (Validation → Approve Attendance).
 * Creates `no_punches` stubs when approving roster-only leave / ABS days
 * so payroll can consume them without fingerprint punches.
 * Approved days are the only ones payroll / leave calculations should consume.
 * OFF / calendar PH do not require approval.
 */
export async function approveAttendanceDays(params: {
  ids?: string[];
  /** Roster-only (or missing) days identified by staff + date. */
  days?: AttendanceDayApprovalTarget[];
  approvalStatus?: "pending" | "approved" | "rejected" | "flagged";
  notes?: string;
}) {
  const ids = [...new Set((params.ids ?? []).filter(Boolean))];
  const dayTargets = params.days ?? [];
  if (ids.length === 0 && dayTargets.length === 0) {
    return { error: "Select at least one attendance day." };
  }

  const { user, venue, permissions } = await getAuthContext();
  if (
    !canEditStaff(permissions, venue.id) &&
    !canEditSchedules(permissions, venue.id)
  ) {
    return { error: "You do not have permission to update approvals." };
  }

  const approvalStatus = params.approvalStatus ?? ATTENDANCE_APPROVED_STATUS;
  const service = createServiceClient();

  const targets: AttendanceDayApprovalTarget[] = [...dayTargets];

  if (ids.length > 0) {
    const { data: existing, error: existingError } = await service
      .from("hr_attendance_days")
      .select("id, staff_id, emp_no, work_date")
      .eq("venue_id", venue.id)
      .in("id", ids);
    if (existingError) {
      return { error: existingError.message };
    }
    for (const row of existing ?? []) {
      targets.push({
        staffId: (row.staff_id as string | null) ?? null,
        empNo: String(row.emp_no),
        workDate: String(row.work_date).slice(0, 10),
      });
    }
  }

  const result = await upsertAttendanceDayApprovals(service, {
    venueId: venue.id,
    userId: user.id,
    days: targets,
    approvalStatus,
    notes: params.notes ?? null,
  });
  if (result.error) {
    return { error: result.error };
  }

  const monthKeys = [
    ...new Set(
      result.rows
        .map((row) => monthKeyFromWorkDate(row.workDate))
        .filter((key): key is string => Boolean(key)),
    ),
  ];
  await refreshAttendanceMonths(service, venue.id, monthKeys);

  if (approvalStatus === ATTENDANCE_APPROVED_STATUS) {
    const byStaff = new Map<string, { empNo: string; dates: string[] }>();
    for (const row of result.rows) {
      const staffId = row.staffId;
      if (!staffId) continue;
      const entry = byStaff.get(staffId) ?? { empNo: row.empNo, dates: [] };
      entry.empNo = row.empNo;
      entry.dates.push(row.workDate);
      byStaff.set(staffId, entry);
    }
    for (const [staffId, entry] of byStaff) {
      await mirrorAttendanceApprovalsToLeave({
        staffId,
        empNo: entry.empNo,
        workDates: entry.dates,
      });
    }
  }

  revalidatePath("/hr/attendance", "layout");
  revalidatePath("/hr/attendance/leave", "layout");
  revalidatePath("/hr/settings/data-management", "layout");

  return {
    ok: true as const,
    updatedIds: result.rows.map((row) => row.id),
    days: result.rows,
    approvalStatus,
  };
}

export type ValidationRosterLabelCode =
  | "ABS"
  | "PH"
  | "PH-REPL"
  | "AL"
  | "SL"
  | "SH"
  | "OFF"
  | "UPL"
  | "ML"
  | "PL"
  | "BL";

/** Map validation action codes to schedule_day_labels.code. */
function scheduleLabelForValidation(
  code: ValidationRosterLabelCode,
): string {
  return code === "SH" ? "SHIFT" : code;
}

/**
 * Persist one or more validation roster edits
 * (SH / OFF / PH-REPL / AL / SL / UPL / ML / PL / BL / ABS).
 * SH = shift for payroll (roster SHIFT) — does not invent or change hours.
 * OFF = paid day off; on a configured public holiday date, save auto-maps to PH
 * (calendar holiday taken). PH-REPL = banked replacement day taken.
 * Working SH on a public holiday accrues PH-REPL automatically (no action needed).
 */
export async function saveValidationRosterDays(params: {
  changes: {
    staffId: string;
    workDate: string;
    labelCode: ValidationRosterLabelCode;
  }[];
}) {
  if (params.changes.length === 0) {
    return { error: "No changes to save." };
  }

  const result = await saveScheduleDayChanges({
    changes: params.changes.map((change) => ({
      staffId: change.staffId,
      workDate: change.workDate,
      labelCode: scheduleLabelForValidation(change.labelCode),
      shiftTemplateId: null,
    })),
  });

  if ("ok" in result && result.ok) {
    revalidatePath("/hr/attendance", "layout");
    revalidatePath("/hr/schedules", "page");
  }
  return result;
}

/** Load roster + attendance rows for Validation when selected weeks fall outside the initial page range. */
export async function loadAttendanceValidationRowsForRange(params: {
  fromDate: string;
  toDate: string;
  empNo?: string;
}): Promise<
  | { ok: true; rows: Awaited<ReturnType<typeof buildAttendanceValidationRows>> }
  | { ok: false; error: string }
> {
  const { supabase, venue, permissions } = await getAuthContext();
  if (!canAccessStaff(permissions, venue.id)) {
    return { ok: false, error: "No access." };
  }

  const fromDate = params.fromDate.trim();
  const toDate = params.toDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    return { ok: false, error: "Invalid date range." };
  }
  if (fromDate > toDate) {
    return { ok: false, error: "Invalid date range." };
  }

  const rows = await buildAttendanceValidationRows(supabase, venue.id, {
    fromDate,
    toDate,
    empNo: params.empNo,
  });

  return { ok: true, rows };
}
