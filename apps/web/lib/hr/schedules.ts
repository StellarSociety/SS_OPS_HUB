/** Schedule department tabs ↔ HR department lookup names. */
export const SCHEDULE_DEPARTMENTS = [
  {
    key: "kitchen",
    label: "Kitchen",
    /** Matches `departments.name` in the venue roster. */
    departmentNames: ["Culinary"],
  },
  {
    key: "bar",
    label: "Bar",
    departmentNames: ["Beverages"],
  },
  {
    key: "floor",
    label: "Floor",
    /** Receptions/hostess stay with floor service. */
    departmentNames: ["F&B Service", "Receptions & Reservations"],
  },
  {
    key: "office",
    label: "Office",
    /**
     * Explicit office departments. Anyone not in kitchen/bar/floor also lands
     * here via `resolveScheduleDepartment` (catch-all) — HR, accounts,
     * cashier, marketing, entertainments, unset, etc.
     */
    departmentNames: [
      "Human Resources",
      "Finance & Accounts",
      "Social Media & Marketing",
      "Entertainments",
    ],
  },
] as const;

export type ScheduleDepartmentKey =
  (typeof SCHEDULE_DEPARTMENTS)[number]["key"];

/** Built-in station names when a department has no prior week to copy. */
export const DEFAULT_SCHEDULE_SECTIONS: Record<
  ScheduleDepartmentKey,
  string[]
> = {
  kitchen: [
    "Pass",
    "Raw bar",
    "Salads",
    "Pans",
    "Grill",
    "Desserts",
    "Prep",
  ],
  bar: ["Main Bar", "Lounge Bar"],
  floor: ["Reception", "Dining", "Lounge", "Terrace", "Others"],
  office: ["Front desk", "Accounts", "HR", "Others"],
};

export type ScheduleWeekSection = {
  id: string;
  name: string;
  sortOrder: number;
  staffIds: string[];
};

export type ScheduleStaffRow = {
  id: string;
  fullName: string;
  empNo: string;
  position: string | null;
  /** Manual position sort from HR lookups settings. */
  positionSortOrder: number;
  /** Working Status lookup tag (defaults to Active). */
  workingStatus: string;
  /** Employment start (`YYYY-MM-DD`); required to appear on any week. */
  joiningDate: string | null;
  /** Employment end (`YYYY-MM-DD`); null = still employed. */
  terminationDate: string | null;
};

/** Editable day-cell label (stored in `schedule_day_labels`). */
export type ScheduleDayLabel = {
  id: string;
  code: string;
  abbreviation: string;
  name: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  sortOrder: number;
};

/** Venue-scoped working shift time range (stored in `hr_shift_templates`). */
export type ShiftTemplate = {
  id: string;
  name: string;
  abbreviation: string;
  /** `HH:MM` 24h */
  startTime: string;
  /** `HH:MM` 24h */
  endTime: string;
  spansMidnight: boolean;
  bgColor: string;
  textColor: string;
  borderColor: string;
  sortOrder: number;
  isActive: boolean;
};

/** One roster cell: day label plus optional shift template when working. */
export type ScheduleCellValue = {
  labelCode: string;
  shiftTemplateId: string | null;
};

export const DEFAULT_SHIFT_TEMPLATES: Omit<ShiftTemplate, "id">[] = [
  {
    name: "11AM – 10PM",
    abbreviation: "11–10",
    startTime: "11:00",
    endTime: "22:00",
    spansMidnight: false,
    bgColor: "#d1fae5",
    textColor: "#065f46",
    borderColor: "#a7f3d0",
    sortOrder: 1,
    isActive: true,
  },
  {
    name: "12PM – 11PM",
    abbreviation: "12–11",
    startTime: "12:00",
    endTime: "23:00",
    spansMidnight: false,
    bgColor: "#d1fae5",
    textColor: "#065f46",
    borderColor: "#a7f3d0",
    sortOrder: 2,
    isActive: true,
  },
  {
    name: "2PM – 12AM",
    abbreviation: "2–12",
    startTime: "14:00",
    endTime: "00:00",
    spansMidnight: true,
    bgColor: "#d1fae5",
    textColor: "#065f46",
    borderColor: "#a7f3d0",
    sortOrder: 3,
    isActive: true,
  },
  {
    name: "4PM – 2AM",
    abbreviation: "4–2",
    startTime: "16:00",
    endTime: "02:00",
    spansMidnight: true,
    bgColor: "#d1fae5",
    textColor: "#065f46",
    borderColor: "#a7f3d0",
    sortOrder: 4,
    isActive: true,
  },
];

