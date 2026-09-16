import {
  countInclusiveDays,
  currentLeaveYear,
  employeeCanDeleteLeaveRequest,
  employeeCanEditLeaveRequest,
  isoDateOnly,
  isScheduleLeaveLabel,
  leaveRequestDetailsAreLocked,
  mergeLeavePolicy,
  normalizeLeaveCalendarStatus,
  normalizeScheduleLeaveCode,
  overlayBalanceUsageFromSchedule,
  policyCodeToScheduleLeaveCode,
  prepareAnnualLeaveCalculation,
  resolveAnnualLeaveEvalDate,
  type LeaveRequestListItem,
  type LeaveRequestTypeOption,
} from "@/lib/hr/leave";
import { getHrVenueSetting, listStaffScheduleDays } from "@/lib/hr/store";
import {
  HR_SETTINGS_KEYS,
  type HrLeaveBalance,
  type HrLeavePolicySettings,
} from "@/lib/hr/types";
import {
  buildMobileLeaveBalances,
  emptyMobileLeaveBalances,
  normalizeMobileBalanceRow,
  type MobileLeaveBalances,
} from "@/lib/mobile/employee-leave-balances";
import { createServiceClient } from "@/lib/supabase/service";

export type MobileLeavePage = {
  linked: boolean;
  staffId: string | null;
  terminationDate: string | null;
  requests: LeaveRequestListItem[];
  leaveTypes: LeaveRequestTypeOption[];
  balances: MobileLeaveBalances;
};

type LeaveTypeRow = {
  id: string;
  code: string;
  name: string;
  schedule_code: string | null;
  colour: string | null;
  is_active: boolean;
};

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
  rejected_at?: string | null;
  created_at: string;
  schedule_status: string | null;
  updated_by?: string | null;
};

const REQUEST_SELECT =
  "id, request_number, employee_id, leave_type_id, start_date, end_date, calendar_days, status, source, reason, employee_notes, hr_notes, submitted_at, approved_at, rejected_at, created_at, schedule_status, updated_by";

export function emptyMobileLeavePage(): MobileLeavePage {
  return {
    linked: false,
    staffId: null,
    terminationDate: null,
    requests: [],
    leaveTypes: [],
    balances: emptyMobileLeaveBalances(),
  };
}

export function scheduleCodeForLeaveType(type: {
  code: string;
  schedule_code: string | null;
}): string {
  const raw = (type.schedule_code || type.code || "").toUpperCase();
  return (
    policyCodeToScheduleLeaveCode(raw) ?? normalizeScheduleLeaveCode(raw)
  );
}

export function mapLeaveRequestRow(input: {
  row: RequestRow;
  type: LeaveTypeRow | undefined;
  staff: {
    empNo: string;
    fullName: string;
    departmentName: string | null;
  };
  actorName?: string | null;
  style?: {
    bgColor: string;
    textColor: string;
    borderColor: string;
  } | null;
}): LeaveRequestListItem {
  const start = String(input.row.start_date).slice(0, 10);
  const end = String(input.row.end_date).slice(0, 10);
  const labelCode = input.type
    ? scheduleCodeForLeaveType(input.type)
    : "AL";
  const source = input.row.source ?? "hr";
  const status = input.row.status;
  const displayStatus = normalizeLeaveCalendarStatus(status);
  const actorName = input.actorName?.trim() || null;
  return {
    id: input.row.id,
    requestNumber: input.row.request_number,
    staffId: input.row.employee_id,
    empNo: input.staff.empNo,
    fullName: input.staff.fullName,
    departmentName: input.staff.departmentName,
    leaveTypeId: input.row.leave_type_id,
    leaveTypeName: input.type?.name ?? labelCode,
    labelCode,
    fromDate: start,
    toDate: end,
    days:
      Number(input.row.calendar_days) || countInclusiveDays(start, end),
    status,
    displayStatus,
    source,
    reason: input.row.reason?.trim() || null,
    employeeNotes: input.row.employee_notes?.trim() || null,
    hrNotes: input.row.hr_notes?.trim() || null,
    submittedAt: input.row.submitted_at,
    approvedAt: input.row.approved_at,
    approvedByName: displayStatus === "approved" ? actorName : null,
    rejectedAt: input.row.rejected_at ?? null,
    rejectedByName: displayStatus === "rejected" ? actorName : null,
    createdAt: input.row.created_at,
    onSchedule: input.row.schedule_status === "synced",
    canEmployeeEdit: employeeCanEditLeaveRequest({ status, source }),
    canEmployeeDelete: employeeCanDeleteLeaveRequest(status),
    detailsLocked: leaveRequestDetailsAreLocked(status),
  };
}

