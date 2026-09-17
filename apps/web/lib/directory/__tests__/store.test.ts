import { describe, expect, it } from "vitest";
import { isVisibleDirectoryStaff } from "@/lib/directory/store";

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
