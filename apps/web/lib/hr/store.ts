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
  opts: { fromDate: string; toDate: string; limit?: number },
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
    const { data, error } = await supabase
      .from("hr_attendance_days")
      .select("*")
      .eq("venue_id", venueId)
      .gte("work_date", opts.fromDate)
      .lte("work_date", opts.toDate)
      .order("work_date", { ascending: false })
      .order("emp_no")
      .range(from, to);

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

export async function listAttendanceDaysForStaff(
  supabase: SupabaseClient,
  venueId: string,
  opts: {
    staffIds: string[];
    empNos?: string[];
    fromDate: string;
    toDate: string;
  },
) {
  if (opts.staffIds.length === 0 && !(opts.empNos?.length ?? 0)) return [];

  const staffIdSet = new Set(opts.staffIds);
  const empNoSet = new Set(
    (opts.empNos ?? []).map((empNo) => empNo.trim().toLowerCase()).filter(Boolean),
  );

  const { data, error } = await supabase
    .from("hr_attendance_days")
    .select("staff_id, emp_no, work_date, clock_in, clock_out, status")
    .eq("venue_id", venueId)
    .gte("work_date", opts.fromDate)
    .lte("work_date", opts.toDate)
    .order("work_date");

  if (error) {
    console.error("[hr] listAttendanceDaysForStaff:", error.message);
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
    work_date: string;
    clock_in: string | null;
    clock_out: string | null;
    status: string;
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

  const staffIdSet = new Set(opts.staffIds);
  const empNoSet = new Set(
    (opts.empNos ?? []).map((empNo) => empNo.trim().toLowerCase()).filter(Boolean),
  );

  function shiftDateKey(dateKey: string, deltaDays: number): string {
    const d = new Date(`${dateKey}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + deltaDays);
    return d.toISOString().slice(0, 10);
  }

  const fromExpanded = shiftDateKey(opts.fromDate, -1);
  const toExpanded = shiftDateKey(opts.toDate, 1);
  const startIso = `${fromExpanded}T00:00:00+04:00`;
  const endIso = `${toExpanded}T23:59:59+04:00`;

  const { data, error } = await supabase
    .from("hr_attendance_punches")
    .select("staff_id, emp_no, punch_at, work_date")
    .eq("venue_id", venueId)
    .gte("punch_at", startIso)
    .lte("punch_at", endIso)
    .order("punch_at");

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

/** Page through all work_dates (PostgREST caps a single response at ~1000 rows). */
async function collectDistinctAttendanceWorkDates(
  supabase: SupabaseClient,
  venueId: string,
  opts?: { importBatchIds?: string[] },
): Promise<{ dates: Set<string>; error: string | null }> {
  const pageSize = 1000;
  const dates = new Set<string>();
  let from = 0;

  for (;;) {
    let query = supabase
      .from("hr_attendance_days")
      .select("work_date")
      .eq("venue_id", venueId)
      .range(from, from + pageSize - 1);

    if (opts?.importBatchIds?.length) {
      query = query.in("import_batch_id", opts.importBatchIds);
    }

    const { data, error } = await query;
    if (error) {
      return { dates, error: error.message };
    }

    for (const row of data ?? []) {
      const d = row.work_date ? String(row.work_date).slice(0, 10) : "";
      if (d) dates.add(d);
    }

    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return { dates, error: null };
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

  // Min/max via ordered single-row reads — do not rely on an unbounded select
  // (PostgREST silently truncates to ~1000 rows, which skews coverage).
  const [minRes, maxRes, countRes, distinctRes] = await Promise.all([
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
    supabase
      .from("hr_attendance_days")
      .select("*", { count: "exact", head: true })
      .eq("venue_id", venueId),
    collectDistinctAttendanceWorkDates(supabase, venueId),
  ]);

  if (minRes.error || maxRes.error || countRes.error || distinctRes.error) {
    console.error(
      "[hr] getAttendanceCoverage:",
      minRes.error?.message ??
        maxRes.error?.message ??
        countRes.error?.message ??
        distinctRes.error,
    );
    return empty;
  }

  const minWorkDate = minRes.data?.work_date
    ? String(minRes.data.work_date).slice(0, 10)
    : null;
  const maxWorkDate = maxRes.data?.work_date
    ? String(maxRes.data.work_date).slice(0, 10)
    : null;

  if (!minWorkDate || !maxWorkDate) return empty;

  return {
    minWorkDate,
    maxWorkDate,
    distinctDayCount: distinctRes.dates.size,
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

  if (batches.length === 0) return [];

  const batchIds = batches.map((b) => b.id);
  // Page through rows — a single select is capped at ~1000 by PostgREST.
  const pageSize = 1000;
  const byBatch = new Map<string, Set<string>>();
  let from = 0;
  for (;;) {
    const { data: dayRows, error: daysError } = await supabase
      .from("hr_attendance_days")
      .select("import_batch_id, work_date")
      .eq("venue_id", venueId)
      .in("import_batch_id", batchIds)
      .range(from, from + pageSize - 1);

    if (daysError) {
      console.error(
        "[hr] listAttendanceImportBatches dates:",
        daysError.message,
      );
      break;
    }

    for (const row of dayRows ?? []) {
      const id = row.import_batch_id as string | null;
      if (!id) continue;
      const d = row.work_date ? String(row.work_date).slice(0, 10) : "";
      if (!d) continue;
      let set = byBatch.get(id);
      if (!set) {
        set = new Set();
        byBatch.set(id, set);
      }
      set.add(d);
    }

    if (!dayRows || dayRows.length < pageSize) break;
    from += pageSize;
  }

  return batches.map((batch) => {
    const dates = byBatch.get(batch.id);
    if (!dates || dates.size === 0) {
      return {
        ...batch,
        minWorkDate: null,
        maxWorkDate: null,
        distinctDayCount: 0,
      };
    }
    const sorted = [...dates].sort();
    return {
      ...batch,
      minWorkDate: sorted[0] ?? null,
      maxWorkDate: sorted[sorted.length - 1] ?? null,
      distinctDayCount: dates.size,
    };
  });
}

export async function listScheduleDaysByDateRange(
  supabase: SupabaseClient,
  venueId: string,
  opts: { fromDate: string; toDate: string },
) {
  const { data, error } = await supabase
    .from("hr_schedule_days")
    .select("staff_id, emp_no, work_date, label_code, shift_template_id")
    .eq("venue_id", venueId)
    .gte("work_date", opts.fromDate)
    .lte("work_date", opts.toDate);

  if (error) {
    console.error("[hr] listScheduleDaysByDateRange:", error.message);
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
