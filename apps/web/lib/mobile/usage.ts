import {
  APP_PATH,
  isMobileAppPath,
  venueSlugFromMobilePathname,
} from "@/lib/mobile/app-path";

export const MOBILE_USAGE_TIME_ZONE = "Asia/Dubai";
export const MOBILE_USAGE_EVENT_TYPES = ["view", "edit"] as const;
export type MobileUsageEventType = (typeof MOBILE_USAGE_EVENT_TYPES)[number];

export const MOBILE_USAGE_PLATFORMS = ["ios", "android", "desktop"] as const;
export type MobileUsagePlatform = (typeof MOBILE_USAGE_PLATFORMS)[number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const EXTRA_PAGES: { id: string; label: string; href: string }[] = [
  { id: "payslips", label: "Payslips", href: "/m/payslips" },
];

export type MobileUsagePage = {
  pageKey: string;
  label: string;
  path: string;
};

export type MobileUsageEvent = {
  userId: string;
  eventType: MobileUsageEventType;
  pageKey: string;
  platform: MobileUsagePlatform | null;
  occurredAt: string;
};

export type MobileUsagePersonInfo = {
  userId: string;
  name: string;
  empNo: string | null;
  staffId: string | null;
  photoUrl: string | null;
  department: string | null;
};

export type MobileAppInsightsPerson = MobileUsagePersonInfo & {
  views: number;
  edits: number;
};

export type MobileAppInsightsBar = {
  key: string;
  label: string;
  count: number;
};

export type MobileAppInsights = {
  periodFrom: string;
  periodTo: string;
  totals: {
    activeUsers: number;
    views: number;
    edits: number;
    sessions: number;
    departments: number;
  };
  people: MobileAppInsightsPerson[];
  departments: MobileAppInsightsBar[];
  pagesViewed: MobileAppInsightsBar[];
  pagesEdited: MobileAppInsightsBar[];
  daily: { date: string; label: string; views: number; edits: number }[];
  hours: MobileAppInsightsBar[];
  platforms: MobileAppInsightsBar[];
};

const PAGE_INDEX = [...APP_PATH, ...EXTRA_PAGES]
  .filter((page) => page.id !== "login")
  .slice()
  .sort((a, b) => b.href.length - a.href.length);

export function isMobileUsageEventType(
  value: string,
): value is MobileUsageEventType {
  return (MOBILE_USAGE_EVENT_TYPES as readonly string[]).includes(value);
}

export function isMobileUsagePlatform(
  value: string,
): value is MobileUsagePlatform {
  return (MOBILE_USAGE_PLATFORMS as readonly string[]).includes(value);
}

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value);
}

export function mobileUsagePageFromPathname(
  pathname: string,
): MobileUsagePage | null {
  if (!isMobileAppPath(pathname)) return null;
  const clean = pathname.split("?")[0] ?? pathname;
  const slug = venueSlugFromMobilePathname(clean);
  const normalized = slug ? clean.replace(`/m/${slug}`, "/m") : clean;
  if (normalized === "/m" || normalized === "/m/") return null;
  if (normalized === "/m/login" || normalized.startsWith("/m/login/")) {
    return null;
  }

  const match = PAGE_INDEX.find(
    (page) =>
      normalized === page.href || normalized.startsWith(`${page.href}/`),
  );
  if (!match) {
    return {
      pageKey: "other",
      label: "Other",
      path: clean,
    };
  }
  return { pageKey: match.id, label: match.label, path: clean };
}

