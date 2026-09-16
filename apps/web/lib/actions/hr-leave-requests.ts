"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import {
  countInclusiveDays,
  dateRangesOverlap,
  eachIsoDateInRange,
  EMPLOYEE_LEAVE_REQUEST_SOURCE,
  employeeCanDeleteLeaveRequest,
  employeeCanEditLeaveRequest,
  leaveRequestDetailsAreLocked,
  normalizeLeaveCalendarStatus,
  normalizeScheduleLeaveCode,
  type LeaveRequestListItem,
  type LeaveRequestTypeOption,
} from "@/lib/hr/leave";
import { canAccessLeave, canAdminLookups, canEditStaff } from "@/lib/hr/permissions";
import {
  isWorkDateAfterTermination,
  postTerminationBlockMessage,
} from "@/lib/hr/schedules";
import { HR_MODULE_KEY } from "@/lib/hr/types";
import {
  emptyMobileLeavePage,
  leaveTypeOptionsFromRows,
  listActiveLeaveTypeRows,
  loadMobileEmployeeLeavePage,
  loadMobileStaffLeavePage,
  mapLeaveRequestRow,
  profileNamesById,
  scheduleCodeForLeaveType,
  type MobileLeavePage,
} from "@/lib/mobile/employee-leave";
import { requireMobileAppVenueAccess } from "@/lib/mobile/require-app-access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveActiveVenue } from "@/lib/venue/active-venue";

const REQUEST_SELECT =
  "id, request_number, employee_id, leave_type_id, start_date, end_date, calendar_days, status, source, reason, employee_notes, hr_notes, submitted_at, approved_at, rejected_at, created_at, schedule_status, updated_by";

type RequestRow = {
  id: string;
  request_number: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  calendar_days: number | null;
  status: string;
  source: string | null;
  reason: string | null;
  employee_notes: string | null;
  hr_notes: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
  schedule_status: string | null;
  updated_by: string | null;
};

function revalidateLeaveSurfaces() {
  revalidatePath("/hr/attendance/leave/requests");
  revalidatePath("/hr/attendance/leave/calendar");
  revalidatePath("/hr/attendance/leave/balances");
  revalidatePath("/hr/attendance/leave", "layout");
  revalidatePath("/m", "layout");
  revalidatePath("/mobile");
}

async function linkedStaffId(userId: string): Promise<string | null> {
  const service = createServiceClient();
  const { data } = await service
    .from("profiles")
    .select("staff_id")
    .eq("id", userId)
    .maybeSingle();
  return (data?.staff_id as string | null | undefined)?.trim() || null;
}

async function nextLeaveRequestNumber(
  service: ReturnType<typeof createServiceClient>,
  venueId: string,
  year: number,
): Promise<string> {
  const prefix = `LV-${year}-`;
  const { data } = await service
    .from("hr_leave_requests")
    .select("request_number")
    .eq("venue_id", venueId)
    .like("request_number", `${prefix}%`)
    .order("request_number", { ascending: false })
    .limit(1);
  const latest = data?.[0]?.request_number as string | undefined;
  const n = latest ? Number(latest.slice(prefix.length)) : 0;
  const next = Number.isFinite(n) ? n + 1 : 1;
  return `${prefix}${String(next).padStart(5, "0")}`;
}

async function overlappingLeaveError(input: {
  service: ReturnType<typeof createServiceClient>;
  venueId: string;
  staffId: string;
  fromDate: string;
  toDate: string;
  excludeId?: string | null;
}): Promise<string | null> {
  let query = input.service
    .from("hr_leave_requests")
    .select("id, start_date, end_date, status, request_number")
    .eq("venue_id", input.venueId)
    .eq("employee_id", input.staffId)
    .not("status", "in", "(cancelled,rejected,expired)");
  if (input.excludeId) {
    query = query.neq("id", input.excludeId);
  }
  const { data, error } = await query;
  if (error) {
    console.error("[leave] overlap check:", error.message);
    return null;
  }
  const hit = (data ?? []).find((row) => {
    const display = normalizeLeaveCalendarStatus(String(row.status));
    if (display === "cancelled" || display === "rejected") return false;
    return dateRangesOverlap(
      String(row.start_date).slice(0, 10),
      String(row.end_date).slice(0, 10),
      input.fromDate,
      input.toDate,
    );
  });
  if (!hit) return null;
  const number = String(hit.request_number ?? "").trim();
  return number
    ? `Those dates overlap an existing leave request (${number}).`
    : "Those dates overlap an existing leave request.";
}

