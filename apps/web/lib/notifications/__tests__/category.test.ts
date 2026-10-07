import { describe, expect, it } from "vitest";
import { notificationCategory } from "@/lib/notifications/category";

function n(module_key: string, type: string, entity: string) {
  return { module_key, type, entity };
}

describe("notificationCategory", () => {
  it("sends hiring applications to Candidates", () => {
    expect(
      notificationCategory(
        n("hr", "hiring_application_submitted", "hiring_form"),
      ),
    ).toBe("candidates");
  });

  it("sends payroll, schedule, attendance and review workflows to Approvals", () => {
    for (const row of [
      n("hr", "schedule_approval_requested", "schedule_week"),
      n("hr", "schedule_approval_approved_with_changes", "schedule_week"),
      n("hr", "schedule_approval_rejected", "schedule_week"),
      n("hr", "payroll_hr_review_requested", "payroll_run"),
      n("hr", "payroll_final_approval_approved", "payroll_run"),
      n("hr", "attendance_not_approved", "attendance"),
      n("sentiment", "review_justification_requested", "sentiment_review"),
      n("sentiment", "review_justification_submitted", "sentiment_review"),
      n("gp_cos", "cos_run_approval_requested", "cos_run"),
    ]) {
      expect(notificationCategory(row)).toBe("approvals");
    }
  });

  it("sends staff record notices to People", () => {
    expect(notificationCategory(n("hr", "passport_expiry", "staff"))).toBe(
      "people",
    );
    expect(notificationCategory(n("hr", "work_anniversary", "staff"))).toBe(
      "people",
    );
    expect(notificationCategory(n("hr", "test_alert_popup", "staff"))).toBe(
      "people",
    );
    expect(notificationCategory(n("hr", "visa_expiry", "visa_record"))).toBe(
      "people",
    );
  });

  it("falls back to Others", () => {
    expect(
      notificationCategory(
        n("mobile_app", "mobile_app_reinstall", "mobile_app"),
      ),
    ).toBe("others");
    expect(notificationCategory(n("sales", "something_new", "sale"))).toBe(
      "others",
    );
  });
});