export async function profileNamesById(
  ids: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data } = await createServiceClient()
    .from("profiles")
    .select("id, full_name, email")
    .in("id", unique);
  for (const profile of data ?? []) {
    const name =
      String(profile.full_name ?? "").trim() ||
      String(profile.email ?? "").trim();
    if (name) map.set(String(profile.id), name);
  }
  return map;
}

export async function listActiveLeaveTypeRows(
  service: ReturnType<typeof createServiceClient> = createServiceClient(),
): Promise<LeaveTypeRow[]> {
  const { data, error } = await service
    .from("hr_leave_types")
    .select("id, code, name, schedule_code, colour, is_active")
    .is("deleted_at", null)
    .order("display_order");
  if (error) {
    console.error("[leave] listActiveLeaveTypeRows:", error.message);
    return [];
  }
  return ((data ?? []) as LeaveTypeRow[]).filter((t) => t.is_active !== false);
}

export function leaveTypeOptionsFromRows(
  types: LeaveTypeRow[],
  styles?: Map<string, { bgColor: string; textColor: string; borderColor: string }>,
): LeaveRequestTypeOption[] {
  return types
    .map((type) => {
      const labelCode = scheduleCodeForLeaveType(type);
      const style = styles?.get(labelCode);
      return {
        id: type.id,
        code: type.code,
        name: type.name,
        labelCode,
        bgColor: style?.bgColor ?? type.colour ?? "#e5e5e5",
        textColor: style?.textColor ?? "#3D421F",
        borderColor: style?.borderColor ?? "#d4d4d4",
      };
    })
    .filter((type) => isScheduleLeaveLabel(type.labelCode));
}

