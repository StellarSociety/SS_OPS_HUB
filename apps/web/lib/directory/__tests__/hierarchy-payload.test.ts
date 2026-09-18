import { describe, expect, it } from "vitest";
import { createNode, placeStaff } from "@/lib/directory/hierarchy-tree";
import { hierarchyPayload } from "@/lib/directory/store";

describe("hierarchy payload", () => {
  it("keeps a hire vacancy as the manager and the nearest staff behind it", () => {
    const hireId = "hire:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const tree = [
      createNode("gm", [createNode("chef", [createNode("cdp")])]),
    ];
    const withHire = placeStaff(tree, hireId, {
      kind: "parent",
      parentId: "chef",
    });
    const next = placeStaff(withHire, "commis", {
      kind: "parent",
      parentId: hireId,
    });
    expect(
      hierarchyPayload(next).find((row) => row.staff_id === "commis"),
    ).toMatchObject({
      reports_to_staff_id: "chef",
      reports_to_hire_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    });
  });
});
