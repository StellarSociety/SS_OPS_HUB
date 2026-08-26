import { describe, expect, it } from "vitest";
import { calculateVenuePayroll } from "@/lib/hr/payroll/calculate";
import {
  dubaiCalendarDateIso,
  dubaiCalendarMonthKey,
  isPayrollLeaver,
  isTerminatedBeforePayrollMonth,
  payrollEmployeeWindowEnd,
} from "@/lib/hr/payroll/period";
import { DEFAULT_HR_PAYROLL_SETTINGS } from "@/lib/hr/payroll/types";
import { DEFAULT_HR_LEAVE_POLICY_SETTINGS } from "@/lib/hr/types";
import type { PayrollStaffInput } from "@/lib/hr/payroll/calculate";

const july = {
  payrollMonth: "2026-07-01",
  periodStart: "2026-06-25",
  periodEnd: "2026-07-24",
  paymentDate: "2026-07-28",
};

const august = {
  payrollMonth: "2026-08-01",
  periodStart: "2026-07-25",
  periodEnd: "2026-08-24",
  paymentDate: "2026-08-28",
};

const september = {
  payrollMonth: "2026-09-01",
  periodStart: "2026-08-25",
  periodEnd: "2026-09-24",
  paymentDate: "2026-09-28",
};

const staffBase: PayrollStaffInput = {
  id: "staff-carol",
  emp_no: "ORL0028",
  full_name: "Carol Castellanos",
  department_id: null,
  department_name: null,
  position_id: null,
  position_name: null,
  joining_date: "2025-10-13",
  termination_date: "2026-07-31",
  employment_status: "OUT",
  working_status: null,
  wps_employee_id: null,
  iban: "AE00",
  bank_name: null,
  swift_code: null,
  wage_package: 6500,
  company_accommodation: null,
  basic_salary_60: 3900,
  accom_all_25: 1625,
  transp_all_15: 975,
  fly_home_ticket_per_year: null,
};

function calc(
  period: typeof july,
  termination: string | null,
  scheduleDays: Array<{
    staff_id: string;
    emp_no: string;
    work_date: string;
    label_code: string;
    shift_template_id: string | null;
  }> = [],
) {
  return calculateVenuePayroll({
    period,
    settings: DEFAULT_HR_PAYROLL_SETTINGS,
    leavePolicy: DEFAULT_HR_LEAVE_POLICY_SETTINGS,
    salaryPct: { basic: 60, accom: 25, transp: 15 },
    staff: [{ ...staffBase, termination_date: termination }],
    scheduleDays,
    attendanceDays: [],
  });
}

describe("month-end leaver cutoff", () => {
  it("treats 31 Jul as a July leaver, not an August leaver", () => {
    expect(isPayrollLeaver("2026-07-31", july)).toBe(true);
    expect(isPayrollLeaver("2026-07-31", august)).toBe(false);
    expect(isTerminatedBeforePayrollMonth("2026-07-31", july)).toBe(false);
    expect(isTerminatedBeforePayrollMonth("2026-07-31", august)).toBe(true);
    expect(payrollEmployeeWindowEnd("2026-07-31", july)).toBe("2026-07-31");
    expect(payrollEmployeeWindowEnd(null, august)).toBe("2026-08-24");
    expect(payrollEmployeeWindowEnd("2026-09-05", august)).toBe("2026-08-24");
  });

  it("keeps in-period July terminations as July leavers", () => {
    expect(isPayrollLeaver("2026-07-10", july)).toBe(true);
    expect(isPayrollLeaver("2026-07-10", august)).toBe(false);
    expect(isTerminatedBeforePayrollMonth("2026-07-10", august)).toBe(true);
  });

  it("assigns 5 Aug to August, and still pays July as a regular employee", () => {
    expect(isPayrollLeaver("2026-08-05", july)).toBe(false);
    expect(isPayrollLeaver("2026-08-05", august)).toBe(true);
    expect(isTerminatedBeforePayrollMonth("2026-08-05", july)).toBe(false);
  });

  it("does not put a 31 Jul leaver on the August payroll run", () => {
    const julyRun = calc(july, "2026-07-31");
    const augustRun = calc(august, "2026-07-31");
    expect(julyRun.employees).toHaveLength(1);
    expect(julyRun.employees[0]?.isLeaver).toBe(true);
    expect(augustRun.employees).toHaveLength(0);
  });

  it("still includes next-month leavers on the current 25→24 run", () => {
    const julyRun = calc(july, "2026-08-05");
    expect(julyRun.employees).toHaveLength(1);
    expect(julyRun.employees[0]?.isLeaver).toBe(false);
  });

  it("pays a 27 Aug leaver through termination on the August run, not September", () => {
    expect(payrollEmployeeWindowEnd("2026-08-27", august)).toBe("2026-08-27");
    expect(isPayrollLeaver("2026-08-27", august)).toBe(true);
    expect(isTerminatedBeforePayrollMonth("2026-08-27", september)).toBe(true);

    const extraDays = ["2026-08-25", "2026-08-26", "2026-08-27"].map(
      (work_date) => ({
        staff_id: staffBase.id,
        emp_no: staffBase.emp_no,
        work_date,
        label_code: "SHIFT",
        shift_template_id: null,
      }),
    );
    const augustRun = calc(august, "2026-08-27", extraDays);
    const septemberRun = calc(september, "2026-08-27", extraDays);
    const dates = (augustRun.employees[0]?.dayFractions ?? []).map(
      (d) => d.workDate,
    );

    expect(augustRun.employees).toHaveLength(1);
    expect(augustRun.employees[0]?.isLeaver).toBe(true);
    expect(dates).toContain("2026-08-24");
    expect(dates).toContain("2026-08-25");
    expect(dates).toContain("2026-08-26");
    expect(dates).toContain("2026-08-27");
    expect(dates).not.toContain("2026-08-28");
    expect(septemberRun.employees).toHaveLength(0);
  });
});

describe("dubai calendar month for benefit paybacks", () => {
  it("keeps an evening GST timestamp in August, not July UTC", () => {
    // 25 Aug 2026 19:42 UTC = 25 Aug 23:42 GST
    const recorded = "2026-08-25T19:42:10.448Z";
    expect(dubaiCalendarDateIso(recorded)).toBe("2026-08-25");
    expect(dubaiCalendarMonthKey(recorded)).toBe("2026-08");
  });

  it("does not shift a 1 Aug GST morning recording into July", () => {
    // 31 Jul 2026 21:30 UTC = 1 Aug 01:30 GST
    const recorded = "2026-07-31T21:30:00.000Z";
    expect(dubaiCalendarDateIso(recorded)).toBe("2026-08-01");
    expect(dubaiCalendarMonthKey(recorded)).toBe("2026-08");
  });
});