export async function loadMobileStaffLeavePage(opts: {
  staffId: string;
  venueId: string;
}): Promise<MobileLeavePage> {
  const staffId = opts.staffId.trim();
  if (!staffId) return emptyMobileLeavePage();

  const service = createServiceClient();
  const { data: staff } = await service
    .from("staff")
    .select("id, emp_no, full_name, joining_date, termination_date, department:departments(name)")
    .eq("id", staffId)
    .maybeSingle();

  if (!staff?.id) return emptyMobileLeavePage();

  const dept = staff.department as { name: string } | { name: string }[] | null;
  const departmentName = Array.isArray(dept)
    ? dept[0]?.name ?? null
    : dept?.name ?? null;

  const year = currentLeaveYear();
  const terminationDate = staff.termination_date
    ? String(staff.termination_date).slice(0, 10)
    : null;
  const joiningDate = staff.joining_date
    ? String(staff.joining_date).slice(0, 10)
    : null;
  const evalIso = isoDateOnly(
    resolveAnnualLeaveEvalDate(year, new Date(), terminationDate),
  );
  const uplFrom =
    joiningDate && /^\d{4}-\d{2}-\d{2}$/.test(joiningDate)
      ? joiningDate
      : evalIso;
  const [leaveTypes, requestsResult, balancesResult, scheduleDays, storedPolicy, uplDays] =
    await Promise.all([
      listActiveLeaveTypeRows(service),
      service
        .from("hr_leave_requests")
        .select(REQUEST_SELECT)
        .eq("venue_id", opts.venueId)
        .eq("employee_id", staffId)
        .order("start_date", { ascending: false }),
      service
        .from("hr_leave_balances")
        .select("*")
        .eq("venue_id", opts.venueId)
        .eq("staff_id", staffId)
        .eq("leave_year", year)
        .order("leave_type_code"),
      listStaffScheduleDays(service, opts.venueId, {
        staffIds: [staffId],
        fromDate: `${year}-01-01`,
        toDate: `${year}-12-31`,
      }),
      getHrVenueSetting<Partial<HrLeavePolicySettings>>(
        service,
        opts.venueId,
        HR_SETTINGS_KEYS.leavePolicy,
        {},
      ),
      listStaffScheduleDays(service, opts.venueId, {
        staffIds: [staffId],
        fromDate: uplFrom,
        toDate: evalIso,
        labelCodes: ["UPL", "ABS"],
      }),
    ]);
  if (balancesResult.error) {
    console.error("[leave] mobile balances:", balancesResult.error.message);
  }

  const typeById = new Map(leaveTypes.map((t) => [t.id, t] as const));
  const staffInfo = {
    empNo: String(staff.emp_no ?? ""),
    fullName: String(staff.full_name ?? ""),
    departmentName,
  };
  const requestRows = (requestsResult.data ?? []) as RequestRow[];
  const actorNames = await profileNamesById(
    requestRows.map((row) => row.updated_by),
  );
  const requests = requestRows
    .filter((row) => normalizeLeaveCalendarStatus(row.status) !== "cancelled")
    .map((row) =>
      mapLeaveRequestRow({
        row,
        type: typeById.get(row.leave_type_id),
        staff: staffInfo,
        actorName: row.updated_by ? actorNames.get(row.updated_by) ?? null : null,
      }),
    );

  const policy = mergeLeavePolicy(storedPolicy);
  const liveBalances = overlayBalanceUsageFromSchedule({
    balances: ((balancesResult.data ?? []) as Record<string, unknown>[]).map(
      normalizeMobileBalanceRow,
    ),
    scheduleDays: scheduleDays.map((day) => ({
      label_code: day.label_code,
      work_date: String(day.work_date).slice(0, 10),
    })),
    policy,
    leaveYear: year,
    staffId,
    venueId: opts.venueId,
    terminationDate,
    pendingRequests: requestRows.map((row) => {
      const type = typeById.get(row.leave_type_id);
      return {
        scheduleCode: type ? scheduleCodeForLeaveType(type) : "",
        startDate: String(row.start_date).slice(0, 10),
        endDate: String(row.end_date).slice(0, 10),
        status: row.status,
      };
    }),
  });
  const prepared = prepareAnnualLeaveCalculation({
    joiningDate,
    leaveYear: year,
    policy,
    terminationDate,
    scheduleDays: uplDays,
    alBalance: liveBalances.find((row) => row.leave_type_code === "AL"),
  });
  const balancesWithAl = withSeededAnnualLeave(
    liveBalances,
    prepared.alSeed,
    { staffId, venueId: opts.venueId, year },
  );

  return {
    linked: true,
    staffId,
    terminationDate,
    requests,
    leaveTypes: leaveTypeOptionsFromRows(leaveTypes),
    balances: buildMobileLeaveBalances({
      year,
      balances: balancesWithAl,
      types: leaveTypes,
      annualLeaveCalculation: prepared.calculation,
    }),
  };
}

function withSeededAnnualLeave(
  balances: HrLeaveBalance[],
  seed: { entitled: number; accrued: number },
  meta: { staffId: string; venueId: string; year: number },
): HrLeaveBalance[] {
  const idx = balances.findIndex((row) => row.leave_type_code === "AL");
  if (idx >= 0) {
    return balances.map((row, i) =>
      i === idx ? { ...row, entitled: seed.entitled, accrued: seed.accrued } : row,
    );
  }
  const nowIso = new Date().toISOString();
  return [
    ...balances,
    {
      id: `synthetic-al:${meta.staffId}:${meta.year}`,
      venue_id: meta.venueId,
      staff_id: meta.staffId,
      leave_year: meta.year,
      leave_type_code: "AL",
      entitled: seed.entitled,
      accrued: seed.accrued,
      used: 0,
      scheduled: 0,
      pending: 0,
      carried_forward: 0,
      expired: 0,
      adjusted: 0,
      created_at: nowIso,
      updated_at: nowIso,
    },
  ];
}

export async function loadMobileEmployeeLeavePage(opts: {
  userId: string;
  venueId: string;
}): Promise<MobileLeavePage> {
  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("staff_id")
    .eq("id", opts.userId)
    .maybeSingle();

  const staffId =
    (profile?.staff_id as string | null | undefined)?.trim() || null;
  if (!staffId) return emptyMobileLeavePage();

  return loadMobileStaffLeavePage({
    staffId,
    venueId: opts.venueId,
  });
}
