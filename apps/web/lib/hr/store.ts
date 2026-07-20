import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getHrExpiryItems,
  toHrExpiryWidgetItems,
} from "@/lib/notifications/rules/hr-expiry";
// Sensitive columns (salary, passport, EID, bank, etc.) are not protected at the DB
// column level. Reads must stay server-side and be gated by hr/salary before any
// client payload; never select those fields into a client response without that grant.
import {
  DEFAULT_EXPIRY_LEAD_DAYS,
  type ExpiryItem,
  type StaffWithLookups,
} from "./types";

const STAFF_SELECT = `
  *,
  department:departments(id, venue_id, name, sort_order),
  position:positions(id, venue_id, department_id, name, sort_order),
  employment_status:employment_statuses(id, name, sort_order),
  nationality:nationalities(id, name, fly_home_ticket_value)
`;

export async function listStaffForVenue(
  supabase: SupabaseClient,
  homeVenueId: string,
  filters?: { departmentId?: string; statusId?: string; search?: string },
) {
  let query = supabase
    .from("staff")
    .select(STAFF_SELECT)
    .eq("home_venue_id", homeVenueId)
    .order("emp_no");

  if (filters?.departmentId) {
    query = query.eq("department_id", filters.departmentId);
  }
  if (filters?.statusId) {
    query = query.eq("employment_status_id", filters.statusId);
  }

  const { data, error } = await query;
  if (error) throw error;

  let rows = (data ?? []) as StaffWithLookups[];

  if (filters?.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        s.emp_no.toLowerCase().includes(q) ||
        (s.work_email?.toLowerCase().includes(q) ?? false) ||
        (s.personal_email?.toLowerCase().includes(q) ?? false),
    );
  }

  return rows;
}

export async function getStaffById(
  supabase: SupabaseClient,
  staffId: string,
  homeVenueId: string,
) {
  const { data, error } = await supabase
    .from("staff")
    .select(STAFF_SELECT)
    .eq("id", staffId)
    .eq("home_venue_id", homeVenueId)
    .single();

  if (error) throw error;
  return data as StaffWithLookups;
}

