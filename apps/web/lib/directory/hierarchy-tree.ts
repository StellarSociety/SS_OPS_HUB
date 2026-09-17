export type HierarchyCollabSide = "left" | "right";

export type HierarchyCollab = {
  staffId: string;
  side: HierarchyCollabSide;
};

export type HierarchyNode = {
  staffId: string;
  children: HierarchyNode[];
  label: string | null;
  collabs: HierarchyCollab[];
  highlighted: boolean;
  hirePositionId: string | null;
  hireBudgetedSalary: number | null;
  hirePositionName: string | null;
};

export type HierarchyDropTarget =
  | { kind: "root" }
  | { kind: "parent"; parentId: string }
  | { kind: "above"; staffId: string }
  | { kind: "sibling"; siblingId: string; where: "before" | "after" }
  | { kind: "collab"; hostId: string; side: HierarchyCollabSide };

export type HierarchyPersistRow = {
  staffId: string;
  reportsToStaffId: string | null;
  sortOrder: number;
  label: string | null;
  collabs: HierarchyCollab[];
  highlighted: boolean;
  hirePositionId: string | null;
  hireBudgetedSalary: number | null;
  hirePositionName: string | null;
};

export const HIERARCHY_LABEL_MAX = 48;
export const HIRE_ID_PREFIX = "hire:";

export function isHireId(id: string): boolean {
  return id.startsWith(HIRE_ID_PREFIX);
}

export function newHireId(): string {
  return `${HIRE_ID_PREFIX}${crypto.randomUUID()}`;
}

export function hireRecordId(id: string): string {
  return isHireId(id) ? id.slice(HIRE_ID_PREFIX.length) : id;
}

export function createHireId(recordId: string): string {
  return `${HIRE_ID_PREFIX}${recordId}`;
}

type NodeExtra = Partial<
  Pick<
    HierarchyNode,
    | "label"
    | "collabs"
    | "highlighted"
    | "hirePositionId"
    | "hireBudgetedSalary"
    | "hirePositionName"
  >
>;

export function createNode(
  staffId: string,
  children: HierarchyNode[] = [],
  extra?: NodeExtra,
): HierarchyNode {
  const hire = isHireId(staffId);
  return {
    staffId,
    children,
    label: extra?.label?.trim() || null,
    collabs: extra?.collabs ? sanitizeCollabs(extra.collabs, staffId) : [],
    highlighted: Boolean(extra?.highlighted),
    hirePositionId: hire ? extra?.hirePositionId || null : null,
    hireBudgetedSalary: hire ? extra?.hireBudgetedSalary ?? null : null,
    hirePositionName: hire ? extra?.hirePositionName?.trim() || null : null,
  };
}

export function initialHierarchyRoots(
  _staff?: Array<{ id: string; positionName: string | null }>,
): HierarchyNode[] {
  return [];
}

/** Reporting Hierarchy never shows vacancy cards — those live on Management. */
export function stripHireNodes(roots: HierarchyNode[]): HierarchyNode[] {
  return roots.flatMap((node) => {
    const children = stripHireNodes(node.children);
    if (isHireId(node.staffId)) return children;
    return [{ ...node, children }];
  });
}

export function assignedStaffIds(roots: HierarchyNode[]): Set<string> {
  const ids = new Set<string>();
  walk(roots, (node) => {
    if (!isHireId(node.staffId)) ids.add(node.staffId);
    for (const collab of node.collabs ?? []) {
      if (!isHireId(collab.staffId)) ids.add(collab.staffId);
    }
  });
  return ids;
}

export function findNode(
  roots: HierarchyNode[],
  staffId: string,
): HierarchyNode | null {
  for (const node of roots) {
    if (node.staffId === staffId) return node;
    const nested = findNode(node.children, staffId);
    if (nested) return nested;
  }
  return null;
}

export function subtreeContains(node: HierarchyNode, staffId: string): boolean {
  if (node.staffId === staffId) return true;
  return node.children.some((child) => subtreeContains(child, staffId));
}

