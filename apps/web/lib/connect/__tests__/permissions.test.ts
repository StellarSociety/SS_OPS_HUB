import { describe, expect, it } from "vitest";
import { canAccessConnect } from "@/lib/connect/permissions";
import type { UserPermission } from "@/lib/role-permissions";

const VENUE = "venue-1";

function grant(module_key: string, feature_key: string, venue_id: string | null = VENUE): UserPermission {
  return { id: `${module_key}:${feature_key}`, user_id: "u1", venue_id, module_key, feature_key, access_level: "view" };
}

describe("canAccessConnect", () => {
  it("is off when only other apps are granted at the venue", () => {
    expect(canAccessConnect([grant("sales", "overview"), grant("hr", "staff")], VENUE)).toBe(false);
  });

  it("is on when the Connecteam toggle grants a page", () => {
    expect(canAccessConnect([grant("team_connect", "chats")], VENUE)).toBe(true);
  });

  it("is off for admins when the Connecteam toggle is off", () => {
    expect(
      canAccessConnect([{ ...grant("app", "global", null), access_level: "admin" }], VENUE),
    ).toBe(false);
  });
});
