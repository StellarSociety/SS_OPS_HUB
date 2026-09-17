import { describe, expect, it } from "vitest";
import { createNode, setCollab, setNodeLabel } from "@/lib/directory/hierarchy-tree";
import {
  collectSubtreeStaffIds,
  subtreeSalaryTotal,
} from "@/lib/directory/hierarchy-pay";

describe("hierarchy pay totals", () => {
  const culinary = setNodeLabel(
    [
      createNode("chef", [
        createNode("cdp"),
        createNode("commis"),
      ]),
    ],
    "chef",
    "Culinary",
  )[0]!;

  const pay = {
    chef: { salaryToPay: 10000, inAccommodation: false },
    cdp: { salaryToPay: 6000, inAccommodation: true },
    commis: { salaryToPay: 4000, inAccommodation: true },
    pastry: { salaryToPay: 5500, inAccommodation: false },
  };

  it("sums the labeled person and every report under them", () => {
    expect(collectSubtreeStaffIds(culinary).sort()).toEqual([
      "cdp",
      "chef",
      "commis",
    ]);
    expect(subtreeSalaryTotal(culinary, pay)).toBe(20000);
  });

  it("counts a side collab once in that branch total", () => {
    const withCollab = setCollab([culinary], "chef", "pastry", "right")[0]!;
    expect(collectSubtreeStaffIds(withCollab).sort()).toEqual([
      "cdp",
      "chef",
      "commis",
      "pastry",
    ]);
    expect(subtreeSalaryTotal(withCollab, pay)).toBe(25500);
  });

  it("skips missing pay and still totals the rest", () => {
    expect(
      subtreeSalaryTotal(culinary, {
        chef: { salaryToPay: 10000, inAccommodation: false },
        cdp: { salaryToPay: null, inAccommodation: false },
        commis: { salaryToPay: 4000, inAccommodation: true },
      }),
    ).toBe(14000);
  });

  it("returns null when nobody in the branch has payable pay", () => {
    expect(subtreeSalaryTotal(culinary, {})).toBeNull();
  });

  it("adds a hire vacancy budget into the branch total", () => {
    const withHire = createNode("chef", [
      createNode("cdp"),
      createNode("hire:cdp-2", [], {
        hirePositionId: "pos",
        hireBudgetedSalary: 6500,
      }),
    ]);
    expect(subtreeSalaryTotal(withHire, pay)).toBe(22500);
  });
});
