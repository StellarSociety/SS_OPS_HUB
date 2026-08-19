import { describe, expect, it } from "vitest";
import {
  buildAnnualLeaveCalculation,
  calendarServiceDays,
  computeStatutoryAnnualLeaveFromQualifyingMonths,
  computeStatutoryAnnualLeaveEntitlement,
  countApprovedUnpaidLeaveDays,
  qualifyingServiceDays,
  roundLeaveDays,
} from "@/lib/hr/leave";
import { DEFAULT_HR_LEAVE_POLICY_SETTINGS } from "@/lib/hr/types";

const annual = DEFAULT_HR_LEAVE_POLICY_SETTINGS.annual;

describe("UAE annual leave — qualifying service", () => {
  it("uses elapsed days (termination − joining), not inclusive calendar dates", () => {
    const days = calendarServiceDays(
      "2025-09-22",
      new Date(2026, 7, 26),
    );
    expect(days).toBe(338);
  });

  it("excludes unpaid leave from qualifying service, not from the leave balance", () => {
    const qualifying = qualifyingServiceDays(
      "2025-09-22",
      new Date(2026, 7, 26),
      57,
    );
    expect(qualifying).toBe(281);
    expect(qualifying).not.toBe(338);
  });

  it("also excludes absence days from qualifying service", () => {
    const qualifying = qualifyingServiceDays(
      "2025-09-22",
      new Date(2026, 7, 26),
      57,
      5,
    );
    expect(qualifying).toBe(276);
  });

  it("does not let qualifying service go negative", () => {
    expect(
      qualifyingServiceDays("2025-09-22", new Date(2025, 9, 22), 400),
    ).toBe(0);
  });
});

describe("UAE annual leave — example case", () => {
  it("does not return 22 days (calendar months × 2 without excluding UPL)", () => {
    const result = computeStatutoryAnnualLeaveEntitlement(
      "2025-09-22",
      new Date(2026, 7, 26),
      annual,
      57,
    );
    expect(roundLeaveDays(result.entitlement)).toBe(18.73);
    expect(roundLeaveDays(result.entitlement)).not.toBe(22);
    expect(result.band).toBe("mid");
  });

  it("keeps full precision until the final display round", () => {
    const months = 281 / 30;
    expect(months).toBeCloseTo(9.366666, 5);
    const raw = computeStatutoryAnnualLeaveFromQualifyingMonths(months, annual);
    expect(raw.entitlement).toBeCloseTo(18.733333, 5);
    expect(roundLeaveDays(raw.entitlement)).toBe(18.73);
  });

  it("does not floor service months before multiplying by the rate", () => {
    const floored = Math.floor(281 / 30) * 2;
    const raw = computeStatutoryAnnualLeaveFromQualifyingMonths(281 / 30, annual);
    expect(floored).toBe(18);
    expect(raw.entitlement).toBeGreaterThan(18);
    expect(raw.entitlement).toBeCloseTo(18.733333, 5);
  });
});

describe("UAE annual leave — statutory bands", () => {
  it("returns 0 at or below 6 months of qualifying service", () => {
    expect(
      computeStatutoryAnnualLeaveFromQualifyingMonths(6, annual).entitlement,
    ).toBe(0);
    expect(
      computeStatutoryAnnualLeaveFromQualifyingMonths(5.9, annual).entitlement,
    ).toBe(0);
  });

  it("uses 2 days per month between 6 and 12 months", () => {
    const raw = computeStatutoryAnnualLeaveFromQualifyingMonths(9, annual);
    expect(raw.band).toBe("mid");
    expect(raw.entitlement).toBe(18);
  });

  it("uses 30 days per completed year plus pro-rata of the incomplete year", () => {
    const atYear = computeStatutoryAnnualLeaveFromQualifyingMonths(12, annual);
    expect(atYear.band).toBe("full");
    expect(atYear.entitlement).toBe(30);
    expect(atYear.completedYears).toBe(1);
    expect(atYear.remainingMonths).toBe(0);

    const eighteen = computeStatutoryAnnualLeaveFromQualifyingMonths(18, annual);
    expect(eighteen.completedYears).toBe(1);
    expect(eighteen.remainingMonths).toBe(6);
    expect(eighteen.entitlement).toBe(30 + 6 * 2.5);
  });

  it("does not multiply every month by 2.5 as a single undifferentiated rate in the breakdown", () => {
    const result = computeStatutoryAnnualLeaveFromQualifyingMonths(30, annual);
    expect(result.completedYears).toBe(2);
    expect(result.remainingMonths).toBe(6);
    expect(result.entitlement).toBe(2 * 30 + 6 * 2.5);
  });
});

describe("UAE annual leave — audit breakdown", () => {
  it("builds the termination settlement from qualifying service", () => {
    const audit = buildAnnualLeaveCalculation({
      joiningDate: "2025-09-22",
      leaveYear: 2026,
      terminationDate: "2026-08-26",
      approvedUnpaidLeaveDays: 57,
      annualLeaveTaken: 4,
      previousCarryForward: 0,
    });
    expect(audit.calendarServiceDays).toBe(338);
    expect(audit.unpaidLeaveDays).toBe(57);
    expect(audit.absenceDays).toBe(0);
    expect(audit.qualifyingServiceDays).toBe(281);
    expect(audit.qualifyingServiceMonths).toBeCloseTo(9.366666, 5);
    expect(audit.band).toBe("mid");
    expect(roundLeaveDays(audit.grossAnnualLeaveEntitlement)).toBe(18.73);
    expect(audit.roundedGrossAnnualLeaveEntitlement).toBe(19);
    expect(audit.annualLeaveAlreadyTaken).toBe(4);
    expect(roundLeaveDays(audit.finalAnnualLeaveBalance)).toBe(14.73);
    expect(audit.roundedFinalAnnualLeaveBalance).toBe(15);
  });

  it("subtracts absence days from qualifying service in the audit breakdown", () => {
    const audit = buildAnnualLeaveCalculation({
      joiningDate: "2025-09-22",
      leaveYear: 2026,
      terminationDate: "2026-08-26",
      approvedUnpaidLeaveDays: 57,
      absenceDays: 5,
      annualLeaveTaken: 0,
      previousCarryForward: 0,
    });
    expect(audit.absenceDays).toBe(5);
    expect(audit.qualifyingServiceDays).toBe(276);
    expect(audit.qualifyingServiceMonths).toBeCloseTo(276 / 30, 5);
    expect(roundLeaveDays(audit.grossAnnualLeaveEntitlement)).toBe(
      roundLeaveDays((276 / 30) * 2),
    );
  });
});

describe("countApprovedUnpaidLeaveDays", () => {
  it("counts roster UPL in the employment window without attendance approval", () => {
    const n = countApprovedUnpaidLeaveDays({
      joiningDate: "2025-09-22",
      asOfDate: "2026-08-26",
      unpaidLeaveDates: [
        "2026-01-01",
        "2026-01-02",
        "2024-12-31",
        "2026-08-27",
        "2026-01-01",
      ],
    });
    expect(n).toBe(2);
  });
});