export async function listDepartments(
  supabase: SupabaseClient,
  venueId: string,
) {
  const { data, error } = await supabase
    .from("departments")
    .select("*")
    .eq("venue_id", venueId)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function listPositions(
  supabase: SupabaseClient,
  venueId: string,
  departmentId?: string,
) {
  let query = supabase
    .from("positions")
    .select("*")
    .eq("venue_id", venueId)
    .order("sort_order");
  if (departmentId) query = query.eq("department_id", departmentId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listEmploymentStatuses(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("employment_statuses")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function listWorkingStatuses(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("working_statuses")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function listNationalities(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("nationalities")
    .select("*")
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function listCivilStatuses(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("civil_statuses")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function listGenders(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("genders")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function listInsuranceCategories(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("insurance_categories")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function listCertificationTypes(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("certification_types")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

/** Load a single venue HR setting JSON, merged over the provided defaults. */
export async function getHrVenueSetting<T>(
  supabase: SupabaseClient,
  venueId: string,
  key: string,
  defaults: T,
): Promise<T> {
  const { data, error } = await supabase
    .from("hr_venue_settings")
    .select("value")
    .eq("venue_id", venueId)
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  if (!data?.value) return defaults;
  return { ...defaults, ...(data.value as Partial<T>) };
}

export async function getExpiryItems(
  supabase: SupabaseClient,
  homeVenueId: string,
  leadDays = DEFAULT_EXPIRY_LEAD_DAYS,
  options?: { allVenues?: boolean },
): Promise<ExpiryItem[]> {
  const items = await getHrExpiryItems(supabase, homeVenueId, leadDays, options);
  return toHrExpiryWidgetItems(items);
}

/**
 * Suggest the next employee number for a venue. Finds the highest numeric
 * emp_no already in use and returns it + 1 (zero-padded to match the widest
 * existing value). Falls back to "1" when there are no numeric emp numbers yet.
 */
export async function suggestNextEmpNo(
  supabase: SupabaseClient,
  homeVenueId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("staff")
    .select("emp_no")
    .eq("home_venue_id", homeVenueId);
  if (error) throw error;

  // Codes use an optional alphabetic prefix followed by a zero-padded number,
  // e.g. "ORL0056". Group by prefix so the next value continues the same series
  // ("ORL0057") and keeps the widest padding seen for that prefix.
  const groups = new Map<
    string,
    { prefix: string; max: number; width: number }
  >();
  for (const row of data ?? []) {
    const raw = String((row as { emp_no: string }).emp_no ?? "").trim();
    const match = /^([A-Za-z]*)(\d+)$/.exec(raw);
    if (!match) continue;
    const prefix = match[1];
    const digits = match[2];
    const n = Number(digits);
    const key = prefix.toUpperCase();
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { prefix, max: n, width: digits.length });
    } else {
      existing.width = Math.max(existing.width, digits.length);
      if (n > existing.max) {
        existing.max = n;
        existing.prefix = prefix;
      }
    }
  }

  if (groups.size === 0) return "1";

  // Continue the series whose highest number is largest (the active roster).
  let best: { prefix: string; max: number; width: number } | null = null;
  for (const info of groups.values()) {
    if (!best || info.max > best.max) best = info;
  }

  const next = best!.max + 1;
  return `${best!.prefix}${String(next).padStart(best!.width, "0")}`;
}

export function resolveLookupId<T extends { id: string; name: string }>(
  items: T[],
  name: string | undefined,
): string | null {
  if (!name?.trim()) return null;
  const normalized = name.trim().toLowerCase();
  const match = items.find((i) => i.name.toLowerCase() === normalized);
  return match?.id ?? null;
}

export function resolvePositionId(
  positions: { id: string; name: string; department_id: string }[],
  departmentId: string | null,
  name: string | undefined,
): string | null {
  if (!name?.trim()) return null;
  const normalized = name.trim().toLowerCase();
  const pool = departmentId
    ? positions.filter((p) => p.department_id === departmentId)
    : positions;
  const match = pool.find((p) => p.name.toLowerCase() === normalized);
  return match?.id ?? null;
}

export async function listStaffScheduleDays(
  supabase: SupabaseClient,
  venueId: string,
  opts: { staffIds: string[]; fromDate: string; toDate: string },
) {
  if (opts.staffIds.length === 0) return [];

  const { data, error } = await supabase
    .from("hr_schedule_days")
    .select("id, staff_id, emp_no, work_date, label_code, shift_template_id")
    .eq("venue_id", venueId)
    .in("staff_id", opts.staffIds)
    .gte("work_date", opts.fromDate)
    .lte("work_date", opts.toDate);

  if (error) {
    // Table may not exist until the migration is applied.
    console.error("[hr] listStaffScheduleDays:", error.message);
    return [];
  }

  return (data ?? []) as {
    staff_id: string;
    emp_no: string;
    work_date: string;
    label_code: string;
    shift_template_id: string | null;
  }[];
}

export async function listShiftTemplates(
  supabase: SupabaseClient,
  venueId: string,
  opts?: { includeInactive?: boolean },
) {
  let query = supabase
    .from("hr_shift_templates")
    .select("*")
    .eq("venue_id", venueId)
    .order("sort_order");

  if (!opts?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[hr] listShiftTemplates:", error.message);
    return null;
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    abbreviation: row.abbreviation as string,
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    spansMidnight: Boolean(row.spans_midnight),
    bgColor: row.bg_color as string,
    textColor: row.text_color as string,
    borderColor: row.border_color as string,
    sortOrder: row.sort_order as number,
    isActive: row.is_active !== false,
  }));
}

export async function listScheduleDayLabels(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("schedule_day_labels")
    .select("*")
    .order("sort_order");

  if (error) {
    console.error("[hr] listScheduleDayLabels:", error.message);
    return null;
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    code: row.code as string,
    abbreviation: row.abbreviation as string,
    name: row.name as string,
    bgColor: row.bg_color as string,
    textColor: row.text_color as string,
    borderColor: row.border_color as string,
    sortOrder: row.sort_order as number,
  }));
}

export async function listPublicHolidays(
  supabase: SupabaseClient,
  venueId: string,
  opts?: { year?: number; fromDate?: string; toDate?: string },
) {
  let query = supabase
    .from("hr_public_holidays")
    .select("id, holiday_date, name")
    .eq("venue_id", venueId)
    .order("holiday_date");

  if (opts?.year != null) {
    query = query
      .gte("holiday_date", `${opts.year}-01-01`)
      .lte("holiday_date", `${opts.year}-12-31`);
  }
  if (opts?.fromDate) {
    query = query.gte("holiday_date", opts.fromDate);
  }
  if (opts?.toDate) {
    query = query.lte("holiday_date", opts.toDate);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[hr] listPublicHolidays:", error.message);
    return null;
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    holidayDate: row.holiday_date as string,
    name: row.name as string,
  }));
}

export async function listWeekSectionsRaw(
  supabase: SupabaseClient,
  venueId: string,
  departmentKey: string,
  weekStart: string,
) {
  const { data, error } = await supabase
    .from("hr_schedule_week_sections")
    .select("id, name, sort_order")
    .eq("venue_id", venueId)
    .eq("department_key", departmentKey)
    .eq("week_start", weekStart)
    .order("sort_order");

  if (error) {
    console.error("[hr] listWeekSectionsRaw:", error.message);
    return null;
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    sortOrder: row.sort_order as number,
  }));
}

