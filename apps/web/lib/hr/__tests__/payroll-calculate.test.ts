import { describe, expect, it } from "vitest";
import { calculateVenuePayroll } from "@/lib/hr/payroll/calculate";
import { DEFAULT_HR_PAYROLL_SETTINGS } from "@/lib/hr/payroll/types";
import { DEFAULT_HR_LEAVE_POLICY_SETTINGS } from "@/lib/hr/types";

const staff = {
  id: "staff-1",
  emp_no: "ORL0058",
  full_name: "Shuhrat Djalilov",
  department_id: null,
  department_name: null,
  position_id: null,
  position_name: null,
  joining_date: "2026-07-15",
  termination_date: null,
  employment_status: "ON Board",
  working_status: null,
  wps_employee_id: null,
  iban: "AE00",
  bank_name: null,
  swift_code: null,
  wage_package: 14000,
  company_accommodation: null,
  basic_salary_60: 8400,
  accom_all_25: 3500,
  transp_all_15: 2100,
  fly_home_ticket_per_year: null,
};

const period = {
  payrollMonth: "2026-08-01",
  periodStart: "2026-07-31",
  periodEnd: "2026-07-31",
  paymentDate: "2026-08-28",
};

const scheduleDays = [
  {
    staff_id: staff.id,
    emp_no: staff.emp_no,
    work_date: "2026-07-31",
    label_code: "SHIFT",
    shift_template_id: "tmpl-12-22",
  },
];

const lateAttendance = {
  staff_id: staff.id,
  emp_no: staff.emp_no,
  work_date: "2026-07-31",
  id: "att-1",
  clock_in: "2026-07-31T07:52:42+00:00",
  clock_out: "2026-07-31T21:07:05+00:00",
};

function calc(approvalStatus: string) {
  return calculateVenuePayroll({
    period,
    settings: DEFAULT_HR_PAYROLL_SETTINGS,
    leavePolicy: DEFAULT_HR_LEAVE_POLICY_SETTINGS,
    salaryPct: { basic: 60, accom: 25, transp: 15 },
    staff: [staff],
    scheduleDays,
    attendanceDays: [{ ...lateAttendance, approval_status: approvalStatus }],
    shiftTemplates: {
      "tmpl-12-22": { startTime: "12:00", endTime: "22:00" },
    },
    timezone: "Asia/Dubai",
    varianceMinutes: 40,
  });
}

describe("calculateVenuePayroll attendance clearance", () => {
  it("pays a late SHIFT day after Validation approval", () => {
    const { employees, exceptions } = calc("approved");
    const day = employees[0]?.dayFractions[0];
    expect(day?.approved).toBe(true);
    expect(day?.paidStatus).toBe("worked");
    expect(employees[0]?.paidDays).toBe(1);
    expect(
      exceptions.some((ex) => ex.exceptionType === "attendance_not_approved"),
    ).toBe(false);
  });

  it("does not pay a late SHIFT day that is still pending approval", () => {
    const { employees, exceptions } = calc("pending");
    const day = employees[0]?.dayFractions[0];
    expect(day?.approved).toBe(false);
    expect(day?.payFraction).toBe(0);
    expect(employees[0]?.paidDays).toBe(0);
    expect(
      exceptions.some(
        (ex) =>
          ex.exceptionType === "attendance_not_approved" &&
          ex.workDate === "2026-07-31",
      ),
    ).toBe(true);
  });
});

describe("visa payback is a benefit, not a deduction", () => {
  it("adds PAYBACK as variable earnings instead of reducing net", () => {
    const baseline = calc("approved").employees[0];
    const withPayback = calculateVenuePayroll({
      period,
      settings: DEFAULT_HR_PAYROLL_SETTINGS,
      leavePolicy: DEFAULT_HR_LEAVE_POLICY_SETTINGS,
      salaryPct: { basic: 60, accom: 25, transp: 15 },
      staff: [staff],
      scheduleDays,
      attendanceDays: [{ ...lateAttendance, approval_status: "approved" }],
      shiftTemplates: {
        "tmpl-12-22": { startTime: "12:00", endTime: "22:00" },
      },
      timezone: "Asia/Dubai",
      varianceMinutes: 40,
      adjustments: [
        {
          staffId: staff.id,
          category: "variable",
          code: "PAYBACK",
          label: "Payback",
          amount: 500,
          source: "benefits",
        },
      ],
    }).employees[0];

    expect(withPayback?.variableEarnings).toBe(
      (baseline?.variableEarnings ?? 0) + 500,
    );
    expect(withPayback?.netSalary).toBe((baseline?.netSalary ?? 0) + 500);
    expect(withPayback?.totalDeductions).toBe(baseline?.totalDeductions);
    expect(
      withPayback?.lines.some(
        (line) =>
          line.code === "PAYBACK" &&
          line.category === "variable" &&
          line.source === "benefits",
      ),
    ).toBe(true);
  });
});

function payrollWithBenefits(
  benefits: Array<{
    staff_id: string;
    benefit_type: string;
    amount: number;
  }>,
) {
  return calculateVenuePayroll({
    period,
    settings: DEFAULT_HR_PAYROLL_SETTINGS,
    leavePolicy: DEFAULT_HR_LEAVE_POLICY_SETTINGS,
    salaryPct: { basic: 60, accom: 25, transp: 15 },
    staff: [staff],
    scheduleDays,
    attendanceDays: [{ ...lateAttendance, approval_status: "approved" }],
    shiftTemplates: {
      "tmpl-12-22": { startTime: "12:00", endTime: "22:00" },
    },
    timezone: "Asia/Dubai",
    varianceMinutes: 40,
    benefits,
  }).employees[0];
}

describe("gratuity payroll lines use the rounded AED 5 payout", () => {
  it("floors tips and service charge to a multiple of 5", () => {
    const row = payrollWithBenefits([
      { staff_id: staff.id, benefit_type: "tips", amount: 256.48 },
      { staff_id: staff.id, benefit_type: "service_charge", amount: 259.99 },
      { staff_id: staff.id, benefit_type: "flight_ticket", amount: 256.48 },
    ]);

    expect(row?.lines.find((line) => line.code === "TIPS")?.amount).toBe(255);
    expect(
      row?.lines.find((line) => line.code === "SERVICE_CHARGE")?.amount,
    ).toBe(255);
    expect(
      row?.lines.find((line) => line.code === "FLIGHT_TICKET")?.amount,
    ).toBe(256.48);
  });

  it("omits tips that floor to zero", () => {
    const row = payrollWithBenefits([
      { staff_id: staff.id, benefit_type: "tips", amount: 4.99 },
    ]);
    expect(row?.lines.some((line) => line.code === "TIPS")).toBe(false);
  });
});
