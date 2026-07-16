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
import { canAdminLookups, canEditStaff } from "@/lib/hr/permissions";
import { getHrVenueSetting } from "@/lib/hr/store";
import { resolveActiveVenue } from "@/lib/venue/active-venue";
import {
  DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  type HrAttendanceImportRules,
} from "@/lib/hr/types";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

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
    },
  });

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

export async function updateAttendanceApproval(params: {
  id: string;
  approvalStatus: "pending" | "approved" | "rejected" | "flagged";
  notes?: string;
}) {
  const { user, venue, permissions } = await getAuthContext();
  if (!canEditStaff(permissions, venue.id)) {
    return { error: "You do not have permission to update approvals." };
  }

  const service = createServiceClient();
  const { error } = await service
    .from("hr_attendance_days")
    .update({
      approval_status: params.approvalStatus,
      notes: params.notes ?? undefined,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .eq("venue_id", venue.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/hr/attendance", "layout");
  return { ok: true as const };
}

export type ValidationRosterLabelCode =
  | "ABS"
  | "PH"
  | "AL"
  | "SL"
  | "SH"
  | "UPL";

/** Map validation action codes to schedule_day_labels.code. */
function scheduleLabelForValidation(
  code: ValidationRosterLabelCode,
): string {
  return code === "SH" ? "SHIFT" : code;
}

/**
 * Persist one or more validation roster edits (SH / ABS / PH / AL / SL / UPL).
 * SH = shift for payroll (roster SHIFT) — does not invent or change hours.
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
