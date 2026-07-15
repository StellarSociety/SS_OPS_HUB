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
    departmentNames: ["F&B Service"],
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
    name: "Public holiday",
    bgColor: "#ede9fe",
    textColor: "#5b21b6",
    borderColor: "#ddd6fe",
    sortOrder: 4,
  },
  {
    code: "SL",
    abbreviation: "SL",
    name: "Sick leave",
    bgColor: "#ffedd5",
    textColor: "#9a3412",
    borderColor: "#fed7aa",
    sortOrder: 5,
  },
  {
    code: "UPL",
    abbreviation: "UPL",
    name: "Unpaid leave",
    bgColor: "#fef3c7",
    textColor: "#78350f",
    borderColor: "#fde68a",
    sortOrder: 6,
  },
  {
    code: "ABS",
    abbreviation: "ABS",
    name: "Absence",
    bgColor: "#ffe4e6",
    textColor: "#9f1239",
    borderColor: "#fecdd3",
    sortOrder: 7,
  },
  {
    code: "ML",
    abbreviation: "ML",
    name: "Maternal leave",
    bgColor: "#fae8ff",
    textColor: "#86198f",
    borderColor: "#f5d0fe",
    sortOrder: 8,
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

export type WeekDayColumn = {
  key: string;
  weekdayLabel: string;
  dayLabel: string;
  isToday: boolean;
};

export function getWeekDayColumns(monday: Date): WeekDayColumn[] {
  const todayKey = toDateKey(startOfLocalDay(new Date()));
  return WEEKDAY_LABELS.map((weekdayLabel, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    const key = toDateKey(day);
    return {
      key,
      weekdayLabel,
      dayLabel: `${day.getDate()} ${MONTHS_SHORT[day.getMonth()]}`,
      isToday: key === todayKey,
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

export function matchesScheduleDepartment(
  departmentName: string | null | undefined,
  key: ScheduleDepartmentKey,
): boolean {
  const names = SCHEDULE_DEPARTMENTS.find((d) => d.key === key)?.departmentNames;
  if (!names || !departmentName) return false;
  const normalized = departmentName.trim().toLowerCase();
  return names.some((name) => name.toLowerCase() === normalized);
}
