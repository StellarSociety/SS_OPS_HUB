import { describe, expect, it } from "vitest";
import { canAccessMobileApp } from "@/lib/mobile/permissions";
import { canAccessModule } from "@/lib/module-access";
import {
  canAccessGlobal,
  canManageHubSettings,
  isAppAdmin,
  isGlobalAdmin,
  isVenueAdmin,
  type UserPermission,
} from "@/lib/role-permissions";

function grant(
  partial: Pick<UserPermission, "module_key" | "feature_key" | "access_level"> &
    Partial<UserPermission>,
): UserPermission {
  return {
    id: `${partial.module_key}:${partial.feature_key}`,
    user_id: "user-1",
    venue_id: partial.venue_id ?? null,
    ...partial,
  };
}

const venueAdmin: UserPermission[] = [
  grant({
    module_key: "app",
    feature_key: "settings",
    access_level: "admin",
  }),
  grant({
    module_key: "hr",
    feature_key: "staff",
    access_level: "admin",
    venue_id: "orilla",
  }),
];

const globalAdmin: UserPermission[] = [
  grant({
    module_key: "app",
    feature_key: "global",
    access_level: "admin",
  }),
];

const standardUser: UserPermission[] = [
  grant({
    module_key: "sales",
    feature_key: "venue_daily",
    access_level: "edit",
    venue_id: "orilla",
  }),
];

describe("account roles vs app grants", () => {
  it("does not treat Venue Admin as a hub superuser", () => {
    expect(isVenueAdmin(venueAdmin)).toBe(true);
    expect(isGlobalAdmin(venueAdmin)).toBe(false);
    expect(isAppAdmin(venueAdmin)).toBe(false);
    expect(canManageHubSettings(venueAdmin)).toBe(true);
    expect(canAccessGlobal(venueAdmin)).toBe(false);
  });

  it("blocks Mobile App when the module is not granted, even for Venue Admin", () => {
    expect(canAccessMobileApp(venueAdmin, "orilla")).toBe(false);
    expect(canAccessModule(venueAdmin, "mobile_app", "orilla")).toBe(false);
  });

  it("still lets Venue Admin open apps they were actually granted", () => {
    expect(canAccessModule(venueAdmin, "hr", "orilla")).toBe(true);
    expect(canAccessModule(venueAdmin, "sales", "orilla")).toBe(false);
  });

  it("lets Global Admin bypass per-app toggles", () => {
    expect(isAppAdmin(globalAdmin)).toBe(true);
    expect(canAccessMobileApp(globalAdmin, "orilla")).toBe(true);
    expect(canAccessGlobal(globalAdmin)).toBe(true);
  });

  it("does not let a standard user into Settings or Mobile App", () => {
    expect(canManageHubSettings(standardUser)).toBe(false);
    expect(canAccessMobileApp(standardUser, "orilla")).toBe(false);
    expect(canAccessModule(standardUser, "sales", "orilla")).toBe(true);
  });
});