export function canPlaceStaff(
  roots: HierarchyNode[],
  staffId: string,
  target: HierarchyDropTarget,
): boolean {
  if (target.kind === "collab") {
    if (isHireId(staffId) || isHireId(target.hostId)) return false;
    return canAddCollab(roots, target.hostId, staffId);
  }
  if (target.kind === "root") return true;
  const moving = findNode(roots, staffId);
  if (target.kind === "parent") {
    if (isHireId(target.parentId)) return false;
    if (target.parentId === staffId) return false;
    if (moving && subtreeContains(moving, target.parentId)) return false;
    return findNode(roots, target.parentId) != null;
  }
  if (target.kind === "above") {
    // A hire cannot sit above a person — that would make the person report to a vacancy.
    if (isHireId(staffId) && !isHireId(target.staffId)) return false;
    if (target.staffId === staffId) return false;
    if (moving && subtreeContains(moving, target.staffId)) return false;
    return findNode(roots, target.staffId) != null;
  }
  if (target.siblingId === staffId) return false;
  if (moving && subtreeContains(moving, target.siblingId)) return false;
  return findNode(roots, target.siblingId) != null;
}

export function canAddCollab(
  roots: HierarchyNode[],
  hostId: string,
  staffId: string,
): boolean {
  if (!staffId || hostId === staffId) return false;
  if (isHireId(hostId) || isHireId(staffId)) return false;
  return findNode(roots, hostId) != null;
}

export function takeSubtree(
  roots: HierarchyNode[],
  staffId: string,
): { roots: HierarchyNode[]; taken: HierarchyNode | null } {
  let taken: HierarchyNode | null = null;

  function filter(nodes: HierarchyNode[]): HierarchyNode[] {
    const next: HierarchyNode[] = [];
    for (const node of nodes) {
      if (node.staffId === staffId) {
        taken = node;
        continue;
      }
      next.push({ ...node, children: filter(node.children) });
    }
    return next;
  }

  return { roots: filter(roots), taken };
}

/** Remove a person from the chart and lift their reports one level. */
export function removeAndPromoteChildren(
  roots: HierarchyNode[],
  staffId: string,
): HierarchyNode[] {
  function filter(nodes: HierarchyNode[]): HierarchyNode[] {
    const next: HierarchyNode[] = [];
    for (const node of nodes) {
      if (node.staffId === staffId) {
        next.push(...filter(node.children));
        continue;
      }
      next.push({
        ...node,
        collabs: (node.collabs ?? []).filter(
          (collab) => collab.staffId !== staffId,
        ),
        children: filter(node.children),
      });
    }
    return next;
  }
  return filter(roots);
}

/** Remove a person and everyone under them from the chart. */
export function removeSubtree(
  roots: HierarchyNode[],
  staffId: string,
): HierarchyNode[] {
  const target = findNode(roots, staffId);
  if (!target) return removeAndPromoteChildren(roots, staffId);

  const removedIds = new Set<string>();
  function collect(node: HierarchyNode) {
    removedIds.add(node.staffId);
    for (const child of node.children) collect(child);
  }
  collect(target);

  function filter(nodes: HierarchyNode[]): HierarchyNode[] {
    const next: HierarchyNode[] = [];
    for (const node of nodes) {
      if (removedIds.has(node.staffId)) continue;
      next.push({
        ...node,
        collabs: (node.collabs ?? []).filter(
          (collab) => !removedIds.has(collab.staffId),
        ),
        children: filter(node.children),
      });
    }
    return next;
  }
  return filter(roots);
}

export function placeStaff(
  roots: HierarchyNode[],
  staffId: string,
  target: HierarchyDropTarget,
  extra?: NodeExtra,
): HierarchyNode[] {
  if (target.kind === "collab") {
    return setCollab(roots, target.hostId, staffId, target.side);
  }
  if (!canPlaceStaff(roots, staffId, target)) return roots;

  const existing = findNode(roots, staffId);
  const pulled = existing
    ? takeSubtree(roots, staffId)
    : { roots, taken: createNode(staffId, [], extra) };
  const toPlace = pulled.taken;
  if (!toPlace) return roots;

  if (target.kind === "root") return [...pulled.roots, toPlace];

  if (target.kind === "above") {
    return insertAbove(pulled.roots, target.staffId, toPlace) ?? roots;
  }

  if (target.kind === "sibling") {
    return (
      insertNextTo(pulled.roots, target.siblingId, target.where, toPlace) ??
      roots
    );
  }

  let inserted = false;
  function map(nodes: HierarchyNode[]): HierarchyNode[] {
    return nodes.map((node) => {
      if (node.staffId === target.parentId) {
        inserted = true;
        return { ...node, children: [...node.children, toPlace] };
      }
      return { ...node, children: map(node.children) };
    });
  }

  const next = map(pulled.roots);
  return inserted ? next : roots;
}