export function dubaiCalendarDateIso(asOf: Date | string): string | null {
  const d = typeof asOf === "string" ? new Date(asOf) : asOf;
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MOBILE_USAGE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function dubaiTodayIso(asOf: Date = new Date()): string {
  return dubaiCalendarDateIso(asOf) ?? "1970-01-01";
}

export function shiftIsoDate(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function defaultMobileInsightsPeriod(asOf: Date = new Date()): {
  from: string;
  to: string;
} {
  const to = dubaiTodayIso(asOf);
  return { from: shiftIsoDate(to, -6), to };
}

/** Inclusive Dubai calendar day → UTC instant range. */
export function dubaiDayRangeUtc(fromIso: string, toIso: string): {
  start: string;
  endExclusive: string;
} {
  const start = new Date(`${fromIso}T00:00:00+04:00`);
  const endExclusive = new Date(
    `${shiftIsoDate(toIso, 1)}T00:00:00+04:00`,
  );
  return {
    start: start.toISOString(),
    endExclusive: endExclusive.toISOString(),
  };
}

function dubaiHour(iso: string): number {
  const raw = new Intl.DateTimeFormat("en-GB", {
    timeZone: MOBILE_USAGE_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
  return Number.parseInt(raw, 10);
}

function hourLabel(hour: number): string {
  const h = ((hour + 11) % 12) + 1;
  const suffix = hour < 12 ? "am" : "pm";
  return `${h}${suffix}`;
}

function dayLabel(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  }).format(date);
}

function platformLabel(platform: MobileUsagePlatform): string {
  if (platform === "ios") return "iPhone";
  if (platform === "android") return "Android";
  return "Desktop";
}

export function emptyMobileAppInsights(
  periodFrom: string,
  periodTo: string,
): MobileAppInsights {
  return {
    periodFrom,
    periodTo,
    totals: {
      activeUsers: 0,
      views: 0,
      edits: 0,
      sessions: 0,
      departments: 0,
    },
    people: [],
    departments: [],
    pagesViewed: [],
    pagesEdited: [],
    daily: dailySeries(periodFrom, periodTo, []),
    hours: [],
    platforms: [],
  };
}

function dailySeries(
  from: string,
  to: string,
  events: MobileUsageEvent[],
): MobileAppInsights["daily"] {
  const counts = new Map<string, { views: number; edits: number }>();
  for (const event of events) {
    const date = dubaiCalendarDateIso(event.occurredAt);
    if (!date) continue;
    const row = counts.get(date) ?? { views: 0, edits: 0 };
    if (event.eventType === "edit") row.edits += 1;
    else row.views += 1;
    counts.set(date, row);
  }

  const days: MobileAppInsights["daily"] = [];
  let cursor = from;
  while (cursor <= to) {
    const row = counts.get(cursor) ?? { views: 0, edits: 0 };
    days.push({
      date: cursor,
      label: dayLabel(cursor),
      views: row.views,
      edits: row.edits,
    });
    cursor = shiftIsoDate(cursor, 1);
  }
  return days;
}

function rankBars(
  counts: Map<string, number>,
  labels: Map<string, string>,
  limit: number,
): MobileAppInsightsBar[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({
      key,
      label: labels.get(key) ?? key,
      count,
    }));
}

export function buildMobileAppInsights(input: {
  periodFrom: string;
  periodTo: string;
  events: MobileUsageEvent[];
  people: MobileUsagePersonInfo[];
}): MobileAppInsights {
  const peopleById = new Map(input.people.map((person) => [person.userId, person]));
  const viewsByUser = new Map<string, number>();
  const editsByUser = new Map<string, number>();
  const viewsByPage = new Map<string, number>();
  const editsByPage = new Map<string, number>();
  const pageLabels = new Map<string, string>();
  const hours = new Map<string, number>();
  const platforms = new Map<string, number>();
  const sessions = new Set<string>();

  for (const event of input.events) {
    if (event.eventType === "edit") {
      editsByUser.set(event.userId, (editsByUser.get(event.userId) ?? 0) + 1);
      editsByPage.set(event.pageKey, (editsByPage.get(event.pageKey) ?? 0) + 1);
    } else {
      viewsByUser.set(event.userId, (viewsByUser.get(event.userId) ?? 0) + 1);
      viewsByPage.set(event.pageKey, (viewsByPage.get(event.pageKey) ?? 0) + 1);
    }
    const hour = dubaiHour(event.occurredAt);
    if (Number.isFinite(hour)) {
      const key = String(hour);
      hours.set(key, (hours.get(key) ?? 0) + 1);
    }
    if (event.platform) {
      platforms.set(event.platform, (platforms.get(event.platform) ?? 0) + 1);
    }
    const day = dubaiCalendarDateIso(event.occurredAt);
    if (day) sessions.add(`${event.userId}:${day}`);
  }

  for (const page of [...APP_PATH, ...EXTRA_PAGES]) {
    if (viewsByPage.has(page.id) || editsByPage.has(page.id)) {
      pageLabels.set(page.id, page.label);
    }
  }
  for (const key of new Set([...viewsByPage.keys(), ...editsByPage.keys()])) {
    if (!pageLabels.has(key)) {
      pageLabels.set(key, key === "other" ? "Other" : key);
    }
  }

  const userIds = new Set([...viewsByUser.keys(), ...editsByUser.keys()]);
  const people: MobileAppInsightsPerson[] = [...userIds]
    .map((userId) => {
      const info = peopleById.get(userId);
      return {
        userId,
        name: info?.name || "Unknown",
        empNo: info?.empNo ?? null,
        staffId: info?.staffId ?? null,
        photoUrl: info?.photoUrl ?? null,
        department: info?.department ?? null,
        views: viewsByUser.get(userId) ?? 0,
        edits: editsByUser.get(userId) ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.views + b.edits - (a.views + a.edits) ||
        b.views - a.views ||
        a.name.localeCompare(b.name),
    );

  const departmentCounts = new Map<string, number>();
  const departmentLabels = new Map<string, string>();
  for (const person of people) {
    const key = person.department?.trim() || "unassigned";
    const label = person.department?.trim() || "Unassigned";
    departmentLabels.set(key, label);
    departmentCounts.set(
      key,
      (departmentCounts.get(key) ?? 0) + person.views + person.edits,
    );
  }

  const platformLabels = new Map<string, string>();
  for (const [key] of platforms) {
    platformLabels.set(
      key,
      isMobileUsagePlatform(key) ? platformLabel(key) : key,
    );
  }

  const hourBars = [...hours.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([key, count]) => ({
      key,
      label: hourLabel(Number(key)),
      count,
    }));

  return {
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    totals: {
      activeUsers: people.length,
      views: input.events.filter((event) => event.eventType === "view").length,
      edits: input.events.filter((event) => event.eventType === "edit").length,
      sessions: sessions.size,
      departments: departmentCounts.size,
    },
    people: people.slice(0, 12),
    departments: rankBars(departmentCounts, departmentLabels, 12),
    pagesViewed: rankBars(viewsByPage, pageLabels, 10),
    pagesEdited: rankBars(editsByPage, pageLabels, 10),
    daily: dailySeries(input.periodFrom, input.periodTo, input.events),
    hours: hourBars,
    platforms: rankBars(platforms, platformLabels, 6),
  };
}
