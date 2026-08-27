import { describe, expect, it } from "vitest";
import { emptyStaffForm } from "@/lib/hr/staff-form";
import {
  getMissingDetailLabels,
  listMissingDetailsForMember,
  missingDetailInputFromForm,
} from "@/lib/hr/missing-details";

describe("missing details for a staff profile", () => {
  it("counts empty tracked fields on a blank form", () => {
    const hits = listMissingDetailsForMember(
      missingDetailInputFromForm("staff-1", emptyStaffForm("100")),
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((h) => h.label)).toEqual(
      getMissingDetailLabels(
        missingDetailInputFromForm("staff-1", emptyStaffForm("100")),
      ),
    );
  });

  it("skips wage package when the viewer cannot see salary", () => {
    const form = emptyStaffForm("100");
    const all = listMissingDetailsForMember(
      missingDetailInputFromForm("staff-1", form),
    );
    const visible = listMissingDetailsForMember(
      missingDetailInputFromForm("staff-1", form),
      { excludeFields: ["wage_package"] },
    );
    expect(all.some((h) => h.field === "wage_package")).toBe(true);
    expect(visible.some((h) => h.field === "wage_package")).toBe(false);
    expect(visible.length).toBe(all.length - 1);
  });

  it("treats personal or work email as present", () => {
    const form = emptyStaffForm("100");
    form.personal_email = "ada@example.com";
    const hits = listMissingDetailsForMember(
      missingDetailInputFromForm("staff-1", form),
    );
    expect(hits.some((h) => h.field === "email")).toBe(false);
  });
});