/** Normalize DB `HH:MM:SS` / `HH:MM` to `HH:MM`. */
export function normalizeShiftTime(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return "00:00";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export function shiftSpansMidnight(startTime: string, endTime: string): boolean {
  const start = normalizeShiftTime(startTime);
  const end = normalizeShiftTime(endTime);
  return end <= start;
}

/** Format `HH:MM` as 11AM / 12PM / 12AM. */
export function formatShiftClock(time: string): string {
  const [hRaw, mRaw] = normalizeShiftTime(time).split(":");
  let hour = Number(hRaw);
  const minutes = Number(mRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minutes)) return time;
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return minutes === 0 ? `${hour}${suffix}` : `${hour}:${String(minutes).padStart(2, "0")}${suffix}`;
}

export function formatShiftRangeLabel(startTime: string, endTime: string): string {
  return `${formatShiftClock(startTime)} – ${formatShiftClock(endTime)}`;
}

/** Actual fingerprint clock-in/out for roster cells (from `hr_attendance_days`). */
export type ScheduleAttendanceCell = {
  clockIn: string | null;
  clockOut: string | null;
  status: string;
};

export function formatAttendanceClock(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const formatted = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Dubai",
  });
  return formatted.replace(/\s/g, "").toLowerCase();
}

export function formatAttendanceRange(
  clockIn: string | null | undefined,
  clockOut: string | null | undefined,
): string | null {
  const inLabel = formatAttendanceClock(clockIn);
  const outLabel = formatAttendanceClock(clockOut);
  if (inLabel && outLabel) return `${inLabel} – ${outLabel}`;
  if (inLabel) return `${inLabel} – —`;
  if (outLabel) return `— – ${outLabel}`;
  return null;
}

/** YYYY-MM-DD for an ISO timestamp in a venue timezone. */
export function calendarDateKeyInTimezone(
  iso: string,
  timeZone = "Asia/Dubai",
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export type RosterAttendanceSource = {
  days: {
    staff_id: string | null;
    emp_no: string;
    work_date: string;
    clock_in: string | null;
    clock_out: string | null;
    status: string;
  }[];
  punches: {
    staff_id: string | null;
    emp_no: string;
    punch_at: string;
    /** Import work day (may be previous calendar day for overnight outs). */
    work_date?: string | null;
  }[];
};

function parseCutoffHourMinute(overnightCutoffTime: string): {
  hour: number;
  minute: number;
} {
  const match = overnightCutoffTime.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { hour: 5, minute: 0 };
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) {
    return { hour: 5, minute: 0 };
  }
  return { hour, minute };
}

/**
 * Resolve fingerprint punch → roster work day using the same overnight rule as import:
 * punches before the cutoff (default 05:00 venue-local) belong to the previous work day.
 */
