import { describe, expect, it } from "vitest";
import {
  MOBILE_HOME_TAB_ID,
  tabBarHref,
  tabBarItems,
  type MobileTabBarApp,
} from "@/lib/mobile/tab-bars";

const APPS: MobileTabBarApp[] = [
  "profile",
  "notifications",
  "revenue",
  "sentiment",
  "directory",
  "hiring",
];

describe("tab bars", () => {
  it.each(APPS)("keeps Home on the right for %s", (app) => {
    const items = tabBarItems(app);
    expect(items).toHaveLength(5);
    expect(items.at(-1)?.id).toBe(MOBILE_HOME_TAB_ID);
    expect(items.filter((tab) => tab.id === MOBILE_HOME_TAB_ID)).toHaveLength(1);
  });
});

describe("notification tab bar", () => {
  it("treats Settings as a live destination", () => {
    const settings = tabBarItems("notifications").find(
      (tab) => tab.id === "settings",
    );
    expect(settings?.pageId).toBe("notification-settings");
    expect(settings?.path).toBe("/notifications/settings");
    expect(tabBarHref("orilla", settings!.path)).toBe(
      "/m/orilla/notifications/settings",
    );
  });

  it("treats Inbox, Alerts, and Archive as live destinations", () => {
    const items = tabBarItems("notifications");
    const inbox = items.find((tab) => tab.id === "inbox");
    const alerts = items.find((tab) => tab.id === "alerts");
    const archive = items.find((tab) => tab.id === "archive");

    expect(inbox?.pageId).toBe("notifications");
    expect(alerts?.pageId).toBe("notification-alerts");
    expect(archive?.pageId).toBe("notification-archive");
    expect(tabBarHref("orilla", alerts!.path)).toBe(
      "/m/orilla/notifications/alerts",
    );
    expect(tabBarHref("orilla", archive!.path)).toBe(
      "/m/orilla/notifications/archive",
    );
  });
});

describe("directory tab bar", () => {
  it("keeps an empty slot on the left, then Staff, Celebrations, and Hierarchy", () => {
    const items = tabBarItems("directory");
    expect(items.map((tab) => tab.id)).toEqual([
      "reserved",
      "staff",
      "celebrations",
      "hierarchy",
      MOBILE_HOME_TAB_ID,
    ]);
    expect(items[0]?.pageId).toBeUndefined();
    expect(items[1]?.pageId).toBe("directory");
    expect(items[2]?.pageId).toBe("directory-celebrations");
    expect(items[3]?.pageId).toBe("directory-hierarchy");
    expect(tabBarHref("orilla", items[1]!.path)).toBe("/m/orilla/directory");
  });
});

describe("hiring tab bar", () => {
  it("keeps empty slots on the left, then Replies, Calendar, and Home", () => {
    const items = tabBarItems("hiring");
    expect(items.map((tab) => tab.id)).toEqual([
      "reserved-2",
      "reserved-3",
      "replies",
      "calendar",
      MOBILE_HOME_TAB_ID,
    ]);
    expect(items[0]?.pageId).toBeUndefined();
    expect(items[2]?.pageId).toBe("hiring");
    expect(items[3]?.pageId).toBe("hiring-calendar");
    expect(tabBarHref("orilla", items[2]!.path)).toBe("/m/orilla/hiring");
    expect(tabBarHref("orilla", items[3]!.path)).toBe(
      "/m/orilla/hiring/calendar",
    );
  });
});
