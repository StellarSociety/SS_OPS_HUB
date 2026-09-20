import { describe, expect, it } from "vitest";
import {
  isDirectoryPeopleMember,
  isVisibleDirectoryStaff,
  mapDirectoryStaffRow,
} from "@/lib/directory/store";

describe("isVisibleDirectoryStaff", () => {
  it("shows ON Board and OFF Boarding until they are OUT", () => {
    expect(isVisibleDirectoryStaff({ employmentStatusName: "ON Board" })).toBe(
      true,
    );
    expect(
      isVisibleDirectoryStaff({ employmentStatusName: "OFF Boarding" }),
    ).toBe(true);
    expect(isVisibleDirectoryStaff({ employmentStatusName: "OFF Board" })).toBe(
      true,
    );
  });

  it("hides Hiring and OUT", () => {
    expect(isVisibleDirectoryStaff({ employmentStatusName: "Hiring" })).toBe(
      false,
    );
    expect(isVisibleDirectoryStaff({ employmentStatusName: "OUT" })).toBe(
      false,
    );
  });
});

describe("mapDirectoryStaffRow", () => {
  it("maps employment and working status lookup names", () => {
    expect(
      mapDirectoryStaffRow({
        id: "s1",
        emp_no: "ORL0001",
        full_name: "Shuhrat Djalilov",
        employment_status: { name: "ON Board" },
        working_status: { name: "Full Time" },
      }),
    ).toMatchObject({
      employmentStatusName: "ON Board",
      workingStatusName: "Full Time",
      orgChartOnly: false,
    });
  });
});

describe("isDirectoryPeopleMember", () => {
  it("hides chart-only partners from Staff and Celebrations", () => {
    expect(isDirectoryPeopleMember({ orgChartOnly: false })).toBe(true);
    expect(isDirectoryPeopleMember({ orgChartOnly: true })).toBe(false);
  });
});
