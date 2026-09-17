import { describe, expect, it } from "vitest";
import {
  assignedStaffIds,
  buildHierarchy,
  canPlaceStaff,
  createNode,
  flattenHierarchy,
  initialHierarchyRoots,
  placeStaff,
  removeAndPromoteChildren,
  removeCollab,
  removeSubtree,
  setCollab,
  setHireDetails,
  setNodeHighlighted,
  setNodeLabel,
  stripHireNodes,
  takeSubtree,
} from "@/lib/directory/hierarchy-tree";

function node(
  staffId: string,
  children: ReturnType<typeof node>[] = [],
) {
  return createNode(staffId, children);
}

describe("hierarchy tree", () => {
  const tree = [
    node("gm", [node("chef", [node("cdp")]), node("fnb")]),
  ];

  it("lists everyone on the chart", () => {
    expect([...assignedStaffIds(tree)].sort()).toEqual([
      "cdp",
      "chef",
      "fnb",
      "gm",
    ]);
  });

  it("places an unassigned person under a manager", () => {
    const next = placeStaff(tree, "commis", { kind: "parent", parentId: "chef" });
    expect(assignedStaffIds(next).has("commis")).toBe(true);
    expect(next[0]?.children[0]?.children.map((child) => child.staffId)).toEqual([
      "cdp",
      "commis",
    ]);
  });

  it("adds a top-of-chart person", () => {
    const next = placeStaff(tree, "owner", { kind: "root" });
    expect(next.map((item) => item.staffId)).toEqual(["gm", "owner"]);
  });

  it("moves a subtree without dropping descendants onto themselves", () => {
    expect(
      canPlaceStaff(tree, "gm", { kind: "parent", parentId: "chef" }),
    ).toBe(false);
    const next = placeStaff(tree, "chef", { kind: "parent", parentId: "fnb" });
    expect(next[0]?.children.map((child) => child.staffId)).toEqual(["fnb"]);
    expect(next[0]?.children[0]?.children[0]?.staffId).toBe("chef");
    expect(next[0]?.children[0]?.children[0]?.children[0]?.staffId).toBe("cdp");
  });

  it("reorders a person after the sibling on their right", () => {
    const next = placeStaff(tree, "chef", {
      kind: "sibling",
      siblingId: "fnb",
      where: "after",
    });
    expect(next[0]?.children.map((child) => child.staffId)).toEqual([
      "fnb",
      "chef",
    ]);
    expect(next[0]?.children[1]?.children[0]?.staffId).toBe("cdp");
  });

  it("keeps reports when swapping two peers on the same line", () => {
    const next = placeStaff(tree, "chef", {
      kind: "sibling",
      siblingId: "fnb",
      where: "before",
    });
    // chef was already before fnb — still before after take + insert
    expect(next[0]?.children.map((child) => child.staffId)).toEqual([
      "chef",
      "fnb",
    ]);
  });

  it("places someone after a sibling under a new manager", () => {
    const next = placeStaff(tree, "fnb", {
      kind: "sibling",
      siblingId: "cdp",
      where: "after",
    });
    expect(next[0]?.children.map((child) => child.staffId)).toEqual(["chef"]);
    expect(next[0]?.children[0]?.children.map((child) => child.staffId)).toEqual(
      ["cdp", "fnb"],
    );
  });

  it("inserts someone above a person and drops that person with their reports", () => {
    const next = placeStaff(tree, "sous", { kind: "above", staffId: "chef" });
    expect(next[0]?.children.map((child) => child.staffId)).toEqual([
      "sous",
      "fnb",
    ]);
    expect(next[0]?.children[0]?.children.map((child) => child.staffId)).toEqual(
      ["chef"],
    );
    expect(next[0]?.children[0]?.children[0]?.children[0]?.staffId).toBe("cdp");
  });

  it("inserts above a top-of-chart person", () => {
    const next = placeStaff(tree, "owner", { kind: "above", staffId: "gm" });
    expect(next.map((item) => item.staffId)).toEqual(["owner"]);
    expect(next[0]?.children.map((child) => child.staffId)).toEqual(["gm"]);
    expect(next[0]?.children[0]?.children.map((child) => child.staffId)).toEqual(
      ["chef", "fnb"],
    );
  });

  it("rejects inserting a person above one of their own reports", () => {
    expect(
      canPlaceStaff(tree, "gm", { kind: "above", staffId: "chef" }),
    ).toBe(false);
    expect(
      canPlaceStaff(tree, "chef", { kind: "above", staffId: "chef" }),
    ).toBe(false);
  });

  it("rejects dropping next to yourself or into your own reports", () => {
    expect(
      canPlaceStaff(tree, "chef", {
        kind: "sibling",
        siblingId: "chef",
        where: "after",
      }),
    ).toBe(false);
    expect(
      canPlaceStaff(tree, "chef", {
        kind: "sibling",
        siblingId: "cdp",
        where: "before",
      }),
    ).toBe(false);
  });

  it("promotes reports when someone is removed from this level", () => {
    const next = removeAndPromoteChildren(tree, "chef");
    expect(assignedStaffIds(next).has("chef")).toBe(false);
    expect(next[0]?.children.map((child) => child.staffId)).toEqual([
      "cdp",
      "fnb",
    ]);
  });

  it("removes a person and their whole branch from the chart", () => {
    const next = removeSubtree(tree, "chef");
    expect(assignedStaffIds(next).has("chef")).toBe(false);
    expect(assignedStaffIds(next).has("cdp")).toBe(false);
    expect(next[0]?.children.map((child) => child.staffId)).toEqual(["fnb"]);
  });

  it("takes a subtree out intact", () => {
    const { roots, taken } = takeSubtree(tree, "chef");
    expect(taken?.staffId).toBe("chef");
    expect(taken?.children[0]?.staffId).toBe("cdp");
    expect(assignedStaffIds(roots).has("chef")).toBe(false);
    expect(assignedStaffIds(roots).has("cdp")).toBe(false);
  });

  it("starts with an empty chart", () => {
    expect(
      initialHierarchyRoots([
        { id: "waiter", positionName: "Waiter" },
        { id: "partner", positionName: "Managing Partner" },
      ]),
    ).toEqual([]);
  });

  it("flattens and rebuilds the same tree", () => {
    const rows = flattenHierarchy(tree);
    expect(rows).toEqual([
      {
        staffId: "gm",
        reportsToStaffId: null,
        sortOrder: 0,
        label: null,
        collabs: [],
        highlighted: false,
        hirePositionId: null,
        hireBudgetedSalary: null,
        hirePositionName: null,
      },
      {
        staffId: "chef",
        reportsToStaffId: "gm",
        sortOrder: 0,
        label: null,
        collabs: [],
        highlighted: false,
        hirePositionId: null,
        hireBudgetedSalary: null,
        hirePositionName: null,
      },
      {
        staffId: "cdp",
        reportsToStaffId: "chef",
        sortOrder: 0,
        label: null,
        collabs: [],
        highlighted: false,
        hirePositionId: null,
        hireBudgetedSalary: null,
        hirePositionName: null,
      },
      {
        staffId: "fnb",
        reportsToStaffId: "gm",
        sortOrder: 1,
        label: null,
        collabs: [],
        highlighted: false,
        hirePositionId: null,
        hireBudgetedSalary: null,
        hirePositionName: null,
      },
    ]);
    expect(buildHierarchy(rows)).toEqual(tree);
  });

  it("highlights a person so they stand out on the chart", () => {
    const next = setNodeHighlighted(tree, "fnb", true);
    expect(findChef(next)?.highlighted).toBe(false);
    expect(
      next[0]?.children.find((child) => child.staffId === "fnb")?.highlighted,
    ).toBe(true);
    const cleared = setNodeHighlighted(next, "fnb", false);
    expect(
      cleared[0]?.children.find((child) => child.staffId === "fnb")?.highlighted,
    ).toBe(false);
  });

  it("stores a label above a person and a dashed side collab", () => {
    const labelled = setNodeLabel(tree, "chef", "Culinary");
    const withCollab = setCollab(labelled, "chef", "pastry", "left");
    expect(findChef(withCollab)?.label).toBe("Culinary");
    expect(findChef(withCollab)?.collabs).toEqual([
      { staffId: "pastry", side: "left" },
    ]);
    expect(assignedStaffIds(withCollab).has("pastry")).toBe(true);

    const moved = placeStaff(withCollab, "pastry", {
      kind: "collab",
      hostId: "chef",
      side: "right",
    });
    expect(findChef(moved)?.collabs).toEqual([
      { staffId: "pastry", side: "right" },
    ]);

    const cleared = removeCollab(moved, "chef", "pastry");
    expect(findChef(cleared)?.collabs).toEqual([]);
    expect(assignedStaffIds(cleared).has("pastry")).toBe(false);
  });

  it("drops collab links to people taken off with a removed branch", () => {
    const withCollab = setCollab(tree, "fnb", "cdp", "right");
    const next = removeSubtree(withCollab, "chef");
    expect(assignedStaffIds(next).has("cdp")).toBe(false);
    expect(
      next[0]?.children.find((child) => child.staffId === "fnb")?.collabs,
    ).toEqual([]);
  });

  it("drops side collabs when that person is removed from the chart", () => {
    const withCollab = setCollab(tree, "gm", "cdp", "right");
    const next = removeAndPromoteChildren(withCollab, "cdp");
    expect(next[0]?.collabs).toEqual([]);
  });

  it("rejects a side collab on yourself", () => {
    expect(
      canPlaceStaff(tree, "chef", {
        kind: "collab",
        hostId: "chef",
        side: "left",
      }),
    ).toBe(false);
  });

  it("promotes reports when a manager is no longer in the directory", () => {
    expect(
      buildHierarchy(flattenHierarchy(tree), new Set(["gm", "cdp", "fnb"])),
    ).toEqual([node("gm", [node("cdp"), node("fnb")])]);
  });

  it("hangs a hire vacancy under a manager without listing it as staff", () => {
    const hireId = "hire:opening-1";
    const next = placeStaff(tree, hireId, { kind: "parent", parentId: "chef" }, {
      hirePositionId: "pos-cdp",
      hireBudgetedSalary: 7000,
      hirePositionName: "Chef de Partie",
    });
    const chef = findChef(next);
    const hire = chef?.children.find((child) => child.staffId === hireId);
    expect(hire?.hirePositionId).toBe("pos-cdp");
    expect(hire?.hireBudgetedSalary).toBe(7000);
    expect(hire?.hirePositionName).toBe("Chef de Partie");
    expect(assignedStaffIds(next).has(hireId)).toBe(false);
    expect(
      canPlaceStaff(next, "commis", { kind: "parent", parentId: hireId }),
    ).toBe(false);
    expect(
      canPlaceStaff(next, hireId, { kind: "above", staffId: "fnb" }),
    ).toBe(false);
  });

  it("updates a hire vacancy position and budget", () => {
    const hireId = "hire:opening-1";
    const placed = placeStaff(tree, hireId, { kind: "parent", parentId: "chef" });
    const next = setHireDetails(placed, hireId, {
      hirePositionId: "pos-cdp",
      hirePositionName: "Chef de Partie",
      hireBudgetedSalary: 8200,
    });
    const hire = findChef(next)?.children.find((child) => child.staffId === hireId);
    expect(hire?.hirePositionId).toBe("pos-cdp");
    expect(hire?.hirePositionName).toBe("Chef de Partie");
    expect(hire?.hireBudgetedSalary).toBe(8200);
    expect(
      flattenHierarchy(next).find((row) => row.staffId === hireId),
    ).toMatchObject({
      hirePositionId: "pos-cdp",
      hirePositionName: "Chef de Partie",
      hireBudgetedSalary: 8200,
    });
  });

  it("drops hire vacancies from the reporting tree", () => {
    const hireId = "hire:opening-1";
    const withHire = placeStaff(tree, hireId, { kind: "parent", parentId: "chef" });
    const reporting = stripHireNodes(withHire);
    expect(flattenHierarchy(reporting).some((row) => row.staffId === hireId)).toBe(
      false,
    );
    expect(findChef(reporting)?.children.map((child) => child.staffId)).toEqual([
      "cdp",
    ]);
  });
});

function findChef(roots: ReturnType<typeof node>[]) {
  return roots[0]?.children.find((child) => child.staffId === "chef");
}