export function setNodeLabel(
  roots: HierarchyNode[],
  staffId: string,
  label: string | null,
): HierarchyNode[] {
  const nextLabel = clipLabel(label);
  let found = false;
  function map(nodes: HierarchyNode[]): HierarchyNode[] {
    return nodes.map((node) => {
      if (node.staffId === staffId) {
        found = true;
        return { ...node, label: nextLabel };
      }
      return { ...node, children: map(node.children) };
    });
  }
  const next = map(roots);
  return found ? next : roots;
}

export function setHireDetails(
  roots: HierarchyNode[],
  staffId: string,
  details: {
    hirePositionId?: string | null;
    hireBudgetedSalary?: number | null;
    hirePositionName?: string | null;
  },
): HierarchyNode[] {
  if (!isHireId(staffId)) return roots;
  let found = false;
  function map(nodes: HierarchyNode[]): HierarchyNode[] {
    return nodes.map((node) => {
      if (node.staffId === staffId) {
        found = true;
        return {
          ...node,
          hirePositionId:
            details.hirePositionId !== undefined
              ? details.hirePositionId
              : node.hirePositionId,
          hireBudgetedSalary:
            details.hireBudgetedSalary !== undefined
              ? details.hireBudgetedSalary
              : node.hireBudgetedSalary,
          hirePositionName:
            details.hirePositionName !== undefined
              ? details.hirePositionName?.trim() || null
              : node.hirePositionName,
        };
      }
      return { ...node, children: map(node.children) };
    });
  }
  const next = map(roots);
  return found ? next : roots;
}

export function setNodeHighlighted(
  roots: HierarchyNode[],
  staffId: string,
  highlighted: boolean,
): HierarchyNode[] {
  let found = false;
  function map(nodes: HierarchyNode[]): HierarchyNode[] {
    return nodes.map((node) => {
      if (node.staffId === staffId) {
        found = true;
        return { ...node, highlighted };
      }
      return { ...node, children: map(node.children) };
    });
  }
  const next = map(roots);
  return found ? next : roots;
}

export function setCollab(
  roots: HierarchyNode[],
  hostId: string,
  staffId: string,
  side: HierarchyCollabSide,
): HierarchyNode[] {
  if (!canAddCollab(roots, hostId, staffId)) return roots;
  let found = false;
  function map(nodes: HierarchyNode[]): HierarchyNode[] {
    return nodes.map((node) => {
      if (node.staffId === hostId) {
        found = true;
        const rest = (node.collabs ?? []).filter(
          (collab) => collab.staffId !== staffId,
        );
        return { ...node, collabs: [...rest, { staffId, side }] };
      }
      return { ...node, children: map(node.children) };
    });
  }
  const next = map(roots);
  return found ? next : roots;
}

export function removeCollab(
  roots: HierarchyNode[],
  hostId: string,
  staffId: string,
): HierarchyNode[] {
  let found = false;
  function map(nodes: HierarchyNode[]): HierarchyNode[] {
    return nodes.map((node) => {
      if (node.staffId === hostId) {
        found = true;
        return {
          ...node,
          collabs: (node.collabs ?? []).filter(
            (collab) => collab.staffId !== staffId,
          ),
        };
      }
      return { ...node, children: map(node.children) };
    });
  }
  const next = map(roots);
  return found ? next : roots;
}

/** Put `node` in `currentId`'s slot; current person and their reports move down one level. */
function insertAbove(
  roots: HierarchyNode[],
  currentId: string,
  node: HierarchyNode,
): HierarchyNode[] | null {
  function splice(nodes: HierarchyNode[]): HierarchyNode[] | null {
    const at = nodes.findIndex((item) => item.staffId === currentId);
    if (at >= 0) {
      const current = nodes[at];
      if (!current) return null;
      const next = [...nodes];
      next[at] = {
        ...node,
        children: [current, ...node.children],
      };
      return next;
    }
    for (let index = 0; index < nodes.length; index += 1) {
      const item = nodes[index];
      if (!item) continue;
      const children = splice(item.children);
      if (!children) continue;
      const next = [...nodes];
      next[index] = { ...item, children };
      return next;
    }
    return null;
  }

  return splice(roots);
}

function insertNextTo(
  roots: HierarchyNode[],
  siblingId: string,
  where: "before" | "after",
  node: HierarchyNode,
): HierarchyNode[] | null {
  const at = roots.findIndex((item) => item.staffId === siblingId);
  if (at >= 0) {
    const next = [...roots];
    next.splice(where === "before" ? at : at + 1, 0, node);
    return next;
  }

  let found = false;
  function map(nodes: HierarchyNode[]): HierarchyNode[] {
    return nodes.map((item) => {
      const childAt = item.children.findIndex(
        (child) => child.staffId === siblingId,
      );
      if (childAt >= 0) {
        found = true;
        const children = [...item.children];
        children.splice(where === "before" ? childAt : childAt + 1, 0, node);
        return { ...item, children };
      }
      return { ...item, children: map(item.children) };
    });
  }

  const next = map(roots);
  return found ? next : null;
}

