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
  it("keeps Staff, Celebrations, and Hierarchy live, with an empty fourth slot", () => {
    const items = tabBarItems("directory");
    const staff = items.find((tab) => tab.id === "staff");
    const celebrations = items.find((tab) => tab.id === "celebrations");
    const hierarchy = items.find((tab) => tab.id === "hierarchy");
    const reserved = items.find((tab) => tab.id === "reserved");

    expect(staff?.pageId).toBe("directory");
    expect(celebrations?.pageId).toBe("directory-celebrations");
    expect(hierarchy?.pageId).toBe("directory-hierarchy");
    expect(reserved?.pageId).toBeUndefined();
    expect(tabBarHref("orilla", staff!.path)).toBe("/m/orilla/directory");
  });
});
