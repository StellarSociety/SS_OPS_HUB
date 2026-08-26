import { describe, expect, it } from "vitest";
import { matchDepartmentShareKey } from "../match";
import { DEFAULT_GRATUITY_DEPARTMENT_SHARES } from "../types";

const shares = DEFAULT_GRATUITY_DEPARTMENT_SHARES;

describe("matchDepartmentShareKey", () => {
  it("maps Social Media & Marketing to office", () => {
    expect(matchDepartmentShareKey("Social Media & Marketing", shares)).toBe(
      "office",
    );
  });

  it("maps Entertainment to office", () => {
    expect(matchDepartmentShareKey("Entertainment", shares)).toBe("office");
  });

  it("still maps Finance & Accounts to office", () => {
    expect(matchDepartmentShareKey("Finance & Accounts", shares)).toBe(
      "office",
    );
  });

  it("returns null for an unknown department so the run can warn", () => {
    expect(matchDepartmentShareKey("Facilities", shares)).toBeNull();
  });
});