export function flattenHierarchy(roots: HierarchyNode[]): HierarchyPersistRow[] {
  const rows: HierarchyPersistRow[] = [];

  function visit(nodes: HierarchyNode[], parentId: string | null) {
    nodes.forEach((node, index) => {
      rows.push({
        staffId: node.staffId,
        reportsToStaffId: parentId,
        sortOrder: index,
        label: clipLabel(node.label),
        collabs: sanitizeCollabs(node.collabs ?? [], node.staffId),
        highlighted: Boolean(node.highlighted),
        hirePositionId: isHireId(node.staffId) ? node.hirePositionId : null,
        hireBudgetedSalary: isHireId(node.staffId)
          ? node.hireBudgetedSalary
          : null,
        hirePositionName: isHireId(node.staffId)
          ? node.hirePositionName
          : null,
      });
      visit(node.children, node.staffId);
    });
  }

  visit(roots, null);
  return rows;
}

export function buildHierarchy(
  rows: HierarchyPersistRow[],
  knownStaffIds?: Set<string>,
): HierarchyNode[] {
  const known = knownStaffIds ?? new Set(rows.map((row) => row.staffId));
  const parentOf = new Map<string, string | null>();
  for (const row of rows) {
    parentOf.set(row.staffId, row.reportsToStaffId);
  }

  function resolvedParent(staffId: string): string | null {
    let parent = parentOf.get(staffId) ?? null;
    const seen = new Set<string>();
    while (parent && !known.has(parent)) {
      if (seen.has(parent)) return null;
      seen.add(parent);
      parent = parentOf.get(parent) ?? null;
    }
    return parent;
  }

  const byParent = new Map<string, HierarchyPersistRow[]>();
  for (const row of rows) {
    if (!known.has(row.staffId)) continue;
    const parent = resolvedParent(row.staffId);
    const key = parent ?? "root";
    const list = byParent.get(key) ?? [];
    list.push({ ...row, reportsToStaffId: parent });
    byParent.set(key, list);
  }

  function childrenOf(parentKey: string): HierarchyNode[] {
    return (byParent.get(parentKey) ?? [])
      .slice()
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.staffId.localeCompare(b.staffId),
      )
      .map((row) =>
        createNode(row.staffId, childrenOf(row.staffId), {
          label: row.label,
          collabs: sanitizeCollabs(row.collabs ?? [], row.staffId).filter(
            (collab) => known.has(collab.staffId),
          ),
          highlighted: Boolean(row.highlighted),
          hirePositionId: row.hirePositionId,
          hireBudgetedSalary: row.hireBudgetedSalary,
          hirePositionName: row.hirePositionName,
        }),
      );
  }

  return childrenOf("root");
}

export function parseCollabs(value: unknown): HierarchyCollab[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const next: HierarchyCollab[] = [];
  for (const item of value) {
    const parsed = parseCollab(item);
    if (!parsed || seen.has(parsed.staffId)) continue;
    seen.add(parsed.staffId);
    next.push(parsed);
  }
  return next;
}

function parseCollab(value: unknown): HierarchyCollab | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const staffId = String(row.staffId ?? row.staff_id ?? "").trim();
  const side = row.side === "left" || row.side === "right" ? row.side : null;
  if (!staffId || !side) return null;
  return { staffId, side };
}

function sanitizeCollabs(
  collabs: HierarchyCollab[],
  hostId: string,
): HierarchyCollab[] {
  const seen = new Set<string>();
  const next: HierarchyCollab[] = [];
  for (const collab of collabs) {
    if (!collab.staffId || collab.staffId === hostId) continue;
    if (collab.side !== "left" && collab.side !== "right") continue;
    if (seen.has(collab.staffId)) continue;
    seen.add(collab.staffId);
    next.push({ staffId: collab.staffId, side: collab.side });
  }
  return next;
}

function clipLabel(label: string | null | undefined): string | null {
  const trimmed = label?.trim() ?? "";
  if (!trimmed) return null;
  return trimmed.slice(0, HIERARCHY_LABEL_MAX);
}

function walk(
  nodes: HierarchyNode[],
  visit: (node: HierarchyNode) => void,
): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}