async function resolveEmployeeStaffId(input: {
  userId: string;
  venueId: string;
  requestedStaffId?: string | null;
}): Promise<{ staffId: string } | { error: string }> {
  const ownStaffId = await linkedStaffId(input.userId);
  const requested = input.requestedStaffId?.trim() || "";
  if (!requested || requested === ownStaffId) {
    if (!ownStaffId) {
      return {
        error:
          "Your login isn’t linked to a staff record yet. Ask HR to connect your profile.",
      };
    }
    return { staffId: ownStaffId };
  }

  const supabase = await createClient();
  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", input.userId);
  const canPreview =
    canEditStaff(permissions ?? [], input.venueId) ||
    canAdminLookups(permissions ?? [], input.venueId) ||
    canAccessLeave(permissions ?? [], input.venueId);
  if (!canPreview) {
    return { error: "You can only apply for your own leave." };
  }
  return { staffId: requested };
}

function validateLeaveDates(fromDate: string, toDate: string): string | null {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(toDate)
  ) {
    return "Enter valid from and to dates.";
  }
  if (toDate < fromDate) {
    return "End date must be on or after the start date.";
  }
  return null;
}

export async function loadMobileLeavePageAction(input: {
  venueId: string;
  staffId?: string | null;
}): Promise<MobileLeavePage> {
  const access = await requireMobileAppVenueAccess(input.venueId);
  if (!access) return emptyMobileLeavePage();

  const staffId = input.staffId?.trim() || "";
  if (staffId) {
    const resolved = await resolveEmployeeStaffId({
      userId: access.userId,
      venueId: access.venueId,
      requestedStaffId: staffId,
    });
    if ("error" in resolved) return emptyMobileLeavePage();
    return loadMobileStaffLeavePage({
      staffId: resolved.staffId,
      venueId: access.venueId,
    });
  }

  return loadMobileEmployeeLeavePage({
    userId: access.userId,
    venueId: access.venueId,
  });
}