export function workDateForPunchAt(
  punchAtIso: string,
  timeZone = "Asia/Dubai",
  overnightCutoffTime = "05:00",
): string {
  const calendarDate = calendarDateKeyInTimezone(punchAtIso, timeZone);
  if (!calendarDate) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date(punchAtIso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const cutoff = parseCutoffHourMinute(overnightCutoffTime);
  const punchMinutes = hour * 60 + minute;
  const cutoffMinutes = cutoff.hour * 60 + cutoff.minute;

  if (punchMinutes >= cutoffMinutes) return calendarDate;

  const d = new Date(`${calendarDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Map roster cells to punch in/out for the visible week.
 * Prefers imported work-day records, then pairs raw punches by **work date**
 * (overnight outs before the cutoff stay on the previous day — never as a phantom clock-in).
 */
export function buildRosterAttendanceMap(
  source: RosterAttendanceSource,
  rosterStaff: ScheduleStaffRow[],
  weekDateKeys: string[],
  timeZone = "Asia/Dubai",
  overnightCutoffTime = "05:00",
): Record<string, ScheduleAttendanceCell> {
  const staffIdByEmp = new Map(
    rosterStaff.map((member) => [member.empNo.trim().toLowerCase(), member.id]),
  );
  const weekSet = new Set(weekDateKeys);
  const map: Record<string, ScheduleAttendanceCell> = {};
  const usedPunchTimes = new Set<string>();

  function resolveStaffId(
    staffId: string | null | undefined,
    empNo: string | null | undefined,
  ): string | null {
    if (staffId) return staffId;
    const emp = String(empNo ?? "")
      .trim()
      .toLowerCase();
    if (!emp) return null;
    return staffIdByEmp.get(emp) ?? null;
  }

  for (const row of source.days) {
    const workDate = String(row.work_date).slice(0, 10);
    if (!weekSet.has(workDate)) continue;
    const staffId = resolveStaffId(row.staff_id, row.emp_no);
    if (!staffId) continue;
    map[scheduleCellKey(staffId, workDate)] = {
      clockIn: row.clock_in,
      clockOut: row.clock_out,
      status: row.status,
    };
    if (row.clock_in) usedPunchTimes.add(`${staffId}|${row.clock_in}`);
    if (row.clock_out) usedPunchTimes.add(`${staffId}|${row.clock_out}`);
  }

  type PunchGroup = { staffId: string; workDate: string; times: string[] };
  const groups = new Map<string, PunchGroup>();

  for (const punch of source.punches) {
    const staffId = resolveStaffId(punch.staff_id, punch.emp_no);
    if (!staffId) continue;
    if (usedPunchTimes.has(`${staffId}|${punch.punch_at}`)) continue;

    const workDate =
      (punch.work_date ? String(punch.work_date).slice(0, 10) : "") ||
      workDateForPunchAt(punch.punch_at, timeZone, overnightCutoffTime);
    if (!workDate || !weekSet.has(workDate)) continue;

    const key = `${staffId}:${workDate}`;
    let group = groups.get(key);
    if (!group) {
      group = { staffId, workDate, times: [] };
      groups.set(key, group);
    }
    group.times.push(punch.punch_at);
  }

  const cutoff = parseCutoffHourMinute(overnightCutoffTime);
  const cutoffMinutes = cutoff.hour * 60 + cutoff.minute;

  for (const group of groups.values()) {
    const cellKey = scheduleCellKey(group.staffId, group.workDate);
    if (map[cellKey]?.clockIn || map[cellKey]?.clockOut) continue;

    const sorted = [...group.times].sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime(),
    );
    if (sorted.length === 0) continue;

    if (sorted.length >= 2) {
      const clockIn = sorted[0]!;
      const clockOut = sorted[sorted.length - 1]!;
      map[cellKey] = {
        clockIn,
        clockOut: clockOut !== clockIn ? clockOut : null,
        status: "complete",
      };
      continue;
    }

    // Single punch: before overnight cutoff → clock out only (belongs to this work day
    // as an early morning out); otherwise → clock in only (missing out).
    const only = sorted[0]!;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    }).formatToParts(new Date(only));
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    const isEarlyMorning = h * 60 + m < cutoffMinutes;

    if (isEarlyMorning) {
      map[cellKey] = {
        clockIn: null,
        clockOut: only,
        status: "missing_clock_in",
      };
    } else {
      map[cellKey] = {
        clockIn: only,
        clockOut: null,
        status: "missing_clock_out",
      };
    }
  }

  return map;
}

export function getShiftTemplate(
  templates: ShiftTemplate[],
  id: string | null | undefined,
) {
  if (!id) return null;
  return templates.find((template) => template.id === id) ?? null;
}

export function cellValuesEqual(
  a: ScheduleCellValue | null | undefined,
  b: ScheduleCellValue | null | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.labelCode === b.labelCode &&
    (a.shiftTemplateId ?? null) === (b.shiftTemplateId ?? null)
  );
}

/** Seed / offline fallback when the lookup table is not available yet. */
export const DEFAULT_SCHEDULE_DAY_LABELS: Omit<ScheduleDayLabel, "id">[] = [
  {
    code: "SHIFT",
    abbreviation: "Shift",
    name: "Working shift",
    bgColor: "#d1fae5",
    textColor: "#065f46",
    borderColor: "#a7f3d0",
    sortOrder: 1,
  },
  {
    code: "OFF",
    abbreviation: "Off",
    name: "Day off",
    bgColor: "#e5e5e5",
    textColor: "#404040",
    borderColor: "#d4d4d4",
    sortOrder: 2,
  },
  {
    code: "AL",
    abbreviation: "AL",
    name: "Annual leave",
    bgColor: "#e0f2fe",
    textColor: "#075985",
    borderColor: "#bae6fd",
    sortOrder: 3,
  },
  {
    code: "PH",
    abbreviation: "PH",
    name: "Public holiday taken (calendar day only)",
    bgColor: "#ede9fe",
    textColor: "#5b21b6",
    borderColor: "#ddd6fe",
    sortOrder: 4,
  },
  {
    code: "PH-REPL",
    abbreviation: "PH-REPL",
    name: "Public holiday replacement taken",
    bgColor: "#c7d2fe",
    textColor: "#312e81",
    borderColor: "#a5b4fc",
    sortOrder: 5,
  },
  {
    code: "SL",
    abbreviation: "SL",
    name: "Sick leave",
    bgColor: "#ffedd5",
    textColor: "#9a3412",
    borderColor: "#fed7aa",
    sortOrder: 6,
  },
  {
    code: "UPL",
    abbreviation: "UPL",
    name: "Unpaid leave",
    bgColor: "#fef3c7",
    textColor: "#78350f",
    borderColor: "#fde68a",
    sortOrder: 7,
  },
  {
    code: "ABS",
    abbreviation: "ABS",
    name: "Absence",
    bgColor: "#ffe4e6",
    textColor: "#9f1239",
    borderColor: "#fecdd3",
    sortOrder: 8,
  },
  {
    code: "ML",
    abbreviation: "ML",
    name: "Maternal leave",
    bgColor: "#fae8ff",
    textColor: "#86198f",
    borderColor: "#f5d0fe",
    sortOrder: 9,
  },
  {
    code: "PL",
    abbreviation: "PL",
    name: "Parental leave",
    bgColor: "#e0e7ff",
    textColor: "#3730a3",
    borderColor: "#c7d2fe",
    sortOrder: 9,
  },
  {
    code: "BL",
    abbreviation: "BL",
    name: "Bereavement leave",
    bgColor: "#e7e5e4",
    textColor: "#44403c",
    borderColor: "#d6d3d1",
    sortOrder: 10,
  },
  {
    code: "LD",
    abbreviation: "LD",
    name: "Leave day (LD)",
    bgColor: "#fef3c7",
    textColor: "#92400e",
    borderColor: "#fde68a",
    sortOrder: 11,
  },
];

/** @deprecated use DEFAULT_SCHEDULE_DAY_LABELS — kept for quick imports */
export const SCHEDULE_DAY_LABELS = DEFAULT_SCHEDULE_DAY_LABELS;

export function withFallbackScheduleLabelIds(
  labels: Omit<ScheduleDayLabel, "id">[],
): ScheduleDayLabel[] {
  return labels.map((label) => ({
    ...label,
    id: `default:${label.code}`,
  }));
}

export function getScheduleDayLabel(
  labels: ScheduleDayLabel[],
  code: string | null | undefined,
) {
  if (!code) return null;
  return labels.find((label) => label.code === code) ?? null;
}

export function scheduleDayLabelStyle(label: Pick<
  ScheduleDayLabel,
  "bgColor" | "textColor" | "borderColor"
>) {
  return {
    backgroundColor: label.bgColor,
    color: label.textColor,
    borderColor: label.borderColor,
  } as const;
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((channel) => clampByte(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Relative luminance (sRGB), 0 = black, 1 = white. */
function relativeLuminance(r: number, g: number, b: number) {
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * From a single tag background colour, derive readable text + a matching
 * stroke so the roster only needs one user-picked colour.
 */
export function deriveScheduleLabelColors(bgColor: string): {
  bgColor: string;
  textColor: string;
  borderColor: string;
} {
  const rgb = hexToRgb(bgColor) ?? { r: 229, g: 229, b: 229 };
  const bg = rgbToHex(rgb.r, rgb.g, rgb.b);
  const lum = relativeLuminance(rgb.r, rgb.g, rgb.b);
  const textColor = lum > 0.55 ? "#1c1917" : "#ffffff";
  const borderColor =
    lum > 0.55
      ? rgbToHex(rgb.r * 0.82, rgb.g * 0.82, rgb.b * 0.82)
      : rgbToHex(
          Math.min(255, rgb.r + (255 - rgb.r) * 0.35),
          Math.min(255, rgb.g + (255 - rgb.g) * 0.35),
          Math.min(255, rgb.b + (255 - rgb.b) * 0.35),
        );
  return { bgColor: bg, textColor, borderColor };
}

export function scheduleCellKey(staffId: string, dateKey: string) {
  return `${staffId}:${dateKey}`;
}

/** Raw schedule day row from `hr_schedule_days` (API / DB shape). */
export type ScheduleDayRow = {
  staff_id: string;
  work_date: string;
  label_code: string;
  shift_template_id: string | null;
};

/** Map API day rows into the cell map used by the roster UI and PDF export. */
export function scheduleDaysToCellMap(
  days: ScheduleDayRow[],
  knownCodes: Set<string>,
): Record<string, ScheduleCellValue> {
  const next: Record<string, ScheduleCellValue> = {};
  for (const day of days) {
    if (!knownCodes.has(day.label_code) && day.label_code !== "LP") continue;
    const code = day.label_code === "LP" ? "AL" : day.label_code;
    if (!knownCodes.has(code)) continue;
    next[scheduleCellKey(day.staff_id, day.work_date)] = {
      labelCode: code,
      shiftTemplateId:
        code === "SHIFT" ? (day.shift_template_id ?? null) : null,
    };
  }
  return next;
}

export type ScheduleDayAssignment = {
  staffId: string;
  dateKey: string;
  labelCode: string;
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Monday (local) of the week containing `date`. */
export function getWeekMonday(date: Date = new Date()): Date {
  const d = startOfLocalDay(date);
  const day = d.getDay(); // 0=Sun … 6=Sat
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return d;
}

/** Monday for the week offset from today (0 = this week). */
export function getMondayForWeekOffset(weekOffset: number): Date {
  const monday = getWeekMonday();
  monday.setDate(monday.getDate() + weekOffset * 7);
  return monday;
}

/** Week offset (from this week) whose Monday is the week containing `date`. */
export function weekOffsetFromDate(date: Date): number {
  const target = getWeekMonday(date);
  const current = getWeekMonday();
  return Math.round(
    (target.getTime() - current.getTime()) / (7 * 24 * 60 * 60 * 1000),
  );
}

/**
 * ISO-8601 week number for a local date (weeks Mon–Sun; week 1 has the first Thursday).
 */
export function getIsoWeekNumber(date: Date): number {
  const utc = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
}

export type WeekDayColumn = {
  key: string;
  weekdayLabel: string;
  dayLabel: string;
  isToday: boolean;
  isPublicHoliday: boolean;
  publicHolidayName: string | null;
};

/** Matches schedule day label `PH` colours for calendar column highlight. */
export const PUBLIC_HOLIDAY_COLUMN = {
  bg: "#ede9fe",
  text: "#5b21b6",
  border: "#ddd6fe",
} as const;

export function getWeekDayColumns(
  monday: Date,
  publicHolidays?: ReadonlyMap<string, string> | ReadonlySet<string>,
): WeekDayColumn[] {
  const todayKey = toDateKey(startOfLocalDay(new Date()));
  return WEEKDAY_LABELS.map((weekdayLabel, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    const key = toDateKey(day);
    const holidayName =
      publicHolidays instanceof Map
        ? (publicHolidays.get(key) ?? null)
        : publicHolidays?.has(key)
          ? "Public holiday"
          : null;
    return {
      key,
      weekdayLabel,
      dayLabel: `${day.getDate()} ${MONTHS_SHORT[day.getMonth()]}`,
      isToday: key === todayKey,
      isPublicHoliday: holidayName != null,
      publicHolidayName: holidayName,
    };
  });
}

export function formatWeekRangeLabel(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const sameMonth = monday.getMonth() === sunday.getMonth();
  const sameYear = monday.getFullYear() === sunday.getFullYear();

  if (sameMonth) {
    return `${monday.getDate()}–${sunday.getDate()} ${MONTHS_SHORT[monday.getMonth()]} ${monday.getFullYear()}`;
  }
  if (sameYear) {
    return `${monday.getDate()} ${MONTHS_SHORT[monday.getMonth()]} – ${sunday.getDate()} ${MONTHS_SHORT[sunday.getMonth()]} ${monday.getFullYear()}`;
  }
  return `${monday.getDate()} ${MONTHS_SHORT[monday.getMonth()]} ${monday.getFullYear()} – ${sunday.getDate()} ${MONTHS_SHORT[sunday.getMonth()]} ${sunday.getFullYear()}`;
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** ISO date key (YYYY-MM-DD) for a local calendar day — used as schedule week_start. */
export function weekStartKeyFromDate(monday: Date): string {
  return toDateKey(monday);
}

const ISO_DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDateKey(value: string | null | undefined): boolean {
  return ISO_DATE_KEY.test(String(value ?? "").trim());
}

/**
 * True when `workDate` is strictly after the termination date.
 * The termination day itself remains a valid employment day.
 */
export function isWorkDateAfterTermination(
  workDate: string,
  terminationDate: string | null | undefined,
): boolean {
  const day = workDate.trim();
  const term = terminationDate?.trim() ?? "";
  if (!isIsoDateKey(day) || !isIsoDateKey(term)) return false;
  return day > term;
}

/** Format YYYY-MM-DD as DD/MM/YYYY for user-facing messages. */
export function formatIsoDateDisplay(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return value;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * User-facing explanation when schedule/leave is blocked after termination.
 */
export function postTerminationBlockMessage(input: {
  terminationDate: string;
  fullName?: string | null;
  empNo?: string | null;
  kind?: "schedule" | "leave";
}): string {
  const when = formatIsoDateDisplay(input.terminationDate);
  const who =
    input.fullName?.trim() ||
    (input.empNo?.trim() ? `Employee ${input.empNo.trim()}` : "This employee");
  const kind = input.kind === "leave" ? "leave" : "schedule";
  return `${who} has a termination date of ${when}. ${kind === "leave" ? "Leave" : "Schedule"} details after that date are not valid and cannot be saved.`;
}

/**
 * True when the staff member’s employment window overlaps the Mon–Sun week.
 * Hidden before joining and after termination (inclusive on both dates).
 */
export function isStaffEmployedDuringWeek(
  member: Pick<ScheduleStaffRow, "joiningDate" | "terminationDate">,
  weekMonday: Date,
): boolean {
  const joining = member.joiningDate?.trim() ?? "";
  if (!ISO_DATE_KEY.test(joining)) return false;

  const mondayKey = weekStartKeyFromDate(weekMonday);
  const sunday = new Date(weekMonday);
  sunday.setDate(weekMonday.getDate() + 6);
  const sundayKey = weekStartKeyFromDate(sunday);

  if (joining > sundayKey) return false;

  const termination = member.terminationDate?.trim() ?? "";
  if (ISO_DATE_KEY.test(termination) && termination < mondayKey) return false;

  return true;
}

/** Roster rows visible for the given week (joining → termination). */
export function filterStaffForWeek(
  staff: ScheduleStaffRow[],
  weekMonday: Date,
): ScheduleStaffRow[] {
  return staff.filter((member) => isStaffEmployedDuringWeek(member, weekMonday));
}

export function matchesScheduleDepartment(
  departmentName: string | null | undefined,
  key: ScheduleDepartmentKey,
): boolean {
  return resolveScheduleDepartment(departmentName) === key;
}

/**
 * Map an HR department name to a schedule tab.
 * Kitchen = Culinary, Bar = Beverages,
 * Floor = F&B Service + Receptions & Reservations;
 * everyone else (incl. unset) → Office.
 */
export function resolveScheduleDepartment(
  departmentName: string | null | undefined,
): ScheduleDepartmentKey {
  const normalized = departmentName?.trim().toLowerCase() ?? "";
  if (normalized) {
    for (const dept of SCHEDULE_DEPARTMENTS) {
      if (dept.key === "office") continue;
      if (
        dept.departmentNames.some((name) => name.toLowerCase() === normalized)
      ) {
        return dept.key;
      }
    }
  }
  return "office";
}
