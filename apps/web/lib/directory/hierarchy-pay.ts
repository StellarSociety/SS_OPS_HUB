import type { HierarchyNode } from "./hierarchy-tree";
import { isHireId } from "./hierarchy-tree";
import type { DirectoryStaffPay } from "./types";

export type DirectoryStaffPayById = Record<string, DirectoryStaffPay>;

/** Person + reports + side collabs in this branch, once each. */
export function collectSubtreeStaffIds(node: HierarchyNode): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  function visit(current: HierarchyNode) {
    if (!isHireId(current.staffId) && !seen.has(current.staffId)) {
      seen.add(current.staffId);
      ids.push(current.staffId);
    }
    for (const collab of current.collabs ?? []) {
      if (!collab.staffId || isHireId(collab.staffId) || seen.has(collab.staffId)) {
        continue;
      }
      seen.add(collab.staffId);
      ids.push(collab.staffId);
    }
    for (const child of current.children) visit(child);
  }

  visit(node);
  return ids;
}

export function subtreeSalaryTotal(
  node: HierarchyNode,
  payByStaffId: DirectoryStaffPayById,
): number | null {
  let total = 0;
  let any = false;

  function add(amount: number | null | undefined) {
    if (amount == null || Number.isNaN(amount)) return;
    total += amount;
    any = true;
  }

  function visit(current: HierarchyNode) {
    if (isHireId(current.staffId)) {
      add(current.hireBudgetedSalary);
    } else {
      add(payByStaffId[current.staffId]?.salaryToPay);
      for (const collab of current.collabs ?? []) {
        add(payByStaffId[collab.staffId]?.salaryToPay);
      }
    }
    for (const child of current.children) visit(child);
  }

  visit(node);
  if (!any) return null;
  return Math.round(total * 100) / 100;
}

export function medianAmount(values: number[]): number | null {
  const nums = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2 === 1) return nums[mid] ?? null;
  return Math.round((((nums[mid - 1] ?? 0) + (nums[mid] ?? 0)) / 2) * 100) / 100;
}
