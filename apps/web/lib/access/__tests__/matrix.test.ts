import { describe, expect, it } from "vitest";
import { isAccessBlockDue, todayIsoInVenueTz } from "@/lib/access/access-block";
import {
  applyMatrixLevel,
  employeeHubLevelFromState,
  matrixLevelFromConfig,
  webAppAccessCount,
} from "@/lib/access/matrix";
import {
  buildEditorState,
  defaultModuleConfig,
  expandAccess,
  type AccessEditorState,
} from "@/lib/access/roles";
import type { UserListRow } from "@/lib/access/types";

function config(overrides: Partial<ReturnType<typeof defaultModuleConfig>> = {}) {
  return { ...defaultModuleConfig("directory"), ...overrides };
}

describe("access matrix levels", () => {
  it("maps hidden, none, viewer, and editor (including app admin)", () => {
    expect(matrixLevelFromConfig(undefined)).toBe("none");
    expect(matrixLevelFromConfig(config({ hidden: true }))).toBe("hidden");
    expect(matrixLevelFromConfig(config({ enabled: false }))).toBe("none");
    expect(
      matrixLevelFromConfig(config({ enabled: true, role: "viewer" })),
    ).toBe("viewer");
    expect(
      matrixLevelFromConfig(config({ enabled: true, role: "editor" })),
    ).toBe("editor");
    expect(
      matrixLevelFromConfig(config({ enabled: true, role: "app_admin" })),
    ).toBe("editor");
  });

  it("keeps app admin when the matrix stays on editor", () => {
    const next = applyMatrixLevel(
      config({ enabled: true, role: "app_admin", subPages: ["staff"] }),
      "editor",
      "venue-1",
    );
    expect(next.role).toBe("app_admin");
    expect(next.enabled).toBe(true);
    expect(next.hidden).toBe(false);
  });

  it("writes a hidden module-access row without permission grants", () => {
    const state: AccessEditorState = {
      accountRole: "none",
      accountVenueId: null,
      modules: [config({ hidden: true, venueId: "venue-1" })],
    };
    const { grants, moduleAccess } = expandAccess(state);
    expect(grants.filter((g) => g.module_key === "directory")).toEqual([]);
    expect(moduleAccess.find((row) => row.module_key === "directory")).toMatchObject({
      enabled: false,
      hidden: true,
      venue_id: "venue-1",
    });
  });

  it("round-trips hidden through buildEditorState", () => {
    const user = {
      id: "user-1",
      email: "a@example.com",
      full_name: "Ada",
      avatar_url: null,
      status: "active",
      staff_id: null,
      is_external: true,
      login_email_source: null,
      invited_at: null,
      invite_accepted_at: "2026-01-01",
      last_login_at: null,
      access_blocked_until: null,
      access_block_from_termination: true,
      created_at: "2026-01-01",
      staff: null,
      permissions: [],
      moduleAccess: [
        {
          id: "row-1",
          venue_id: "venue-1",
          module_key: "directory",
          role: "viewer",
          enabled: false,
          suspended: false,
          hidden: true,
        },
      ],
    } satisfies UserListRow;

    const rebuilt = buildEditorState(user);
    const directory = rebuilt.modules.find((mod) => mod.moduleKey === "directory");
    expect(matrixLevelFromConfig(directory)).toBe("hidden");
  });

  it("inherits employee hub from Mobile App until an explicit hub grant exists", () => {
    expect(
      employeeHubLevelFromState([
        config({ moduleKey: "mobile_app", enabled: true }),
        config({ moduleKey: "mobile_employee_hub", enabled: false, venueId: null }),
      ]),
    ).toBe("viewer");
    expect(
      employeeHubLevelFromState([
        config({ moduleKey: "mobile_app", enabled: true }),
        config({
          moduleKey: "mobile_employee_hub",
          enabled: false,
          venueId: "venue-1",
        }),
      ]),
    ).toBe("none");
  });

  it("counts web apps and ignores mobile hub modules", () => {
    expect(
      webAppAccessCount([
        config({ moduleKey: "hr", enabled: true }),
        config({ moduleKey: "mobile_app", enabled: true }),
        config({
          moduleKey: "mobile_employee_hub",
          enabled: true,
        }),
      ]),
    ).toBe(1);
  });
});

describe("dated access block", () => {
  it("is due on or after the stored date in the venue timezone", () => {
    const today = todayIsoInVenueTz();
    expect(isAccessBlockDue(today)).toBe(true);
    expect(isAccessBlockDue("1999-01-01")).toBe(true);
    expect(isAccessBlockDue("2099-01-01")).toBe(false);
    expect(isAccessBlockDue(null)).toBe(false);
  });
});