export async function submitEmployeeLeaveRequest(input: {
  venueId: string;
  staffId?: string | null;
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  reason?: string | null;
  requestId?: string | null;
}): Promise<{ error?: string; requestId?: string }> {
  const access = await requireMobileAppVenueAccess(input.venueId);
  if (!access) return { error: "You do not have access to this venue." };

  const resolved = await resolveEmployeeStaffId({
    userId: access.userId,
    venueId: access.venueId,
    requestedStaffId: input.staffId,
  });
  if ("error" in resolved) return { error: resolved.error };

  const dateError = validateLeaveDates(input.fromDate, input.toDate);
  if (dateError) return { error: dateError };

  const service = createServiceClient();
  const { data: staffRow, error: staffError } = await service
    .from("staff")
    .select("id, emp_no, full_name, termination_date")
    .eq("id", resolved.staffId)
    .maybeSingle();
  if (staffError || !staffRow) {
    return { error: staffError?.message ?? "Employee not found." };
  }

  const terminationDate =
    (staffRow.termination_date as string | null | undefined) ?? null;
  if (
    isWorkDateAfterTermination(input.fromDate, terminationDate) ||
    isWorkDateAfterTermination(input.toDate, terminationDate)
  ) {
    return {
      error: postTerminationBlockMessage({
        terminationDate: terminationDate!,
        fullName: (staffRow.full_name as string | null) ?? null,
        empNo: (staffRow.emp_no as string | null) ?? null,
        kind: "leave",
      }),
    };
  }

  const leaveTypes = await listActiveLeaveTypeRows(service);
  const leaveType = leaveTypes.find((t) => t.id === input.leaveTypeId);
  if (!leaveType) return { error: "Unknown leave type." };

  const overlap = await overlappingLeaveError({
    service,
    venueId: access.venueId,
    staffId: resolved.staffId,
    fromDate: input.fromDate,
    toDate: input.toDate,
    excludeId: input.requestId,
  });
  if (overlap) return { error: overlap };

  const days = countInclusiveDays(input.fromDate, input.toDate);
  const notes = input.reason?.trim() || null;
  const now = new Date().toISOString();
  const requestId = input.requestId?.trim() || null;

  if (requestId) {
    const { data: existing, error: existingError } = await service
      .from("hr_leave_requests")
      .select("id, status, source, employee_id")
      .eq("id", requestId)
      .eq("venue_id", access.venueId)
      .maybeSingle();
    if (existingError || !existing) {
      return { error: existingError?.message ?? "Leave request not found." };
    }
    if (existing.employee_id !== resolved.staffId) {
      return { error: "You can only edit your own leave requests." };
    }
    if (
      !employeeCanEditLeaveRequest({
        status: String(existing.status),
        source: String(existing.source ?? ""),
      })
    ) {
      return {
        error: leaveRequestDetailsAreLocked(String(existing.status))
          ? "Approved leave cannot be edited."
          : "This leave request can no longer be changed.",
      };
    }

    const { error } = await service
      .from("hr_leave_requests")
      .update({
        leave_type_id: leaveType.id,
        start_date: input.fromDate,
        end_date: input.toDate,
        calendar_days: days,
        scheduled_working_days: days,
        deductible_days: days,
        reason: notes,
        employee_notes: notes,
        updated_by: access.userId,
        updated_at: now,
      })
      .eq("id", requestId)
      .eq("venue_id", access.venueId);
    if (error) return { error: error.message };

    await writeAuditLog({
      actor_id: access.userId,
      action: "update",
      module_key: HR_MODULE_KEY,
      entity: "hr_leave_requests",
      entity_id: requestId,
      venue_id: access.venueId,
      after: {
        staffId: resolved.staffId,
        leaveTypeId: leaveType.id,
        fromDate: input.fromDate,
        toDate: input.toDate,
        days,
      },
    });
    revalidateLeaveSurfaces();
    return { requestId };
  }

  const requestNumber = await nextLeaveRequestNumber(
    service,
    access.venueId,
    Number(input.fromDate.slice(0, 4)),
  );
  const { data: inserted, error } = await service
    .from("hr_leave_requests")
    .insert({
      venue_id: access.venueId,
      request_number: requestNumber,
      employee_id: resolved.staffId,
      leave_type_id: leaveType.id,
      start_date: input.fromDate,
      end_date: input.toDate,
      start_day_duration: "full",
      end_day_duration: "full",
      calendar_days: days,
      scheduled_working_days: days,
      deductible_days: days,
      paid_days: 0,
      half_paid_days: 0,
      unpaid_days: 0,
      status: "submitted",
      source: EMPLOYEE_LEAVE_REQUEST_SOURCE,
      reason: notes,
      employee_notes: notes,
      schedule_status: "not_synced",
      submitted_at: now,
      created_by: access.userId,
      updated_by: access.userId,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[leave] employee submit:", error.message);
    return { error: error.message };
  }

  const createdId = inserted?.id as string | undefined;
  await writeAuditLog({
    actor_id: access.userId,
    action: "create",
    module_key: HR_MODULE_KEY,
    entity: "hr_leave_requests",
    entity_id: createdId ?? resolved.staffId,
    venue_id: access.venueId,
    after: {
      staffId: resolved.staffId,
      leaveTypeId: leaveType.id,
      fromDate: input.fromDate,
      toDate: input.toDate,
      days,
      status: "submitted",
      source: EMPLOYEE_LEAVE_REQUEST_SOURCE,
    },
  });

  revalidateLeaveSurfaces();
  return { requestId: createdId };
}

export async function cancelEmployeeLeaveRequest(input: {
  venueId: string;
  staffId?: string | null;
  requestId: string;
}): Promise<{ error?: string }> {
  const access = await requireMobileAppVenueAccess(input.venueId);
  if (!access) return { error: "You do not have access to this venue." };

  const resolved = await resolveEmployeeStaffId({
    userId: access.userId,
    venueId: access.venueId,
    requestedStaffId: input.staffId,
  });
  if ("error" in resolved) return { error: resolved.error };

  const service = createServiceClient();
  const { data: existing, error: existingError } = await service
    .from("hr_leave_requests")
    .select(
      "id, status, source, employee_id, start_date, end_date, leave_type_id, schedule_status",
    )
    .eq("id", input.requestId)
    .eq("venue_id", access.venueId)
    .maybeSingle();
  if (existingError || !existing) {
    return { error: existingError?.message ?? "Leave request not found." };
  }
  if (existing.employee_id !== resolved.staffId) {
    return { error: "You can only delete your own leave requests." };
  }
  if (!employeeCanDeleteLeaveRequest(String(existing.status))) {
    return {
      error: leaveRequestDetailsAreLocked(String(existing.status))
        ? "Approved leave cannot be deleted."
        : "This leave request can no longer be deleted.",
    };
  }

  const now = new Date().toISOString();
  const { error } = await service
    .from("hr_leave_requests")
    .update({
      status: "cancelled",
      cancelled_at: now,
      updated_by: access.userId,
      updated_at: now,
    })
    .eq("id", existing.id)
    .eq("venue_id", access.venueId);
  if (error) return { error: error.message };

  const source = String(existing.source ?? "").toLowerCase();
  const clearSchedule =
    source === "schedule" || existing.schedule_status === "synced";
  if (clearSchedule) {
    const types = await listActiveLeaveTypeRows(service);
    const leaveType = types.find((type) => type.id === existing.leave_type_id);
    const labelCode = leaveType
      ? scheduleCodeForLeaveType(leaveType)
      : "AL";
    await clearEmployeeLeaveFromSchedule({
      service,
      venueId: access.venueId,
      userId: access.userId,
      staffId: resolved.staffId,
      fromDate: String(existing.start_date).slice(0, 10),
      toDate: String(existing.end_date).slice(0, 10),
      labelCode,
      now,
    });
  }

  await writeAuditLog({
    actor_id: access.userId,
    action: "delete",
    module_key: HR_MODULE_KEY,
    entity: "hr_leave_requests",
    entity_id: existing.id,
    venue_id: access.venueId,
    after: { status: "cancelled", staffId: resolved.staffId },
  });

  revalidateLeaveSurfaces();
  return {};
}

async function clearEmployeeLeaveFromSchedule(input: {
  service: ReturnType<typeof createServiceClient>;
  venueId: string;
  userId: string;
  staffId: string;
  fromDate: string;
  toDate: string;
  labelCode: string;
  now: string;
}): Promise<void> {
  const { data: staffRow } = await input.service
    .from("staff")
    .select("emp_no, department_id")
    .eq("id", input.staffId)
    .eq("home_venue_id", input.venueId)
    .maybeSingle();
  if (!staffRow) return;

  const clearCode = normalizeScheduleLeaveCode(input.labelCode);
  const dates = eachIsoDateInRange(input.fromDate, input.toDate);
  if (dates.length === 0) return;

  await input.service
    .from("hr_schedule_days")
    .delete()
    .eq("venue_id", input.venueId)
    .eq("staff_id", input.staffId)
    .in("work_date", dates)
    .or(`label_code.eq.${clearCode},label_code.eq.LP`);

  const offDays = dates.map((work_date) => ({
    venue_id: input.venueId,
    staff_id: input.staffId,
    emp_no: String(staffRow.emp_no),
    work_date,
    label_code: "OFF",
    shift_template_id: null,
    department_id: (staffRow.department_id as string | null) ?? null,
    source: "manual" as const,
    updated_by: input.userId,
    updated_at: input.now,
  }));
  await input.service
    .from("hr_schedule_days")
    .upsert(offDays, { onConflict: "staff_id,work_date" });
}

export async function listVenueLeaveRequests(): Promise<{
  error?: string;
  canManage: boolean;
  requests: LeaveRequestListItem[];
  leaveTypes: LeaveRequestTypeOption[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not signed in.", canManage: false, requests: [], leaveTypes: [] };
  }

  const venue = await resolveActiveVenue(supabase);
  if (!venue) {
    return {
      error: "Select a venue to view leave requests.",
      canManage: false,
      requests: [],
      leaveTypes: [],
    };
  }

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  if (!canAccessLeave(permissions ?? [], venue.id)) {
    return {
      error: "You do not have permission to view leave requests.",
      canManage: false,
      requests: [],
      leaveTypes: [],
    };
  }

  const canManage =
    canEditStaff(permissions ?? [], venue.id) ||
    canAdminLookups(permissions ?? [], venue.id);

  const service = createServiceClient();
  const [leaveTypes, requestsResult, staffRows] = await Promise.all([
    listActiveLeaveTypeRows(service),
    service
      .from("hr_leave_requests")
      .select(REQUEST_SELECT)
      .eq("venue_id", venue.id)
      .order("start_date", { ascending: false })
      .limit(500),
    service
      .from("staff")
      .select("id, emp_no, full_name, department:departments(name)")
      .eq("home_venue_id", venue.id),
  ]);

  if (requestsResult.error) {
    return {
      error: requestsResult.error.message,
      canManage,
      requests: [],
      leaveTypes: leaveTypeOptionsFromRows(leaveTypes),
    };
  }

  const typeById = new Map(leaveTypes.map((t) => [t.id, t] as const));
  const staffById = new Map(
    (staffRows.data ?? []).map((row) => {
      const dept = row.department as
        | { name: string }
        | { name: string }[]
        | null;
      const departmentName = Array.isArray(dept)
        ? dept[0]?.name ?? null
        : dept?.name ?? null;
      return [
        String(row.id),
        {
          empNo: String(row.emp_no ?? ""),
          fullName: String(row.full_name ?? ""),
          departmentName,
        },
      ] as const;
    }),
  );

  const rows = ((requestsResult.data ?? []) as RequestRow[]).filter((row) =>
    staffById.has(row.employee_id),
  );
  const actorNames = await profileNamesById(rows.map((row) => row.updated_by));
  const requests = rows
    .map((row) => {
      const staff = staffById.get(row.employee_id);
      if (!staff) return null;
      return mapLeaveRequestRow({
        row,
        type: typeById.get(row.leave_type_id),
        staff,
        actorName: row.updated_by ? actorNames.get(row.updated_by) ?? null : null,
      });
    })
    .filter((row): row is LeaveRequestListItem => Boolean(row));

  return {
    canManage,
    requests,
    leaveTypes: leaveTypeOptionsFromRows(leaveTypes),
  };
}