export async function listWeekSectionAssignments(
  supabase: SupabaseClient,
  venueId: string,
  departmentKey: string,
  weekStart: string,
) {
  const { data, error } = await supabase
    .from("hr_schedule_section_assignments")
    .select("id, section_id, staff_id, sort_order")
    .eq("venue_id", venueId)
    .eq("department_key", departmentKey)
    .eq("week_start", weekStart)
    .order("sort_order");

  if (error) {
    console.error("[hr] listWeekSectionAssignments:", error.message);
    return null;
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    sectionId: row.section_id as string,
    staffId: row.staff_id as string,
    sortOrder: (row.sort_order as number) ?? 0,
  }));
}

/** Most recent week_start before `beforeWeekStart` that has sections for this dept. */
export async function findPreviousWeekStartWithSections(
  supabase: SupabaseClient,
  venueId: string,
  departmentKey: string,
  beforeWeekStart: string,
) {
  const { data, error } = await supabase
    .from("hr_schedule_week_sections")
    .select("week_start")
    .eq("venue_id", venueId)
    .eq("department_key", departmentKey)
    .lt("week_start", beforeWeekStart)
    .order("week_start", { ascending: false })
    .limit(1);

  if (error) {
    console.error("[hr] findPreviousWeekStartWithSections:", error.message);
    return null;
  }

  return (data?.[0]?.week_start as string | undefined) ?? null;
}

/** Distinct week_starts after `afterWeekStart` that already have sections for this dept. */
export async function listFutureWeekStartsWithSections(
  supabase: SupabaseClient,
  venueId: string,
  departmentKey: string,
  afterWeekStart: string,
) {
  const { data, error } = await supabase
    .from("hr_schedule_week_sections")
    .select("week_start")
    .eq("venue_id", venueId)
    .eq("department_key", departmentKey)
    .gt("week_start", afterWeekStart)
    .order("week_start", { ascending: true });

  if (error) {
    console.error("[hr] listFutureWeekStartsWithSections:", error.message);
    return [] as string[];
  }

  const seen = new Set<string>();
  const weeks: string[] = [];
  for (const row of data ?? []) {
    const week = row.week_start as string;
    if (!week || seen.has(week)) continue;
    seen.add(week);
    weeks.push(week);
  }
  return weeks;
}

