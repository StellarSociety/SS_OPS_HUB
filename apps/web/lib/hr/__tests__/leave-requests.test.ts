import { describe, expect, it } from "vitest";
import {
  employeeCanDeleteLeaveRequest,
  employeeCanEditLeaveRequest,
  EMPLOYEE_LEAVE_REQUEST_SOURCE,
  leaveRequestDetailsAreLocked,
  leaveRequestSourceLabel,
  normalizeLeaveCalendarStatus,
} from "@/lib/hr/leave";

describe("employee leave request lock", () => {
  it("locks details after approval", () => {
    expect(leaveRequestDetailsAreLocked("approved")).toBe(true);
    expect(leaveRequestDetailsAreLocked("submitted")).toBe(false);
    expect(leaveRequestDetailsAreLocked("pending_hr")).toBe(false);
  });

  it("lets employees edit requests that are not approved or rejected", () => {
    expect(
      employeeCanEditLeaveRequest({
        status: "submitted",
        source: EMPLOYEE_LEAVE_REQUEST_SOURCE,
      }),
    ).toBe(true);
    expect(
      employeeCanEditLeaveRequest({
        status: "submitted",
        source: "schedule",
      }),
    ).toBe(true);
    expect(
      employeeCanEditLeaveRequest({
        status: "approved",
        source: EMPLOYEE_LEAVE_REQUEST_SOURCE,
      }),
    ).toBe(false);
    expect(
      employeeCanEditLeaveRequest({
        status: "rejected",
        source: EMPLOYEE_LEAVE_REQUEST_SOURCE,
      }),
    ).toBe(false);
  });

  it("maps submitted requests to pending approval", () => {
    expect(normalizeLeaveCalendarStatus("submitted")).toBe("pending");
    expect(leaveRequestSourceLabel(EMPLOYEE_LEAVE_REQUEST_SOURCE)).toBe(
      "Employee app",
    );
  });

  it("lets employees delete requests that are not approved or rejected", () => {
    expect(employeeCanDeleteLeaveRequest("submitted")).toBe(true);
    expect(employeeCanDeleteLeaveRequest("pending_hr")).toBe(true);
    expect(employeeCanDeleteLeaveRequest("draft")).toBe(true);
    expect(employeeCanDeleteLeaveRequest("approved")).toBe(false);
    expect(employeeCanDeleteLeaveRequest("rejected")).toBe(false);
    expect(employeeCanDeleteLeaveRequest("cancelled")).toBe(false);
  });
});
