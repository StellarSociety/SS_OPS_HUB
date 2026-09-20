import { describe, expect, it } from "vitest";
import {
  buildMobileAppInsights,
  dubaiDayRangeUtc,
  mobileUsagePageFromPathname,
  shiftIsoDate,
  type MobileUsageEvent,
  type MobileUsagePersonInfo,
} from "@/lib/mobile/usage";

const people: MobileUsagePersonInfo[] = [
  {
    userId: "u1",
    name: "David da Silva",
    empNo: "GRP0001",
    staffId: "s1",
    photoUrl: null,
    department: "Management",
  },
  {
    userId: "u2",
    name: "Saradhi Dakara",
    empNo: "GRP0002",
    staffId: "s2",
    photoUrl: null,
    department: "Kitchen",
  },
];

function event(
  overrides: Partial<MobileUsageEvent> & Pick<MobileUsageEvent, "userId" | "pageKey">,
): MobileUsageEvent {
  return {
    eventType: "view",
    platform: "ios",
    occurredAt: "2026-09-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("mobileUsagePageFromPathname", () => {
  it("maps venue-scoped screens", () => {
    expect(mobileUsagePageFromPathname("/m/orilla/directory/hierarchy")).toEqual({
      pageKey: "directory-hierarchy",
      label: "Hierarchy",
      path: "/m/orilla/directory/hierarchy",
    });
    expect(mobileUsagePageFromPathname("/m/orilla/leave")).toMatchObject({
      pageKey: "leave",
      label: "Leave",
    });
    expect(mobileUsagePageFromPathname("/m/orilla/payslips")).toMatchObject({
      pageKey: "payslips",
      label: "Payslips",
    });
  });

  it("skips login and the app root", () => {
    expect(mobileUsagePageFromPathname("/m/login")).toBeNull();
    expect(mobileUsagePageFromPathname("/m")).toBeNull();
    expect(mobileUsagePageFromPathname("/mobile/app-insights")).toBeNull();
  });
});

describe("buildMobileAppInsights", () => {
  it("ranks people, departments, and pages", () => {
    const insights = buildMobileAppInsights({
      periodFrom: "2026-09-19",
      periodTo: "2026-09-20",
      people,
      events: [
        event({ userId: "u1", pageKey: "directory" }),
        event({ userId: "u1", pageKey: "directory" }),
        event({ userId: "u1", pageKey: "leave", eventType: "edit" }),
        event({ userId: "u2", pageKey: "revenue" }),
      ],
    });

    expect(insights.totals.views).toBe(3);
    expect(insights.totals.edits).toBe(1);
    expect(insights.totals.activeUsers).toBe(2);
    expect(insights.people[0]?.name).toBe("David da Silva");
    expect(insights.people[0]?.views).toBe(2);
    expect(insights.people[0]?.edits).toBe(1);
    expect(insights.departments[0]?.label).toBe("Management");
    expect(insights.pagesViewed[0]?.key).toBe("directory");
    expect(insights.pagesEdited[0]?.key).toBe("leave");
  });
});

describe("dubaiDayRangeUtc", () => {
  it("covers inclusive Dubai calendar days", () => {
    const range = dubaiDayRangeUtc("2026-09-20", "2026-09-20");
    expect(range.start).toBe("2026-09-19T20:00:00.000Z");
    expect(range.endExclusive).toBe("2026-09-20T20:00:00.000Z");
    expect(shiftIsoDate("2026-09-20", -29)).toBe("2026-08-22");
  });
});