export async function listAttendanceDays(
  supabase: SupabaseClient,
  venueId: string,
  opts: {
    fromDate: string;
    toDate: string;
    limit?: number;
    /** When true, only rows approved on Validation (payroll / leave safe). */
    approvedOnly?: boolean;
  },
) {
  const maxRows = opts.limit ?? 500;
  // PostgREST max-rows (often 1000) silently caps a single response even when
  // .limit() is higher — page with .range() until we hit maxRows or exhaust.
  const pageSize = Math.min(1000, maxRows);
  const rows: import("@/lib/types/database").HrAttendanceDay[] = [];
  let from = 0;

  while (rows.length < maxRows) {
    const take = Math.min(pageSize, maxRows - rows.length);
    const to = from + take - 1;
    let query = supabase
      .from("hr_attendance_days")
      .select("*")
      .eq("venue_id", venueId)
      .gte("work_date", opts.fromDate)
      .lte("work_date", opts.toDate)
      .order("work_date", { ascending: false })
      .order("emp_no")
      .range(from, to);

    if (opts.approvedOnly) {
      query = query.eq("approval_status", "approved");
    }

    const { data, error } = await query;

    if (error) {
      console.error("[hr] listAttendanceDays:", error.message);
      return rows;
    }

    const page = (data ??
      []) as import("@/lib/types/database").HrAttendanceDay[];
    rows.push(...page);
    if (page.length < take) break;
    from += take;
  }

  return rows;
}

/**
 * Attendance days approved on Validation — the only source payroll / leave
 * hour calculations should consume.
 */
export async function listApprovedAttendanceDaysForStaff(
  supabase: SupabaseClient,
  venueId: string,
  opts: {
    staffIds: string[];
    empNos?: string[];
    fromDate: string;
    toDate: string;
  },
) {
  return listAttendanceDaysForStaff(supabase, venueId, {
    ...opts,
    approvedOnly: true,
  });
}

export async function listAttendanceDaysForStaff(
  supabase: SupabaseClient,
  venueId: string,
  opts: {
    staffIds: string[];
    empNos?: string[];
    fromDate: string;
    toDate: string;
    /**
     * When true, only approved days (Validation → Approve Attendance).
     * Use for payroll and leave calculations — never for raw punch review.
     */
    approvedOnly?: boolean;
  },
) {
  if (opts.staffIds.length === 0 && !(opts.empNos?.length ?? 0)) return [];

  const staffIds = [...new Set(opts.staffIds.filter(Boolean))];
  const empNos = [
    ...new Set(
      (opts.empNos ?? []).map((empNo) => empNo.trim()).filter(Boolean),
    ),
  ];
  const staffIdSet = new Set(staffIds);
  const empNoSet = new Set(empNos.map((empNo) => empNo.toLowerCase()));

  let query = supabase
    .from("hr_attendance_days")
    .select(
      "staff_id, emp_no, work_date, clock_in, clock_out, status, approval_status, total_hours",
    )
    .eq("venue_id", venueId)
    .gte("work_date", opts.fromDate)
    .lte("work_date", opts.toDate)
    .order("work_date");

  if (opts.approvedOnly) {
    query = query.eq("approval_status", "approved");
  }

  if (staffIds.length > 0 && empNos.length > 0) {
    query = query.or(
      `staff_id.in.(${staffIds.join(",")}),emp_no.in.(${empNos.join(",")})`,
    );
  } else if (staffIds.length > 0) {
    query = query.in("staff_id", staffIds);
  } else {
    query = query.in("emp_no", empNos);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[hr] listAttendanceDaysForStaff:", error.message);
    return [];
  }

  // Keep a defensive client filter in case PostgREST OR matching is loose.
  return (data ?? []).filter((row) => {
    if (row.staff_id && staffIdSet.has(row.staff_id as string)) return true;
    const emp = String(row.emp_no ?? "")
      .trim()
      .toLowerCase();
    return emp.length > 0 && empNoSet.has(emp);
  }) as {
    staff_id: string | null;
    emp_no: string;
    work_date: string;
    clock_in: string | null;
    clock_out: string | null;
    status: string;
    approval_status: string;
    total_hours: number | null;
  }[];
}

