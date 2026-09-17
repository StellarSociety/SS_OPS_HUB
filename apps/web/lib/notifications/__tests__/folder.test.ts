import { describe, expect, it } from "vitest";
import { notificationMatchesFolder } from "@/lib/notifications/folder";

function row(severity: "info" | "warning" | "critical", archived: boolean) {
  return {
    severity,
    archived_at: archived ? "2026-09-17T00:00:00.000Z" : null,
  };
}

describe("notification folders", () => {
  it("keeps active notices in Inbox and hides archived ones", () => {
    expect(notificationMatchesFolder(row("info", false), "inbox")).toBe(true);
    expect(notificationMatchesFolder(row("critical", false), "inbox")).toBe(
      true,
    );
    expect(notificationMatchesFolder(row("info", true), "inbox")).toBe(false);
  });

  it("limits Alerts to active warning and critical rows", () => {
    expect(notificationMatchesFolder(row("info", false), "alerts")).toBe(false);
    expect(notificationMatchesFolder(row("warning", false), "alerts")).toBe(
      true,
    );
    expect(notificationMatchesFolder(row("critical", false), "alerts")).toBe(
      true,
    );
    expect(notificationMatchesFolder(row("critical", true), "alerts")).toBe(
      false,
    );
  });

  it("puts only dismissed rows in Archive", () => {
    expect(notificationMatchesFolder(row("info", true), "archive")).toBe(true);
    expect(notificationMatchesFolder(row("critical", false), "archive")).toBe(
      false,
    );
  });
});
