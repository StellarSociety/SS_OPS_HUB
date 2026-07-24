import { timingSafeEqual } from "node:crypto";
import {
  assignWorkDate,
  pairPunchesIntoDays,
  type AttendancePunchRaw,
} from "@/lib/hr/attendance-import";
import { monthKeyFromWorkDate } from "@/lib/hr/attendance-months";
import { getHrVenueSetting, refreshAttendanceMonths } from "@/lib/hr/store";
import {
  DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
  HR_SETTINGS_KEYS,
  type HrAttendanceImportRules,
} from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

export type DevicePunchInput = {
  employee_id: string;
  employee_name?: string | null;
  timestamp: string;
  punch_type?: "check_in" | "check_out" | null;
  device_serial?: string | null;
};

export type DevicePunchRequest = {
  venue: string;
  secret: string;
  punches: DevicePunchInput[];
};

export type DevicePunchResult =
  | { ok: true; received: number; inserted: number; updatedDays: number }
  | { ok: false; status: number; error: string };

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Resolve punch auth secret (shared or per-venue `ATTENDANCE_PUNCH_SECRET_<SLUG>`). */
export function resolveAttendancePunchSecret(venueSlug: string): string | null {
  const normalized = venueSlug.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const perVenue = process.env[`ATTENDANCE_PUNCH_SECRET_${normalized}`]?.trim();
  if (perVenue) return perVenue;
  const shared = process.env.ATTENDANCE_PUNCH_SECRET?.trim();
  return shared || null;
}

/** Convert an absolute ISO timestamp into civil wall-clock parts in the venue TZ. */
export function isoToCivilParts(
  iso: string,
  timezone: string,
): AttendancePunchRaw | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second ?? "0");
  if (
    ![year, month, day, hour, minute, second].every((n) => Number.isFinite(n))
  ) {
    return null;
  }

  return {
    empNo: "",
    name: "",
    departmentName: "",
    locationId: "",
    year,
    month,
    day,
    hour,
    minute,
    second,
  };
}

function validatePunch(raw: unknown, index: number): DevicePunchInput | string {
  if (!raw || typeof raw !== "object") {
    return `punches[${index}] must be an object`;
  }
  const p = raw as Record<string, unknown>;
  const employee_id = String(p.employee_id ?? "").trim();
  if (!employee_id) return `punches[${index}].employee_id is required`;

  const timestamp = String(p.timestamp ?? "").trim();
  if (!timestamp || Number.isNaN(new Date(timestamp).getTime())) {
    return `punches[${index}].timestamp must be a valid ISO datetime`;
  }

  let punch_type: DevicePunchInput["punch_type"] = null;
  if (p.punch_type != null && p.punch_type !== "") {
    const t = String(p.punch_type).trim();
    if (t !== "check_in" && t !== "check_out") {
      return `punches[${index}].punch_type must be check_in, check_out, or null`;
    }
    punch_type = t;
  }

  return {
    employee_id,
    employee_name:
      p.employee_name == null ? null : String(p.employee_name).trim() || null,
    timestamp,
    punch_type,
    device_serial:
      p.device_serial == null ? null : String(p.device_serial).trim() || null,
  };
}

export function parseDevicePunchBody(
  body: unknown,
): { data: DevicePunchRequest } | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "JSON body required" };
  }
  const o = body as Record<string, unknown>;
  const venue = String(o.venue ?? "")
    .trim()
    .toLowerCase();
  if (!venue) return { error: "venue is required" };

  const secret = String(o.secret ?? "");
  if (!secret) return { error: "secret is required" };

  if (!Array.isArray(o.punches)) {
    return { error: "punches must be an array" };
  }
  if (o.punches.length === 0) {
    return { error: "punches must not be empty" };
  }
  if (o.punches.length > 500) {
    return { error: "punches limited to 500 per request" };
  }

  const punches: DevicePunchInput[] = [];
  for (let i = 0; i < o.punches.length; i++) {
    const parsed = validatePunch(o.punches[i], i);
    if (typeof parsed === "string") return { error: parsed };
    punches.push(parsed);
  }

  return { data: { venue, secret, punches } };
}

/**
 * Ingest device punches: stage in attendance_punches, upsert HR punches/days.
 */