export async function listAttendancePunchesForStaff(
  supabase: SupabaseClient,
  venueId: string,
  opts: {
    staffIds: string[];
    empNos?: string[];
    fromDate: string;
    toDate: string;
    /** IANA timezone for expanding the punch_at window (overnight edges). */
    timeZone?: string;
  },
) {
  if (opts.staffIds.length === 0 && !(opts.empNos?.length ?? 0)) return [];

  const staffIds = [...new Set(opts.staffIds.filter(Boolean))];
  const empNos = [
    ...new Set(
      (opts.empNos ?? []).map((empNo) => empNo.trim()).filter(Boolean),
    ),
  ];
  const staffIdSet = new Set(staffIds);
  const empNoSet = new Set(empNos.map((empNo) => empNo.toLowerCase()));

  function shiftDateKey(dateKey: string, deltaDays: number): string {
    const d = new Date(`${dateKey}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + deltaDays);
    return d.toISOString().slice(0, 10);
  }

  const fromExpanded = shiftDateKey(opts.fromDate, -1);
  const toExpanded = shiftDateKey(opts.toDate, 1);
  const startIso = `${fromExpanded}T00:00:00+04:00`;
  const endIso = `${toExpanded}T23:59:59+04:00`;

  let query = supabase
    .from("hr_attendance_punches")
    .select("staff_id, emp_no, punch_at, work_date")
    .eq("venue_id", venueId)
    .gte("punch_at", startIso)
    .lte("punch_at", endIso)
    .order("punch_at");

  if (staffIds.length > 0 && empNos.length > 0) {
    query = query.or(
      `staff_id.in.(${staffIds.join(",")}),emp_no.in.(${empNos.join(",")})`,
    );
  } else if (staffIds.length > 0) {
    query = query.in("staff_id", staffIds);
  } else {
    query = query.in("emp_no", empNos);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[hr] listAttendancePunchesForStaff:", error.message);
    return [];
  }

  return (data ?? []).filter((row) => {
    if (row.staff_id && staffIdSet.has(row.staff_id as string)) return true;
    const emp = String(row.emp_no ?? "")
      .trim()
      .toLowerCase();
    return emp.length > 0 && empNoSet.has(emp);
  }) as {
    staff_id: string | null;
    emp_no: string;
    punch_at: string;
    work_date: string | null;
  }[];
}

export async function countAttendanceForWeekRange(
  supabase: SupabaseClient,
  venueId: string,
  fromDate: string,
  toDate: string,
): Promise<{ dayCount: number; punchCount: number }> {
  const [daysResult, punchesResult] = await Promise.all([
    supabase
      .from("hr_attendance_days")
      .select("*", { count: "exact", head: true })
      .eq("venue_id", venueId)
      .gte("work_date", fromDate)
      .lte("work_date", toDate),
    supabase
      .from("hr_attendance_punches")
      .select("*", { count: "exact", head: true })
      .eq("venue_id", venueId)
      .gte("punch_at", `${fromDate}T00:00:00+04:00`)
      .lte("punch_at", `${toDate}T23:59:59+04:00`),
  ]);

  return {
    dayCount: daysResult.count ?? 0,
    punchCount: punchesResult.count ?? 0,
  };
}

export type AttendanceCoverage = {
  minWorkDate: string | null;
  maxWorkDate: string | null;
  /** Distinct calendar dates that have at least one attendance day row. */
  distinctDayCount: number;
  /** Total employee × work-date rows. */
  recordCount: number;
};

/** Cheap min/max only — used by Schedules punch hints (avoids paging all history). */
export async function getAttendanceDateBounds(
  supabase: SupabaseClient,
  venueId: string,
): Promise<{ minWorkDate: string | null; maxWorkDate: string | null }> {
  const [minRes, maxRes] = await Promise.all([
    supabase
      .from("hr_attendance_days")
      .select("work_date")
      .eq("venue_id", venueId)
      .order("work_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("hr_attendance_days")
      .select("work_date")
      .eq("venue_id", venueId)
      .order("work_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (minRes.error || maxRes.error) {
    console.error(
      "[hr] getAttendanceDateBounds:",
      minRes.error?.message ?? maxRes.error?.message,
    );
    return { minWorkDate: null, maxWorkDate: null };
  }

  return {
    minWorkDate: minRes.data?.work_date
      ? String(minRes.data.work_date).slice(0, 10)
      : null,
    maxWorkDate: maxRes.data?.work_date
      ? String(maxRes.data.work_date).slice(0, 10)
      : null,
  };
}

export async function listAttendanceMonths(
  supabase: SupabaseClient,
  venueId: string,
  opts?: { allowFallback?: boolean },
): Promise<import("@/lib/types/database").HrAttendanceMonth[]> {
  const { data, error } = await supabase
    .from("hr_attendance_months")
    .select("*")
    .eq("venue_id", venueId)
    .order("month_key", { ascending: false });

  if (!error) {
    return (data ??
      []) as import("@/lib/types/database").HrAttendanceMonth[];
  }

  if (opts?.allowFallback === false) {
    return [];
  }

  // Skeleton month keys only until hr_attendance_months exists.
  return buildAttendanceMonthsFallback(supabase, venueId);
}

async function buildAttendanceMonthsFallback(
  supabase: SupabaseClient,
  venueId: string,
): Promise<import("@/lib/types/database").HrAttendanceMonth[]> {
  const bounds = await getAttendanceDateBounds(supabase, venueId);
  if (!bounds.minWorkDate || !bounds.maxWorkDate) return [];

  const keys: string[] = [];
  const [minY, minM] = bounds.minWorkDate.split("-").map(Number);
  const [maxY, maxM] = bounds.maxWorkDate.split("-").map(Number);
  let y = minY;
  let m = minM;
  while (y < maxY || (y === maxY && m <= maxM)) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  // Skeleton only — full counts/status require hr_attendance_months migration.
  // Avoid N× round-trips that make Data Management slow before the index exists.
  return keys
    .map((monthKey) => {
      const fromDate = `${monthKey}-01`;
      const [yy, mm] = monthKey.split("-").map(Number);
      const lastDay = new Date(yy, mm, 0).getDate();
      const toDate = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
      const clampedFrom =
        monthKey === keys[0] ? bounds.minWorkDate! : fromDate;
      const clampedTo =
        monthKey === keys[keys.length - 1] ? bounds.maxWorkDate! : toDate;
      return {
        id: `${venueId}:${monthKey}`,
        venue_id: venueId,
        month_key: monthKey,
        from_date: clampedFrom,
        to_date: clampedTo,
        employee_day_count: 0,
        punch_count: 0,
        distinct_emp_count: 0,
        distinct_day_count: 0,
        complete_count: 0,
        missing_clock_in_count: 0,
        missing_clock_out_count: 0,
        incomplete_count: 0,
        no_punches_count: 0,
        pending_count: 0,
        approved_count: 0,
        rejected_count: 0,
        flagged_count: 0,
        refreshed_at: new Date().toISOString(),
      } satisfies import("@/lib/types/database").HrAttendanceMonth;
    })
    .reverse();
}

/** Recompute monthly index rows for the given month keys (YYYY-MM). */
export async function refreshAttendanceMonths(
  supabase: SupabaseClient,
  venueId: string,
  monthKeys: string[],
): Promise<void> {
  const keys = [
    ...new Set(
      monthKeys
        .map((k) => k.trim())
        .filter((k) => /^\d{4}-\d{2}$/.test(k)),
    ),
  ];
  if (keys.length === 0) return;

  const { error } = await supabase.rpc("refresh_hr_attendance_months", {
    p_venue_id: venueId,
    p_month_keys: keys,
  });
  if (error) {
    console.warn("[hr] refreshAttendanceMonths skipped:", error.message);
  }
}

export async function getAttendanceCoverage(
  supabase: SupabaseClient,
  venueId: string,
): Promise<AttendanceCoverage> {
  const empty: AttendanceCoverage = {
    minWorkDate: null,
    maxWorkDate: null,
    distinctDayCount: 0,
    recordCount: 0,
  };

  // Never use the expensive months fallback here — coverage must stay cheap.
  const [bounds, months, countRes] = await Promise.all([
    getAttendanceDateBounds(supabase, venueId),
    listAttendanceMonths(supabase, venueId, { allowFallback: false }),
    supabase
      .from("hr_attendance_days")
      .select("*", { count: "exact", head: true })
      .eq("venue_id", venueId),
  ]);

  if (countRes.error) {
    console.error("[hr] getAttendanceCoverage:", countRes.error.message);
    return empty;
  }

  const { minWorkDate, maxWorkDate } = bounds;
  if (!minWorkDate || !maxWorkDate) return empty;

  const distinctDayCount =
    months.length > 0
      ? months.reduce((sum, m) => sum + (m.distinct_day_count ?? 0), 0)
      : 0;

  return {
    minWorkDate,
    maxWorkDate,
    distinctDayCount,
    recordCount: countRes.count ?? 0,
  };
}

export type AttendanceImportBatchSummary =
  import("@/lib/types/database").HrAttendanceImportBatch & {
    minWorkDate: string | null;
    maxWorkDate: string | null;
    distinctDayCount: number;
  };

export async function listAttendanceImportBatches(
  supabase: SupabaseClient,
  venueId: string,
  limit = 10,
): Promise<AttendanceImportBatchSummary[]> {
  const { data, error } = await supabase
    .from("hr_attendance_import_batches")
    .select("*")
    .eq("venue_id", venueId)
    .order("imported_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[hr] listAttendanceImportBatches:", error.message);
    return [];
  }

  const batches = (data ??
    []) as import("@/lib/types/database").HrAttendanceImportBatch[];

  return batches.map((batch) => {
    if (batch.min_work_date && batch.max_work_date) {
      return {
        ...batch,
        minWorkDate: String(batch.min_work_date).slice(0, 10),
        maxWorkDate: String(batch.max_work_date).slice(0, 10),
        distinctDayCount: batch.distinct_day_count ?? 0,
      };
    }

    // Avoid N× bound queries when migration columns are not present yet.
    return {
      ...batch,
      minWorkDate: null,
      maxWorkDate: null,
      distinctDayCount: batch.distinct_day_count ?? 0,
    };
  });
}

export async function listScheduleDaysByDateRange(
  supabase: SupabaseClient,
  venueId: string,
  opts: { fromDate: string; toDate: string },
) {
  // One week × full venue roster can exceed PostgREST’s silent 1000-row cap.
  const pageSize = 1000;
  const maxRows = 5000;
  const rows: {
    staff_id: string;
    emp_no: string;
    work_date: string;
    label_code: string;
    shift_template_id: string | null;
  }[] = [];
  let from = 0;

  while (rows.length < maxRows) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("hr_schedule_days")
      .select("staff_id, emp_no, work_date, label_code, shift_template_id")
      .eq("venue_id", venueId)
      .gte("work_date", opts.fromDate)
      .lte("work_date", opts.toDate)
      .order("work_date")
      .order("staff_id")
      .range(from, to);

    if (error) {
      console.error("[hr] listScheduleDaysByDateRange:", error.message);
      return rows;
    }

    const page = (data ?? []) as typeof rows;
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}
