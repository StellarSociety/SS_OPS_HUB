import { describe, expect, it } from "vitest";
import { previousPayrollMonth } from "@/lib/hr/payroll/period";

describe("previousPayrollMonth", () => {
  it("returns the month before a payroll run", () => {
    expect(previousPayrollMonth("2026-09-01")).toBe("2026-08");
  });

  it("rolls January back to December of the previous year", () => {
    expect(previousPayrollMonth("2026-01")).toBe("2025-12");
  });
});