export async function ingestDevicePunches(
  request: DevicePunchRequest,
): Promise<DevicePunchResult> {
  const expectedSecret = resolveAttendancePunchSecret(request.venue);
  if (!expectedSecret) {
    console.warn("[attendance/punch] ATTENDANCE_PUNCH_SECRET is not set");
    return { ok: false, status: 503, error: "Punch sync is not configured" };
  }
  if (!secretsEqual(request.secret, expectedSecret)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const service = createServiceClient();

  const { data: venue, error: venueError } = await service
    .from("venues")
    .select("id, slug")
    .eq("slug", request.venue)
    .maybeSingle();

  if (venueError) {
    return { ok: false, status: 500, error: venueError.message };
  }
  if (!venue) {
    return { ok: false, status: 404, error: `Unknown venue: ${request.venue}` };
  }

  const rules = await getHrVenueSetting(
    service,
    venue.id,
    HR_SETTINGS_KEYS.attendanceImportRules,
    DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
  );

  const stagingRows = request.punches.map((p) => ({
    venue: request.venue,
    employee_id: p.employee_id,
    employee_name: p.employee_name ?? null,
    timestamp: new Date(p.timestamp).toISOString(),
    punch_type: p.punch_type ?? null,
    device_serial: p.device_serial ?? null,
  }));

  const { error: stageError } = await service
    .from("attendance_punches")
    .upsert(stagingRows, {
      onConflict: "venue,employee_id,timestamp",
      ignoreDuplicates: false,
    });

  if (stageError) {
    console.error("[attendance/punch] staging upsert:", stageError.message);
    return {
      ok: false,
      status: 500,
      error: `Could not save punches: ${stageError.message}`,
    };
  }

  const { data: staffRows, error: staffError } = await service
    .from("staff")
    .select("id, emp_no, full_name")
    .eq("home_venue_id", venue.id);

  if (staffError) {
    return { ok: false, status: 500, error: staffError.message };
  }

  const staffByEmp = new Map(
    (staffRows ?? []).map((s) => [String(s.emp_no).trim().toLowerCase(), s]),
  );

  const hrPunchRows: Array<{
    venue_id: string;
    staff_id: string | null;
    emp_no: string;
    punch_at: string;
    work_date: string;
    device_name: string | null;
    location_id: string | null;
  }> = [];

  const affectedKeys = new Set<string>();

  for (const punch of request.punches) {
    const civil = isoToCivilParts(punch.timestamp, rules.timezone);
    if (!civil) continue;
    civil.empNo = punch.employee_id;
    civil.name = punch.employee_name ?? "";
    civil.locationId = punch.device_serial ?? "";

    const workDate = assignWorkDate(civil, rules.overnightCutoffTime);
    const staff = staffByEmp.get(punch.employee_id.trim().toLowerCase());
    const punchAt = new Date(punch.timestamp).toISOString();

    hrPunchRows.push({
      venue_id: venue.id,
      staff_id: staff?.id ?? null,
      emp_no: punch.employee_id,
      punch_at: punchAt,
      work_date: workDate,
      device_name: punch.employee_name ?? null,
      location_id: punch.device_serial ?? null,
    });
    affectedKeys.add(`${punch.employee_id}::${workDate}`);
  }

  for (let i = 0; i < hrPunchRows.length; i += 500) {
    const chunk = hrPunchRows.slice(i, i + 500);
    const { error } = await service.from("hr_attendance_punches").upsert(chunk, {
      onConflict: "venue_id,emp_no,punch_at",
    });
    if (error) {
      console.error("[attendance/punch] hr punch upsert:", error.message);
      return {
        ok: false,
        status: 500,
        error: `HR punch save failed: ${error.message}`,
      };
    }
  }

  const updatedDays = await rebuildAffectedAttendanceDays({
    service,
    venueId: venue.id,
    rules,
    staffByEmp,
    affectedKeys: [...affectedKeys],
  });

  const monthKeys = [
    ...new Set(
      [...affectedKeys]
        .map((k) => k.split("::")[1] ?? "")
        .map((d) => monthKeyFromWorkDate(d))
        .filter((k): k is string => Boolean(k)),
    ),
  ];
  await refreshAttendanceMonths(service, venue.id, monthKeys);

  return {
    ok: true,
    received: request.punches.length,
    inserted: request.punches.length,
    updatedDays,
  };
}

async function rebuildAffectedAttendanceDays(args: {
  service: ReturnType<typeof createServiceClient>;
  venueId: string;
  rules: HrAttendanceImportRules;
  staffByEmp: Map<string, { id: string; emp_no: string; full_name: string }>;
  affectedKeys: string[];
}): Promise<number> {
  const { service, venueId, rules, staffByEmp, affectedKeys } = args;
  if (affectedKeys.length === 0) return 0;

  const byEmp = new Map<string, Set<string>>();
  for (const key of affectedKeys) {
    const [empNo, workDate] = key.split("::");
    if (!empNo || !workDate) continue;
    let set = byEmp.get(empNo);
    if (!set) {
      set = new Set();
      byEmp.set(empNo, set);
    }
    set.add(workDate);
  }

  const allRaw: AttendancePunchRaw[] = [];

  for (const [empNo, workDates] of byEmp) {
    const dates = [...workDates].sort();
    const { data: punches, error } = await service
      .from("hr_attendance_punches")
      .select("emp_no, punch_at, device_name, location_id")
      .eq("venue_id", venueId)
      .eq("emp_no", empNo)
      .in("work_date", dates);

    if (error) {
      console.error("[attendance/punch] load punches:", error.message);
      continue;
    }

    for (const row of punches ?? []) {
      const civil = isoToCivilParts(row.punch_at, rules.timezone);
      if (!civil) continue;
      allRaw.push({
        ...civil,
        empNo: row.emp_no,
        name: row.device_name ?? "",
        locationId: row.location_id ?? "",
        departmentName: "",
      });
    }
  }

  const days = pairPunchesIntoDays(allRaw, rules);
  if (days.length === 0) return 0;

  const existingKeys = days.map((d) => ({
    emp_no: d.empNo,
    work_date: d.workDate,
  }));

  const existingByKey = new Map<
    string,
    {
      approval_status: string;
      clock_in: string | null;
      clock_out: string | null;
    }
  >();

  // Load existing days in chunks to preserve approvals when times unchanged.
  for (let i = 0; i < existingKeys.length; i += 100) {
    const slice = existingKeys.slice(i, i + 100);
    const empNos = [...new Set(slice.map((s) => s.emp_no))];
    const workDates = [...new Set(slice.map((s) => s.work_date))];
    const { data: existing } = await service
      .from("hr_attendance_days")
      .select("emp_no, work_date, approval_status, clock_in, clock_out")
      .eq("venue_id", venueId)
      .in("emp_no", empNos)
      .in("work_date", workDates);

    for (const row of existing ?? []) {
      existingByKey.set(`${row.emp_no}::${row.work_date}`, {
        approval_status: row.approval_status,
        clock_in: row.clock_in,
        clock_out: row.clock_out,
      });
    }
  }

  const now = new Date().toISOString();
  const dayRows = days.map((d) => {
    const staff = staffByEmp.get(d.empNo.trim().toLowerCase());
    const prev = existingByKey.get(`${d.empNo}::${d.workDate}`);
    const timesChanged =
      !prev ||
      prev.clock_in !== d.clockInIso ||
      prev.clock_out !== d.clockOutIso;

    return {
      venue_id: venueId,
      staff_id: staff?.id ?? null,
      emp_no: d.empNo,
      work_date: d.workDate,
      clock_in: d.clockInIso,
      clock_out: d.clockOutIso,
      total_hours: d.totalHours,
      punch_count: d.punchCount,
      status: d.status,
      approval_status:
        !timesChanged && prev
          ? (prev.approval_status as
              | "pending"
              | "approved"
              | "rejected"
              | "flagged")
          : ("pending" as const),
      source: "sync" as const,
      notes: d.notes,
      updated_at: now,
    };
  });

  for (let i = 0; i < dayRows.length; i += 200) {
    const chunk = dayRows.slice(i, i + 200);
    const { error } = await service.from("hr_attendance_days").upsert(chunk, {
      onConflict: "venue_id,emp_no,work_date",
    });
    if (error) {
      console.error("[attendance/punch] day upsert:", error.message);
      throw new Error(error.message);
    }
  }

  return dayRows.length;
}
