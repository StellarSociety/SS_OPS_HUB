"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  Highlighter,
  House,
  Link2,
  Maximize2,
  Minimize2,
  Minus,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Search,
  Tag,
  UserMinus,
  UserPlus,
  Users,
  UserX,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import {
  RightClickMenu,
  rightClickMenuItemClass,
} from "@/components/layout/right-click-menu";
import {
  PhotoPlaceholderMark,
  StaffPhotoPreview,
  staffPhotoDetailsFromDirectoryMember,
} from "@/components/hr/staff-photo-thumbnail";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import { toast } from "@/components/ui/toast";
import { saveDirectoryHierarchyAction } from "@/lib/actions/directory-hierarchy";
import {
  assignedStaffIds,
  canPlaceStaff,
  HIERARCHY_LABEL_MAX,
  isHireId,
  newHireId,
  placeStaff,
  stripHireNodes,
  removeAndPromoteChildren,
  removeCollab,
  removeSubtree,
  setHireDetails,
  setNodeHighlighted,
  setNodeLabel,
  type HierarchyDropTarget,
  type HierarchyNode,
} from "@/lib/directory/hierarchy-tree";
import { subtreeSalaryTotal } from "@/lib/directory/hierarchy-pay";
import type {
  DirectoryPositionOption,
  DirectoryStaffMember,
  DirectoryStaffPay,
} from "@/lib/directory/types";
import { formatAed } from "@/lib/hr/derived";
import { firstLastName } from "@/lib/user/display";
import { cn } from "@/lib/utils";
import { packOrgTreeLeaves } from "@/components/directory/pack-org-tree-leaves";
import "./directory-hierarchy-tree.css";

const STAFF_DRAG_TYPE = "application/x-directory-staff-id";
const NO_DEPARTMENT = "__none__";
const TREE_ZOOM_FLOOR = 5;
const TREE_ZOOM_MAX = 150;
const TREE_ZOOM_STEP = 10;
const TREE_ZOOM_FINE_STEP = 5;
const TREE_ZOOM_DEFAULT = 50;

function parseSalaryInput(raw: string): number | null | "invalid" {
  const trimmed = raw.trim().replace(/,/g, "");
  if (!trimmed) return null;
  const amount = Number(trimmed);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : "invalid";
}

function salaryDraftValue(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "";
  return String(amount);
}

function zoomStepFrom(percent: number, direction: -1 | 1) {
  if (direction < 0 && percent <= TREE_ZOOM_DEFAULT) return TREE_ZOOM_FINE_STEP;
  if (direction > 0 && percent < TREE_ZOOM_DEFAULT) return TREE_ZOOM_FINE_STEP;
  return TREE_ZOOM_STEP;
}

function snapTreeZoom(percent: number) {
  const step =
    percent < TREE_ZOOM_DEFAULT ? TREE_ZOOM_FINE_STEP : TREE_ZOOM_STEP;
  return Math.round(percent / step) * step;
}

function clampTreeZoom(percent: number, min = TREE_ZOOM_FLOOR) {
  const snapped = snapTreeZoom(percent);
  return Math.min(TREE_ZOOM_MAX, Math.max(min, snapped));
}

function fitZoomFloor(
  scroller: HTMLElement,
  currentZoom: number,
  naturalW: number,
  naturalH: number,
) {
  const style = getComputedStyle(scroller);
  const padX =
    Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
  const padY =
    Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
  const availW = Math.max(1, scroller.clientWidth - padX);
  const availH = Math.max(1, scroller.clientHeight - padY);
  const scaledW = Math.max(availW, scroller.scrollWidth - padX);
  const scaledH = Math.max(availH, scroller.scrollHeight - padY);
  const fromScroll =
    Math.min(availW / scaledW, availH / scaledH) * currentZoom;
  const fromNatural = Math.min(
    naturalW > 0 ? (availW / naturalW) * 100 : currentZoom,
    naturalH > 0 ? (availH / naturalH) * 100 : currentZoom,
  );
  // Slack so subpixels / scrollbars / labels still fit after snapping.
  const fit = Math.min(fromScroll, fromNatural) * 0.98;
  const snapped = Math.floor(fit / TREE_ZOOM_FINE_STEP) * TREE_ZOOM_FINE_STEP;
  return Math.max(TREE_ZOOM_FLOOR, Math.min(snapped, TREE_ZOOM_DEFAULT));
}

/** Zoom so the current tree bounds fill the canvas (collapse → in, expand → out). */
function fitZoomToContent(
  scroller: HTMLElement,
  naturalW: number,
  naturalH: number,
  mode: "collapse" | "expand",
) {
  if (naturalW <= 0 || naturalH <= 0) return TREE_ZOOM_DEFAULT;

  if (mode === "collapse") {
    // Collapsed fit was already right — keep the original contain + slack.
    const style = getComputedStyle(scroller);
    const padX =
      Number.parseFloat(style.paddingLeft) +
      Number.parseFloat(style.paddingRight);
    const padY =
      Number.parseFloat(style.paddingTop) +
      Number.parseFloat(style.paddingBottom);
    const availW = Math.max(1, scroller.clientWidth - padX);
    const availH = Math.max(1, scroller.clientHeight - padY);
    const fit = Math.min(availW / naturalW, availH / naturalH) * 100 * 0.97;
    const snapped = Math.floor(fit / TREE_ZOOM_FINE_STEP) * TREE_ZOOM_FINE_STEP;
    return Math.max(TREE_ZOOM_FLOOR, Math.min(TREE_ZOOM_MAX, snapped));
  }

  // Expanded — every card must stay in view (true contain). Only the slack
  // differs from collapse so we don't leave a large empty frame.
  const style = getComputedStyle(scroller);
  const padX =
    Number.parseFloat(style.paddingLeft) +
    Number.parseFloat(style.paddingRight);
  const padY =
    Number.parseFloat(style.paddingTop) +
    Number.parseFloat(style.paddingBottom);
  const availW = Math.max(1, scroller.clientWidth - padX);
  const availH = Math.max(1, scroller.clientHeight - padY);
  const fit = Math.min(availW / naturalW, availH / naturalH) * 100 * 0.99;
  // Floor so zoom never exceeds contain (no clipped cards).
  const snapped = Math.floor(fit);
  return Math.max(TREE_ZOOM_FLOOR, Math.min(TREE_ZOOM_MAX, snapped));
}

function isChartControl(target: EventTarget | null) {
  if (!(target instanceof Element)) return true;
  return Boolean(
    target.closest(
      "button, a, input, textarea, [role='menu'], [role='dialog'], [data-hire-field]",
    ),
  );
}

function isStaffCardTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  let node: Element | null = target;
  while (node) {
    if (node instanceof HTMLElement && node.draggable) return true;
    if (node.classList.contains("dir-org-node")) return true;
    node = node.parentElement;
  }
  return false;
}

function panBlocked(target: EventTarget | null, staffDrag: boolean) {
  if (isChartControl(target)) return true;
  return staffDrag && isStaffCardTarget(target);
}

function useKeepCanvasPanOffCard(
  ref: { current: HTMLElement | null },
  enabled: boolean,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    function onPointerDown(event: PointerEvent) {
      event.stopPropagation();
    }
    el.addEventListener("pointerdown", onPointerDown);
    return () => el.removeEventListener("pointerdown", onPointerDown);
  }, [ref, enabled]);
}

function portalWhen(active: boolean, node: ReactNode) {
  if (active && typeof document !== "undefined") {
    return createPortal(node, document.body);
  }
  return node;
}

function departmentKey(member: DirectoryStaffMember): string {
  return member.departmentName?.trim() || NO_DEPARTMENT;
}

function labeledBranchStaffIds(nodes: HierarchyNode[]): string[] {
  const ids: string[] = [];
  function visit(list: HierarchyNode[]) {
    for (const node of list) {
      if (node.label?.trim() && node.children.length > 0) {
        ids.push(node.staffId);
      }
      visit(node.children);
    }
  }
  visit(nodes);
  return ids;
}

type DirectoryHierarchyBoardProps = {
  staff: DirectoryStaffMember[];
  roots: HierarchyNode[];
  canEdit: boolean;
  variant?: "reporting" | "management";
  payByStaffId?: Record<string, DirectoryStaffPay>;
  positions?: DirectoryPositionOption[];
};

export function DirectoryHierarchyBoard({
  staff,
  roots: initialRoots,
  canEdit: canEditRequested,
  variant = "reporting",
  payByStaffId = {},
  positions = [],
}: DirectoryHierarchyBoardProps) {
  const management = variant === "management";
  const canEdit = management && canEditRequested;
  const [roots, setRoots] = useState<HierarchyNode[]>(() =>
    management ? initialRoots : stripHireNodes(initialRoots),
  );
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(
    () => new Set(labeledBranchStaffIds(initialRoots)),
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const saveGen = useRef(0);
  const draggingIdRef = useRef<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [showSalary, setShowSalary] = useState(false);
  const [treeZoom, setTreeZoom] = useState(TREE_ZOOM_DEFAULT);
  const [zoomMin, setZoomMin] = useState(TREE_ZOOM_FLOOR);
  const [fullWindow, setFullWindow] = useState(false);
  const treeZoomRef = useRef(treeZoom);
  treeZoomRef.current = treeZoom;
  const zoomMinRef = useRef(zoomMin);
  zoomMinRef.current = zoomMin;
  const treeScrollRef = useRef<HTMLDivElement>(null);
  const treeContentRef = useRef<HTMLDivElement>(null);
  const [treeNatural, setTreeNatural] = useState({
    w: 0,
    h: 0,
    ox: 0,
    oy: 0,
  });
  const zoomAnchorRef = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const viewAnchorRef = useRef<{
    staffId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const fitViewAfterCollapseRef = useRef(true);
  const fitViewCenterRef = useRef(true);
  const fitViewModeRef = useRef<"collapse" | "expand">("collapse");
  const pendingViewActionRef = useRef<"center" | "restore" | null>(null);
  const [viewLayoutTick, setViewLayoutTick] = useState(0);
  const centeredRootRef = useRef(false);
  const wheelZoomAccRef = useRef(0);
  const [panning, setPanning] = useState(false);
  const panRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);

  const byId = useMemo(() => {
    return new Map(staff.map((member) => [member.id, member]));
  }, [staff]);

  const assigned = useMemo(() => assignedStaffIds(roots), [roots]);
  const placing = canEdit && Boolean(selectedId || draggingId);

  const labeledBranchIds = useMemo(
    () => labeledBranchStaffIds(roots),
    [roots],
  );

  const labeledBranchesCollapsed =
    labeledBranchIds.length > 0 &&
    labeledBranchIds.every((id) => collapsedIds.has(id));

  function toggleLabeledBranches() {
    if (labeledBranchIds.length === 0) return;
    const expanding = labeledBranchIds.every((id) => collapsedIds.has(id));
    fitViewAfterCollapseRef.current = true;
    fitViewCenterRef.current = true;
    fitViewModeRef.current = expanding ? "expand" : "collapse";
    viewAnchorRef.current = null;
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (expanding) {
        for (const id of labeledBranchIds) next.delete(id);
      } else {
        for (const id of labeledBranchIds) next.add(id);
      }
      return next;
    });
  }

  function centerTreeInView() {
    const scroller = treeScrollRef.current;
    if (!scroller) return;
    scroller.scrollLeft = Math.max(
      0,
      (scroller.scrollWidth - scroller.clientWidth) / 2,
    );
    scroller.scrollTop = Math.max(
      0,
      (scroller.scrollHeight - scroller.clientHeight) / 2,
    );
  }

  function captureCanvasViewAnchor() {
    const scroller = treeScrollRef.current;
    const content = treeContentRef.current;
    if (!scroller || !content) return;
    const frame = scroller.getBoundingClientRect();
    const cx = frame.left + scroller.clientWidth / 2;
    const cy = frame.top + scroller.clientHeight / 2;
    let best: { staffId: string; dist: number; el: HTMLElement } | null = null;
    for (const el of content.querySelectorAll<HTMLElement>("[data-org-staff-id]")) {
      const staffId = el.dataset.orgStaffId;
      if (!staffId) continue;
      const box = el.getBoundingClientRect();
      const mx = (box.left + box.right) / 2;
      const my = (box.top + box.bottom) / 2;
      const dist = (mx - cx) ** 2 + (my - cy) ** 2;
      if (!best || dist < best.dist) best = { staffId, dist, el };
    }
    if (!best) return;
    const box = best.el.getBoundingClientRect();
    viewAnchorRef.current = {
      staffId: best.staffId,
      offsetX: (box.left + box.right) / 2 - cx,
      offsetY: (box.top + box.bottom) / 2 - cy,
    };
  }

  function restoreCanvasViewAnchor() {
    const anchor = viewAnchorRef.current;
    const scroller = treeScrollRef.current;
    const content = treeContentRef.current;
    if (!anchor || !scroller || !content) return;
    viewAnchorRef.current = null;
    const el = content.querySelector(
      `[data-org-staff-id="${CSS.escape(anchor.staffId)}"]`,
    );
    if (!(el instanceof HTMLElement)) return;
    const frame = scroller.getBoundingClientRect();
    const cx = frame.left + scroller.clientWidth / 2;
    const cy = frame.top + scroller.clientHeight / 2;
    const box = el.getBoundingClientRect();
    const mx = (box.left + box.right) / 2;
    const my = (box.top + box.bottom) / 2;
    scroller.scrollLeft += mx - cx - anchor.offsetX;
    scroller.scrollTop += my - cy - anchor.offsetY;
  }

  const departments = useMemo(() => {
    const byName = new Map<string, { name: string; sortOrder: number }>();
    for (const member of staff) {
      const name = member.departmentName?.trim();
      if (!name) continue;
      const sortOrder = member.departmentSortOrder ?? Number.MAX_SAFE_INTEGER;
      const existing = byName.get(name);
      if (!existing || sortOrder < existing.sortOrder) {
        byName.set(name, { name, sortOrder });
      }
    }
    return [...byName.values()].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
  }, [staff]);

  const hasUnassignedDepartment = staff.some(
    (member) => !member.departmentName?.trim(),
  );

  const notOnChartCount = useMemo(
    () => staff.reduce((count, member) => count + (assigned.has(member.id) ? 0 : 1), 0),
    [assigned, staff],
  );

  const unassigned = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staff.filter((member) => {
      if (assigned.has(member.id)) return false;
      if (department && departmentKey(member) !== department) return false;
      if (!q) return true;
      return (
        member.fullName.toLowerCase().includes(q) ||
        member.departmentName?.toLowerCase().includes(q) ||
        member.positionName?.toLowerCase().includes(q) ||
        member.empNo.toLowerCase().includes(q)
      );
    });
  }, [assigned, department, query, staff]);

  function persist(next: HierarchyNode[]) {
    if (!canEdit) return;
    const gen = ++saveGen.current;
    setSaveState("saving");
    void saveDirectoryHierarchyAction(next, {
      persistHires: management,
    }).then((result) => {
      if (gen !== saveGen.current) return;
      if (result.ok) {
        setSaveState("saved");
        return;
      }
      setSaveState("error");
      toast.error(result.error);
    });
  }

  function commit(next: HierarchyNode[]) {
    if (next === roots) return;
    setRoots(next);
    persist(next);
  }

  function place(staffId: string, target: HierarchyDropTarget) {
    if (!canEdit) return;
    const next = placeStaff(roots, staffId, target);
    if (next === roots) {
      setDropTarget(null);
      return;
    }
    commit(next);
    setSelectedId(null);
    setDropTarget(null);
    draggingIdRef.current = null;
    setDraggingId(null);
    if (target.kind === "parent") expandBranch(target.parentId);
  }

  function remove(staffId: string, mode: "level" | "chart") {
    if (!canEdit) return;
    commit(
      mode === "chart"
        ? removeSubtree(roots, staffId)
        : removeAndPromoteChildren(roots, staffId),
    );
    if (selectedId === staffId) setSelectedId(null);
  }

  function saveLabel(staffId: string, label: string | null) {
    if (!canEdit) return;
    commit(setNodeLabel(roots, staffId, label));
  }

  function saveHighlight(staffId: string, highlighted: boolean) {
    if (!canEdit) return;
    commit(setNodeHighlighted(roots, staffId, highlighted));
  }

  function dropCollab(hostId: string, staffId: string) {
    if (!canEdit) return;
    commit(removeCollab(roots, hostId, staffId));
  }

  function saveHire(
    staffId: string,
    details: {
      hirePositionId?: string | null;
      hireBudgetedSalary?: number | null;
      hirePositionName?: string | null;
    },
  ) {
    if (!canEdit) return;
    commit(setHireDetails(roots, staffId, details));
  }

  function expandBranch(staffId: string) {
    setCollapsedIds((current) => {
      if (!current.has(staffId)) return current;
      const nextIds = new Set(current);
      nextIds.delete(staffId);
      return nextIds;
    });
  }

  function addHireAt(target: HierarchyDropTarget) {
    if (!canEdit) return;
    if (target.kind === "collab") return;
    const hireId = newHireId();
    if (!canPlaceStaff(roots, hireId, target)) return;
    const next = placeStaff(roots, hireId, target);
    if (next === roots) return;
    commit(next);
    setSelectedId(null);
    setListOpen(false);
    if (target.kind === "parent") expandBranch(target.parentId);
  }

  function addHireUnder(parentId: string) {
    addHireAt({ kind: "parent", parentId });
  }

  function readDragId(event: DragEvent): string | null {
    const fromType = event.dataTransfer.getData(STAFF_DRAG_TYPE);
    return fromType || event.dataTransfer.getData("text/plain") || null;
  }

  function onDragStart(event: DragEvent, staffId: string) {
    if (!canEdit) return;
    event.stopPropagation();
    event.dataTransfer.setData(STAFF_DRAG_TYPE, staffId);
    event.dataTransfer.setData("text/plain", staffId);
    event.dataTransfer.effectAllowed = "move";
    // Hide the browser’s translucent card snapshot — it reads as a second person.
    const blank = document.createElement("div");
    blank.style.width = "1px";
    blank.style.height = "1px";
    blank.style.opacity = "0";
    blank.style.position = "fixed";
    blank.style.top = "-1000px";
    blank.style.pointerEvents = "none";
    document.body.appendChild(blank);
    event.dataTransfer.setDragImage(blank, 0, 0);
    requestAnimationFrame(() => blank.remove());
    draggingIdRef.current = staffId;
    setDraggingId(staffId);
  }

  function onDragEnd() {
    draggingIdRef.current = null;
    setDraggingId(null);
    setDropTarget(null);
  }

  function allowDrop(
    event: DragEvent,
    key: string,
    target: HierarchyDropTarget,
  ) {
    if (!canEdit) return;
    const staffId = draggingIdRef.current;
    if (staffId && !canPlaceStaff(roots, staffId, target)) {
      event.dataTransfer.dropEffect = "none";
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget(key);
  }

  function dropOn(event: DragEvent, target: HierarchyDropTarget) {
    event.preventDefault();
    const staffId = readDragId(event) ?? draggingId;
    if (staffId) place(staffId, target);
  }

  function clickPlace(target: HierarchyDropTarget) {
    if (!selectedId) return;
    place(selectedId, target);
  }

  function toggleCollapsed(staffId: string) {
    // Single-branch chevron: keep zoom; only re-anchor so the card stays in place.
    captureCanvasViewAnchor();
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });
  }

  function applyTreeZoom(
    nextPercent: number,
    anchor?: { clientX: number; clientY: number },
  ) {
    const next = clampTreeZoom(nextPercent, zoomMinRef.current);
    const prev = treeZoomRef.current;
    if (next === prev) return;
    treeZoomRef.current = next;
    const scroller = treeScrollRef.current;
    if (scroller && anchor) {
      const rect = scroller.getBoundingClientRect();
      const scale = prev / 100;
      zoomAnchorRef.current = {
        x: (anchor.clientX - rect.left + scroller.scrollLeft) / scale,
        y: (anchor.clientY - rect.top + scroller.scrollTop) / scale,
        left: anchor.clientX - rect.left,
        top: anchor.clientY - rect.top,
      };
    } else {
      zoomAnchorRef.current = null;
    }
    setTreeZoom(next);
  }

  useLayoutEffect(() => {
    const el = treeContentRef.current;
    if (!el) return;
    const measure = () => {
      packOrgTreeLeaves(el);
      const scale = treeZoomRef.current / 100 || 1;
      const origin = el.getBoundingClientRect();
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const node of el.querySelectorAll(
        ".dir-org-node, .dir-org-label",
      )) {
        const box = node.getBoundingClientRect();
        minX = Math.min(minX, (box.left - origin.left) / scale);
        minY = Math.min(minY, (box.top - origin.top) / scale);
        maxX = Math.max(maxX, (box.right - origin.left) / scale);
        maxY = Math.max(maxY, (box.bottom - origin.top) / scale);
      }
      if (!Number.isFinite(minX)) {
        minX = 0;
        minY = 0;
        maxX = el.offsetWidth;
        maxY = el.offsetHeight;
      }
      // Tight content box only — ignore inflated scrollWidth / min-width empty space.
      const natural = {
        w: Math.ceil(Math.max(1, maxX - minX)),
        h: Math.ceil(Math.max(1, maxY - minY)),
        ox: Math.ceil(-minX),
        oy: Math.ceil(-minY),
      };
      const scroller = treeScrollRef.current;
      const shouldFitView = fitViewAfterCollapseRef.current && scroller;
      if (shouldFitView) {
        fitViewAfterCollapseRef.current = false;
        const nextZoom = fitZoomToContent(
          scroller,
          natural.w,
          natural.h,
          fitViewModeRef.current,
        );
        const nextMin = Math.min(nextZoom, TREE_ZOOM_DEFAULT);
        treeZoomRef.current = nextZoom;
        zoomMinRef.current = nextMin;
        viewAnchorRef.current = null;
        pendingViewActionRef.current = "center";
        setTreeNatural(natural);
        setTreeZoom(nextZoom);
        setZoomMin(nextMin);
        setViewLayoutTick((tick) => tick + 1);
      } else if (viewAnchorRef.current) {
        pendingViewActionRef.current = "restore";
        setTreeNatural(natural);
        setViewLayoutTick((tick) => tick + 1);
      } else {
        setTreeNatural(natural);
      }
      if (scroller && !shouldFitView) {
        const overflowing =
          scroller.scrollWidth > scroller.clientWidth + 1 ||
          scroller.scrollHeight > scroller.clientHeight + 1;
        const fitted = fitZoomFloor(
          scroller,
          treeZoomRef.current,
          natural.w,
          natural.h,
        );
        const nextMin = overflowing
          ? Math.min(
              fitted,
              Math.max(
                TREE_ZOOM_FLOOR,
                snapTreeZoom(treeZoomRef.current) - TREE_ZOOM_FINE_STEP,
              ),
            )
          : Math.max(
              TREE_ZOOM_FLOOR,
              Math.min(TREE_ZOOM_DEFAULT, snapTreeZoom(treeZoomRef.current)),
            );
        if (nextMin !== zoomMinRef.current) {
          setZoomMin(nextMin);
        }
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const scroller = treeScrollRef.current;
    if (scroller) observer.observe(scroller);
    return () => observer.disconnect();
  }, [roots, placing, canEdit, fullWindow, treeZoom, collapsedIds]);

  useLayoutEffect(() => {
    const action = pendingViewActionRef.current;
    if (!action) return;
    pendingViewActionRef.current = null;
    if (action === "center") {
      fitViewCenterRef.current = false;
      centerTreeInView();
      centeredRootRef.current = true;
      return;
    }
    restoreCanvasViewAnchor();
  }, [viewLayoutTick]);

  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    const scroller = treeScrollRef.current;
    if (!anchor || !scroller) return;
    zoomAnchorRef.current = null;
    const scale = treeZoom / 100;
    scroller.scrollLeft = anchor.x * scale - anchor.left;
    scroller.scrollTop = anchor.y * scale - anchor.top;
  }, [treeZoom]);

  useLayoutEffect(() => {
    if (centeredRootRef.current) return;
    if (treeNatural.w <= 0 || treeNatural.h <= 0) return;
    const scroller = treeScrollRef.current;
    const content = treeContentRef.current;
    if (!scroller || !content || scroller.clientWidth === 0) return;
    const rootCard = content.querySelector(
      ".dir-org-tree > li .dir-org-node.w-40",
    );
    if (!(rootCard instanceof HTMLElement)) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const card = rootCard.getBoundingClientRect();
    scroller.scrollLeft +=
      card.left + card.width / 2 - (scrollerRect.left + scroller.clientWidth / 2);
    scroller.scrollTop += card.top - (scrollerRect.top + 16);
    centeredRootRef.current = true;
  }, [treeNatural.w, treeNatural.h, treeZoom]);

  useEffect(() => {
    if (!fullWindow) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;
      event.preventDefault();
      setFullWindow(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullWindow]);

  useEffect(() => {
    if (!listOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setListOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listOpen]);

  useEffect(() => {
    const scroller = treeScrollRef.current;
    if (!scroller) return;
    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      // Normalize delta (trackpads send many tiny pixel events; mice send larger ones).
      let dy = event.deltaY;
      if (event.deltaMode === 1) dy *= 16;
      else if (event.deltaMode === 2) dy *= 40;
      wheelZoomAccRef.current += dy;
      // ~20% of prior sensitivity — need a larger gesture per step.
      const threshold = 700;
      if (Math.abs(wheelZoomAccRef.current) < threshold) return;
      const direction: -1 | 1 = wheelZoomAccRef.current > 0 ? -1 : 1;
      wheelZoomAccRef.current -= direction < 0 ? threshold : -threshold;
      // Wheel/pinch always uses the fine step — toolbar keeps larger jumps.
      applyTreeZoom(treeZoomRef.current + direction * TREE_ZOOM_FINE_STEP, {
        clientX: event.clientX,
        clientY: event.clientY,
      });
    }
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, [fullWindow]);

  useEffect(() => {
    const scroller = treeScrollRef.current;
    if (!scroller) return;
    const canvas = scroller;

    const abortPan = () => {
      const pan = panRef.current;
      if (!pan) return;
      panRef.current = null;
      setPanning(false);
      if (canvas.hasPointerCapture(pan.pointerId)) {
        canvas.releasePointerCapture(pan.pointerId);
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (event.pointerType === "touch") return;
      if (draggingIdRef.current) return;
      if (panBlocked(event.target, canEdit)) return;
      panRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: canvas.scrollLeft,
        top: canvas.scrollTop,
        moved: false,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      const pan = panRef.current;
      if (!pan || event.pointerId !== pan.pointerId) return;
      if (draggingIdRef.current) {
        abortPan();
        return;
      }
      const dx = event.clientX - pan.x;
      const dy = event.clientY - pan.y;
      if (!pan.moved) {
        if (dx * dx + dy * dy < 9) return;
        pan.moved = true;
        if (event.isTrusted) {
          try {
            canvas.setPointerCapture(event.pointerId);
          } catch {
            /* window listeners still pan if capture is unavailable */
          }
        }
        setPanning(true);
      }
      canvas.scrollLeft = pan.left - dx;
      canvas.scrollTop = pan.top - dy;
    };

    const onPointerUp = (event: PointerEvent) => {
      const pan = panRef.current;
      if (!pan || event.pointerId !== pan.pointerId) return;
      const moved = pan.moved;
      abortPan();
      if (moved) {
        canvas.addEventListener(
          "click",
          (click) => {
            click.preventDefault();
            click.stopPropagation();
          },
          { capture: true, once: true },
        );
      }
    };

    const onNativeDragStart = () => {
      abortPan();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("dragstart", onNativeDragStart, true);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("dragstart", onNativeDragStart, true);
    };
  }, [canEdit, fullWindow]);

  const treeScale = treeZoom / 100;
  const treeSized = treeNatural.w > 0 && treeNatural.h > 0;
  const canvasPan = roots.length > 0;

  return (
    <div className="-mx-4 -mb-4 -mt-3 flex h-[calc(100%+1.75rem)] min-h-0 flex-col overflow-hidden px-4 pt-3 md:-mx-8 md:-mb-8 md:-mt-4 md:h-[calc(100%+3rem)] md:px-8 md:pt-4">
      <div className="shrink-0">
        <ModulePageTitle>
          {management ? "Hierarchy Management" : "Hierarchy"}
        </ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          {management
            ? canEdit
              ? saveState === "saving"
                ? "Saving hire cards and the reporting tree…"
                : saveState === "error"
                  ? "Could not save — try the last change again."
                  : "Same reporting tree as Hierarchy. Add HIRE cards for open positions; labels total people and budgeted vacancies."
              : "Same reporting tree as Hierarchy. Each card shows employee number and payable salary; labels total everyone in that branch."
            : "View the reporting tree. Edits are made on Hierarchy Management."}
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      {portalWhen(
        fullWindow,
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-hidden",
            fullWindow
              ? "fixed inset-0 z-[250] bg-[color-mix(in_srgb,var(--venue-secondary,#F0F3DD)_22%,white)]"
              : "relative mt-4",
          )}
        >
        <section
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
            fullWindow
              ? "rounded-none border-0 bg-[color-mix(in_srgb,var(--venue-secondary,#F0F3DD)_18%,white)]"
              : "rounded-2xl border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/35",
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/10 bg-white/70 px-4 py-3">
            <div className="min-w-0">
              <h2 className="font-serif text-xl text-[#3D421F]">
                {management ? "Management tree" : "Reporting tree"}
              </h2>
              <p className="mt-0.5 text-xs text-black/45">
                {management
                  ? "Employee number, payable salary, and department totals. Right-click someone to add hiring."
                  : canEdit
                    ? selectedId
                      ? roots.length === 0
                        ? "Add this person at the top of the chart."
                        : "Click a person to hang them as a report, or the left/right edge to place beside them."
                      : "Drag onto a person to hang a report, or onto the left/right side of a card to move on the same line."
                    : "Top of the chart, then people who report to them."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {canEdit ? (
              <button
                type="button"
                onClick={() => setListOpen((open) => !open)}
                aria-expanded={listOpen}
                aria-controls="unassigned-staff-panel"
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
                  listOpen
                    ? "border-[var(--venue-primary,#6B7B3A)] bg-[var(--venue-primary,#6B7B3A)]/10 text-[#3D421F]"
                    : "border-black/10 bg-white text-black/60 hover:bg-black/5 hover:text-[#3D421F]",
                )}
              >
                <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="hidden sm:inline">Not on the chart</span>
                <span className="tabular-nums">{notOnChartCount}</span>
              </button>
              ) : null}
              <button
                type="button"
                onClick={toggleLabeledBranches}
                disabled={labeledBranchIds.length === 0}
                aria-pressed={labeledBranchesCollapsed}
                title={
                  labeledBranchesCollapsed
                    ? "Expand labeled departments"
                    : "Collapse labeled departments"
                }
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
                  labeledBranchesCollapsed
                    ? "border-[var(--venue-primary,#6B7B3A)] bg-[var(--venue-primary,#6B7B3A)]/10 text-[#3D421F]"
                    : "border-black/10 bg-white text-black/60 hover:bg-black/5 hover:text-[#3D421F]",
                  "disabled:cursor-not-allowed disabled:opacity-40",
                )}
              >
                {labeledBranchesCollapsed ? (
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
                ) : (
                  <ChevronsDownUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
                )}
                <span className="hidden sm:inline">
                  {labeledBranchesCollapsed ? "Expand labels" : "Collapse labels"}
                </span>
              </button>
              {management ? (
              <button
                type="button"
                onClick={() => setShowSalary((open) => !open)}
                aria-pressed={showSalary}
                aria-label={
                  showSalary
                    ? "Hide salary details in AED"
                    : "Show salary details in AED"
                }
                title={
                  showSalary
                    ? "Hide salary details"
                    : "Show salary details"
                }
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
                  showSalary
                    ? "border-[var(--venue-primary,#6B7B3A)] bg-[var(--venue-primary,#6B7B3A)]/10 text-[#3D421F]"
                    : "border-black/10 bg-white text-black/60 hover:bg-black/5 hover:text-[#3D421F]",
                )}
              >
                {showSalary ? (
                  <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
                )}
                <span>AED</span>
              </button>
              ) : null}
              <div
                role="group"
                aria-label="Reporting tree zoom"
                className="flex items-center rounded-md border border-black/10 bg-white"
              >
              <button
                type="button"
                onClick={() =>
                  applyTreeZoom(
                    treeZoomRef.current -
                      zoomStepFrom(treeZoomRef.current, -1),
                  )
                }
                disabled={treeZoom <= zoomMin}
                aria-label="Zoom out"
                className="flex h-8 w-8 items-center justify-center rounded-l-md text-black/60 transition-colors hover:bg-black/5 hover:text-[#3D421F] disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Minus className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => applyTreeZoom(TREE_ZOOM_DEFAULT)}
                disabled={treeZoom === TREE_ZOOM_DEFAULT}
                aria-label="Reset zoom to 50 percent"
                className="h-8 w-12 border-x border-black/10 text-center text-xs tabular-nums text-black/60 hover:bg-black/5 hover:text-[#3D421F] disabled:hover:bg-transparent disabled:hover:text-black/60"
              >
                {treeZoom}%
              </button>
              <button
                type="button"
                onClick={() =>
                  applyTreeZoom(
                    treeZoomRef.current + zoomStepFrom(treeZoomRef.current, 1),
                  )
                }
                disabled={treeZoom >= TREE_ZOOM_MAX}
                aria-label="Zoom in"
                className="flex h-8 w-8 items-center justify-center rounded-r-md text-black/60 transition-colors hover:bg-black/5 hover:text-[#3D421F] disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
              </button>
              </div>
              <button
                type="button"
                onClick={() => setFullWindow((open) => !open)}
                aria-label={
                  fullWindow
                    ? "Exit full window"
                    : "Open chart in full window"
                }
                aria-pressed={fullWindow}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md border text-black/60 transition-colors",
                  fullWindow
                    ? "border-[var(--venue-primary,#6B7B3A)] bg-[var(--venue-primary,#6B7B3A)]/10 text-[#3D421F]"
                    : "border-black/10 bg-white hover:bg-black/5 hover:text-[#3D421F]",
                )}
              >
                {fullWindow ? (
                  <Minimize2 className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>
            </div>
          </div>
          <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={treeScrollRef}
            tabIndex={0}
            className={cn(
              "min-h-0 flex-1 overflow-auto p-4 md:p-6 outline-none",
              canvasPan && "select-none",
              canvasPan && (panning ? "cursor-grabbing" : "cursor-grab"),
              roots.length === 0 &&
                dropTarget === "root" &&
                "bg-[var(--venue-primary,#6B7B3A)]/8",
            )}
            onKeyDown={(event) => {
              if (!event.ctrlKey && !event.metaKey) return;
              if (event.key === "=" || event.key === "+") {
                event.preventDefault();
                applyTreeZoom(
                  treeZoomRef.current + zoomStepFrom(treeZoomRef.current, 1),
                );
              } else if (event.key === "-" || event.key === "_") {
                event.preventDefault();
                applyTreeZoom(
                  treeZoomRef.current - zoomStepFrom(treeZoomRef.current, -1),
                );
              } else if (event.key === "0") {
                event.preventDefault();
                applyTreeZoom(TREE_ZOOM_DEFAULT);
              }
            }}
            onDragOver={(event) => {
              if (roots.length > 0) return;
              allowDrop(event, "root", { kind: "root" });
            }}
            onDragLeave={() =>
              setDropTarget((current) => (current === "root" ? null : current))
            }
            onDrop={(event) => {
              if (roots.length > 0) return;
              dropOn(event, { kind: "root" });
            }}
          >
            <div
              className="relative mx-auto"
              style={
                treeSized
                  ? {
                      width: treeNatural.w * treeScale,
                      height: treeNatural.h * treeScale,
                    }
                  : undefined
              }
            >
              <div
                ref={treeContentRef}
                className={cn("w-max", treeSized && "absolute")}
                style={{
                  transform: `scale(${treeScale})`,
                  transformOrigin: "top left",
                  left: treeSized ? treeNatural.ox * treeScale : undefined,
                  top: treeSized ? treeNatural.oy * treeScale : undefined,
                }}
              >
            {canEdit && roots.length === 0 ? (
              <button
                type="button"
                onClick={() => clickPlace({ kind: "root" })}
                disabled={!selectedId}
                onDragOver={(event) => {
                  event.stopPropagation();
                  allowDrop(event, "root", { kind: "root" });
                }}
                onDrop={(event) => {
                  event.stopPropagation();
                  dropOn(event, { kind: "root" });
                }}
                className={cn(
                  "mx-auto mb-6 flex w-full max-w-md items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-3 text-sm transition",
                  placing
                    ? "border-[var(--venue-primary,#6B7B3A)] bg-white text-[#3D421F]"
                    : "border-black/20 bg-white/50 text-black/40",
                  selectedId && "hover:bg-[var(--venue-primary,#6B7B3A)]/8",
                )}
              >
                <Plus className="h-4 w-4" strokeWidth={2} />
                Add at top of the chart
              </button>
            ) : null}

            {roots.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-black/15 bg-white/60 px-6 py-12 text-center">
                <Users className="h-8 w-8 text-black/30" strokeWidth={1.5} />
                <p className="mt-3 font-serif text-lg text-[#3D421F]">
                  No one at the top yet
                </p>
                <p className="mt-1 max-w-sm text-sm text-black/50">
                  {canEdit
                    ? "Start with the people at the top of the venue, then hang reports under them."
                    : "The reporting tree has not been built yet."}
                </p>
              </div>
            ) : (
              <ul
                className={cn(
                  "dir-org-tree",
                  management && "dir-org-tree-management",
                  management && showSalary && "dir-org-tree-show-pay",
                )}
              >
                {roots.map((node) => (
                  <HierarchyBranch
                    key={node.staffId}
                    node={node}
                    staff={staff}
                    byId={byId}
                    canEdit={canEdit}
                    placing={placing}
                    selectedId={selectedId}
                    dropTarget={dropTarget}
                    draggingStaffId={draggingId}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onAllowDrop={allowDrop}
                    onDrop={dropOn}
                    onPlace={clickPlace}
                    onAssignPerson={place}
                    onRemove={remove}
                    onSaveLabel={saveLabel}
                    onHighlight={saveHighlight}
                    onRemoveCollab={dropCollab}
                    onSelectHire={(staffId) =>
                      setSelectedId((current) =>
                        current === staffId ? null : staffId,
                      )
                    }
                    onAddHire={addHireUnder}
                    collapsedIds={collapsedIds}
                    onToggleCollapsed={toggleCollapsed}
                    canPlace={(staffId, target) =>
                      canPlaceStaff(roots, staffId, target)
                    }
                    assignedIds={assigned}
                    reserveLabel={rowHasLabel(roots)}
                    reserveEmphasis={rowHasEmphasis(roots)}
                    management={management}
                    showSalary={showSalary}
                    payByStaffId={payByStaffId}
                    positions={positions}
                    onSaveHire={saveHire}
                  />
                ))}
              </ul>
            )}
              </div>
            </div>
          </div>
        {canEdit && listOpen ? (
          <aside
            id="unassigned-staff-panel"
            className="absolute left-3 right-3 top-3 z-30 flex max-h-[min(60%,28rem)] min-h-0 flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl sm:right-auto sm:bottom-3 sm:w-80 sm:max-h-none"
          >
            <div className="shrink-0 border-b border-black/10 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-serif text-xl text-[#3D421F]">
                    Not on the chart
                  </h2>
                  <p className="mt-0.5 text-xs text-black/45">
                    {notOnChartCount} of {staff.length} people
                    {unassigned.length !== notOnChartCount
                      ? ` · showing ${unassigned.length}`
                      : null}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setListOpen(false)}
                  aria-label="Hide unassigned people"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-black/45 transition-colors hover:bg-black/5 hover:text-[#3D421F]"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <label className="relative mt-3 block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search unassigned…"
                  className="h-10 w-full rounded-md border border-black/10 bg-white pl-9 pr-3 text-sm outline-none focus:border-[var(--venue-primary,#6B7B3A)]"
                />
              </label>
              <label className="mt-2 block">
                <span className="sr-only">Filter by department</span>
                <select
                  value={department}
                  onChange={(event) => setDepartment(event.target.value)}
                  aria-label="Filter by department"
                  className="h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary,#6B7B3A)]"
                >
                  <option value="">All departments</option>
                  {departments.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                  {hasUnassignedDepartment ? (
                    <option value={NO_DEPARTMENT}>No department</option>
                  ) : null}
                </select>
              </label>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {unassigned.length === 0 ? (
                <p className="px-1 py-6 text-center text-sm text-black/45">
                  {staff.length === 0
                    ? "No directory staff to place."
                    : query.trim() || department
                      ? "No unassigned people match that filter."
                      : "Everyone is on the chart."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {unassigned.map((member) => (
                    <li key={member.id}>
                      <button
                        type="button"
                        draggable={canEdit}
                        onDragStart={(event) => onDragStart(event, member.id)}
                        onDragEnd={onDragEnd}
                        onClick={() =>
                          canEdit
                            ? setSelectedId((current) =>
                                current === member.id ? null : member.id,
                              )
                            : undefined
                        }
                        className={cn(
                          "flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition",
                          selectedId === member.id
                            ? "border-[var(--venue-primary,#6B7B3A)] bg-[var(--venue-primary,#6B7B3A)]/10"
                            : "border-black/10 bg-white hover:border-[var(--venue-primary,#6B7B3A)]/40 hover:bg-[var(--venue-secondary,#F0F3DD)]/50",
                          canEdit
                            ? "cursor-grab active:cursor-grabbing"
                            : "cursor-default",
                        )}
                      >
                        <StaffAvatar member={member} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[#3D421F]">
                            {member.fullName}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-black/45">
                            {member.positionName?.trim() || "—"}
                            {member.departmentName
                              ? ` · ${member.departmentName}`
                              : ""}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        ) : null}
          </div>
        </section>
      </div>,
      )}
    </div>
  );
}

function rowHasLabel(nodes: HierarchyNode[]) {
  return nodes.some((node) => Boolean(node.label?.trim()));
}

function rowHasEmphasis(nodes: HierarchyNode[]) {
  return nodes.some((node) => node.highlighted);
}

/** Left/right edges = same-line reorder; center = hang as a report. */
function cardDropTargetFromPoint(
  staffId: string,
  clientX: number,
  rect: DOMRect,
): HierarchyDropTarget {
  const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5;
  if (ratio < 0.3) {
    return { kind: "sibling", siblingId: staffId, where: "before" };
  }
  if (ratio > 0.7) {
    return { kind: "sibling", siblingId: staffId, where: "after" };
  }
  return { kind: "parent", parentId: staffId };
}

function dropTargetKey(target: HierarchyDropTarget): string {
  if (target.kind === "root") return "root";
  if (target.kind === "parent") return `parent:${target.parentId}`;
  if (target.kind === "above") return `above:${target.staffId}`;
  if (target.kind === "collab") {
    return `collab:${target.hostId}:${target.side}`;
  }
  return `${target.where}:${target.siblingId}`;
}

type PickerMode = "collab" | "before" | "after";

function HierarchyLabelBadge({
  label,
  management,
  showSalary,
  salaryTotal,
  canEdit,
  onEdit,
  onRemove,
}: {
  label: string;
  management: boolean;
  showSalary: boolean;
  salaryTotal: number | null;
  canEdit: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const payVisible = management && showSalary;
  const badge = (
    <p
      className={cn(
        "dir-org-label-badge",
        payVisible && "dir-org-label-badge-pay",
        canEdit && "cursor-context-menu",
      )}
      onPointerDown={(event) => {
        if (canEdit) event.stopPropagation();
      }}
    >
      <span>{label}</span>
      {payVisible ? (
        <span className="dir-org-label-total">{formatAed(salaryTotal)}</span>
      ) : null}
    </p>
  );

  if (!canEdit) {
    return <div className="dir-org-label">{badge}</div>;
  }

  return (
    <RightClickMenu
      className="dir-org-label"
      ariaLabel={`Actions for ${label}`}
      menuClassName="min-w-44"
      renderMenu={(close) => (
        <>
          <button
            type="button"
            role="menuitem"
            className={rightClickMenuItemClass}
            onClick={() => {
              onEdit();
              close();
            }}
          >
            <Pencil className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            Edit name
          </button>
          <button
            type="button"
            role="menuitem"
            className={rightClickMenuItemClass}
            onClick={() => {
              onRemove();
              close();
            }}
          >
            <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            Remove label
          </button>
        </>
      )}
    >
      {badge}
    </RightClickMenu>
  );
}

function HierarchyBranch({
  node,
  staff,
  byId,
  canEdit,
  placing,
  selectedId,
  draggingStaffId,
  dropTarget,
  reserveLabel,
  reserveEmphasis,
  assignedIds,
  canPlace,
  onDragStart,
  onDragEnd,
  onAllowDrop,
  onDrop,
  onPlace,
  onAssignPerson,
  onRemove,
  onSaveLabel,
  onHighlight,
  onRemoveCollab,
  onSelectHire,
  onAddHire,
  collapsedIds,
  onToggleCollapsed,
  management,
  showSalary,
  payByStaffId,
  positions,
  onSaveHire,
}: {
  node: HierarchyNode;
  staff: DirectoryStaffMember[];
  byId: Map<string, DirectoryStaffMember>;
  canEdit: boolean;
  placing: boolean;
  selectedId: string | null;
  draggingStaffId: string | null;
  dropTarget: string | null;
  reserveLabel: boolean;
  reserveEmphasis: boolean;
  assignedIds: Set<string>;
  canPlace: (staffId: string, target: HierarchyDropTarget) => boolean;
  onDragStart: (event: DragEvent, staffId: string) => void;
  onDragEnd: () => void;
  onAllowDrop: (
    event: DragEvent,
    key: string,
    target: HierarchyDropTarget,
  ) => void;
  onDrop: (event: DragEvent, target: HierarchyDropTarget) => void;
  onPlace: (target: HierarchyDropTarget) => void;
  onAssignPerson: (staffId: string, target: HierarchyDropTarget) => void;
  onRemove: (staffId: string, mode: "level" | "chart") => void;
  onSaveLabel: (staffId: string, label: string | null) => void;
  onHighlight: (staffId: string, highlighted: boolean) => void;
  onRemoveCollab: (hostId: string, staffId: string) => void;
  onSelectHire: (staffId: string) => void;
  onAddHire: (parentId: string) => void;
  collapsedIds: Set<string>;
  onToggleCollapsed: (staffId: string) => void;
  management: boolean;
  showSalary: boolean;
  payByStaffId: Record<string, DirectoryStaffPay>;
  positions: DirectoryPositionOption[];
  onSaveHire: (
    staffId: string,
    details: {
      hirePositionId?: string | null;
      hireBudgetedSalary?: number | null;
      hirePositionName?: string | null;
    },
  ) => void;
}) {
  const isHire = isHireId(node.staffId);
  const member = byId.get(node.staffId);
  const [labelDraft, setLabelDraft] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerAnchor, setPickerAnchor] = useState<{
    left: number;
    top: number;
    right: number;
    bottom: number;
  } | null>(null);
  const skipLabelBlur = useRef(false);
  const cardAnchorRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  useKeepCanvasPanOffCard(cardAnchorRef, canEdit);

  function openPicker(mode: PickerMode) {
    setPickerQuery("");
    const rect = cardAnchorRef.current?.getBoundingClientRect();
    setPickerAnchor(
      rect
        ? {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          }
        : { left: 24, top: 88, right: 160, bottom: 200 },
    );
    setPickerMode(mode);
  }

  function closePicker() {
    setPickerMode(null);
    setPickerAnchor(null);
  }
  const parentTarget = {
    kind: "parent" as const,
    parentId: node.staffId,
  };
  const dropKey = `parent:${node.staffId}`;
  const beforeKey = `before:${node.staffId}`;
  const afterKey = `after:${node.staffId}`;
  const isParentDrop = dropTarget === dropKey;
  const isBeforeDrop = dropTarget === beforeKey;
  const isAfterDrop = dropTarget === afterKey;
  const isDragging = draggingStaffId === node.staffId;
  const canAddReport = Boolean(
    (selectedId && selectedId !== node.staffId) ||
      (placing && !selectedId),
  );
  const hasBranch = node.children.length > 0;
  const branchCollapsed = collapsedIds.has(node.staffId);
  const showChildren = hasBranch && !branchCollapsed;
  // Sibling edge slots only — never invent "+ Report" ghost children; those
  // scramble branch lines. Click/drop on the card to hang a report.
  const showSlots = canEdit && placing && !isDragging;
  const emphasized = Boolean(node.highlighted);
  const collabs = node.collabs ?? [];
  const leftCollabs = collabs.filter((collab) => collab.side === "left");
  const rightCollabs = collabs.filter((collab) => collab.side === "right");
  const takenCollabIds = new Set(collabs.map((collab) => collab.staffId));
  const pickerTarget: HierarchyDropTarget | null =
    pickerMode === "collab"
      ? { kind: "collab", hostId: node.staffId, side: "right" }
      : pickerMode === "before"
        ? { kind: "above", staffId: node.staffId }
        : pickerMode === "after"
          ? { kind: "sibling", siblingId: node.staffId, where: "after" }
          : null;
  const pickerPeople = staff
    .filter((person) => {
      if (!pickerTarget) return false;
      if (pickerMode === "collab") {
        if (person.id === node.staffId || takenCollabIds.has(person.id)) {
          return false;
        }
      } else if (!canPlace(person.id, pickerTarget)) {
        return false;
      }
      const q = pickerQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        person.fullName.toLowerCase().includes(q) ||
        person.departmentName?.toLowerCase().includes(q) ||
        person.positionName?.toLowerCase().includes(q) ||
        person.empNo.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const aOn = assignedIds.has(a.id) ? 1 : 0;
      const bOn = assignedIds.has(b.id) ? 1 : 0;
      if (aOn !== bOn) return aOn - bOn;
      return a.fullName.localeCompare(b.fullName);
    });

  function beginEditLabel() {
    setLabelDraft(node.label ?? member?.departmentName ?? "");
  }

  function commitLabel() {
    if (skipLabelBlur.current) {
      skipLabelBlur.current = false;
      return;
    }
    if (labelDraft == null) return;
    onSaveLabel(node.staffId, labelDraft);
    setLabelDraft(null);
  }

  useLayoutEffect(() => {
    if (!pickerMode || !pickerAnchor || !pickerRef.current) return;
    const panel = pickerRef.current.getBoundingClientRect();
    const pad = 8;
    const gap = 8;
    let left = pickerAnchor.right + gap;
    if (left + panel.width > window.innerWidth - pad) {
      left = pickerAnchor.left - panel.width - gap;
    }
    left = Math.min(
      Math.max(pad, left),
      Math.max(pad, window.innerWidth - panel.width - pad),
    );
    let top = pickerAnchor.top;
    if (top + panel.height > window.innerHeight - pad) {
      top = window.innerHeight - panel.height - pad;
    }
    top = Math.max(pad, top);
    pickerRef.current.style.left = `${left}px`;
    pickerRef.current.style.top = `${top}px`;
  }, [pickerMode, pickerAnchor, pickerPeople.length, pickerQuery]);

  useEffect(() => {
    if (!pickerMode) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePicker();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", closePicker);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", closePicker);
    };
  }, [pickerMode]);

  const card = (
    <div
      ref={cardAnchorRef}
      className={cn(
        "dir-org-node relative flex select-none flex-col items-center rounded-2xl border text-center",
        isHire && "dir-org-node-hire",
        emphasized
          ? "dir-org-node-emphasis w-44 px-3 py-4 shadow-md"
          : "w-40 bg-white px-2.5 py-3 shadow-sm",
        isParentDrop
          ? "border-[var(--venue-primary,#6B7B3A)] bg-[var(--venue-primary,#6B7B3A)]/10"
          : isHire
            ? "border-[var(--venue-primary,#6B7B3A)]/40 bg-[color-mix(in_srgb,var(--venue-primary,#6B7B3A)_7%,white)]"
            : emphasized
              ? "border-[#9A9A94]"
              : "border-black/10",
        isBeforeDrop &&
          "border-l-[3px] border-l-[var(--venue-primary,#6B7B3A)]",
        isAfterDrop &&
          "border-r-[3px] border-r-[var(--venue-primary,#6B7B3A)]",
        canEdit && !canAddReport && "cursor-grab active:cursor-grabbing",
        canAddReport &&
          "cursor-pointer ring-2 ring-[var(--venue-primary,#6B7B3A)]/25 hover:bg-[var(--venue-primary,#6B7B3A)]/10 hover:ring-[var(--venue-primary,#6B7B3A)]/50",
        selectedId === node.staffId &&
          isHire &&
          "ring-2 ring-[var(--venue-primary,#6B7B3A)]/50",
        isDragging && "opacity-40",
      )}
      data-org-staff-id={node.staffId}
      draggable={canEdit && !canAddReport}
      onDragStart={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("[data-hire-field]")
        ) {
          event.preventDefault();
          return;
        }
        onDragStart(event, node.staffId);
      }}
      onDragEnd={onDragEnd}
      onClick={() => {
        if (canAddReport) {
          onPlace(parentTarget);
          return;
        }
        if (canEdit && isHire) onSelectHire(node.staffId);
      }}
      onDragOver={(event) => {
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        const target = cardDropTargetFromPoint(
          node.staffId,
          event.clientX,
          rect,
        );
        onAllowDrop(event, dropTargetKey(target), target);
      }}
      onDrop={(event) => {
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        const target = cardDropTargetFromPoint(
          node.staffId,
          event.clientX,
          rect,
        );
        onDrop(event, target);
      }}
    >
      {isHire ? (
        <HireCardBody
          node={node}
          positions={positions}
          canEdit={canEdit}
          management={management}
          showSalary={showSalary}
          emphasized={emphasized}
          onSaveHire={onSaveHire}
        />
      ) : (
        <>
          {member ? (
            <StaffAvatar
              member={member}
              size={emphasized ? "lg" : "sm"}
              preview
              emphasized={emphasized}
            />
          ) : (
            <div
              className={cn(
                "flex shrink-0 items-center justify-center rounded-2xl bg-black/10 text-xs text-black/40",
                emphasized ? "h-28 w-36" : "h-24 w-32",
              )}
            >
              ?
            </div>
          )}
          <p
            className={cn(
              "mt-2 w-full truncate font-medium leading-tight",
              emphasized
                ? "text-base text-[#3D421F]"
                : "text-sm text-[#3D421F]",
            )}
          >
            {firstLastName(member?.fullName) || "Unknown"}
          </p>
          <p
            className={cn(
              "mt-0.5 w-full truncate leading-tight",
              emphasized
                ? "text-xs text-black/50"
                : "text-[11px] text-black/45",
            )}
          >
            {member?.positionName?.trim() || "—"}
          </p>
          {management ? (
            <StaffCardPay
              member={member}
              pay={payByStaffId[node.staffId]}
              showSalary={showSalary}
            />
          ) : null}
        </>
      )}
      {hasBranch ? (
        <button
          type="button"
          draggable={false}
          aria-expanded={!branchCollapsed}
          aria-label={
            branchCollapsed
              ? `Show ${node.children.length} reports under ${firstLastName(member?.fullName) || "this person"}`
              : `Hide reports under ${firstLastName(member?.fullName) || "this person"}`
          }
          title={branchCollapsed ? "Show branch" : "Hide branch"}
          className={cn(
            "absolute bottom-1 right-1 z-10 flex h-5 w-5 items-center justify-center rounded-md",
            "text-black/30 transition-colors hover:bg-black/5 hover:text-[#3D421F]",
            branchCollapsed && "text-[var(--venue-primary,#6B7B3A)]",
          )}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleCollapsed(node.staffId);
          }}
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              branchCollapsed && "-rotate-90",
            )}
            strokeWidth={2}
            aria-hidden
          />
        </button>
      ) : null}
    </div>
  );

  const wrappedCard = canEdit ? (
    <RightClickMenu
      className="inline-flex"
      ariaLabel={`Actions for ${isHire ? "this hiring card" : member?.fullName ?? "this person"}`}
      menuClassName="min-w-56"
      renderMenu={(close) => (
        <>
          <button
            type="button"
            role="menuitem"
            className={rightClickMenuItemClass}
            onClick={() => {
              openPicker("before");
              close();
            }}
          >
            <ArrowLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            Add before
          </button>
          <button
            type="button"
            role="menuitem"
            className={rightClickMenuItemClass}
            onClick={() => {
              openPicker("after");
              close();
            }}
          >
            <ArrowRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            Add after
          </button>
          {isHire || !management ? null : (
            <button
              type="button"
              role="menuitem"
              className={rightClickMenuItemClass}
              onClick={() => {
                onAddHire(node.staffId);
                close();
              }}
            >
              <UserPlus className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Add hiring
            </button>
          )}
          {isHire ? null : (
            <>
              <button
                type="button"
                role="menuitem"
                className={rightClickMenuItemClass}
                onClick={() => {
                  onHighlight(node.staffId, !emphasized);
                  close();
                }}
              >
                <Highlighter className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                {emphasized ? "Remove highlight" : "Highlight employee"}
              </button>
              <button
                type="button"
                role="menuitem"
                className={rightClickMenuItemClass}
                onClick={() => {
                  beginEditLabel();
                  close();
                }}
              >
                <Tag className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                {node.label ? "Edit label" : "Add label above"}
              </button>
              {node.label ? (
                <button
                  type="button"
                  role="menuitem"
                  className={rightClickMenuItemClass}
                  onClick={() => {
                    onSaveLabel(node.staffId, null);
                    close();
                  }}
                >
                  <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                  Remove label
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className={rightClickMenuItemClass}
                onClick={() => {
                  openPicker("collab");
                  close();
                }}
              >
                <Link2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                Add side collab
              </button>
            </>
          )}
          <div className="my-1 h-px bg-black/8" role="separator" />
          {isHire ? null : (
            <button
              type="button"
              role="menuitem"
              className={rightClickMenuItemClass}
              onClick={() => {
                onRemove(node.staffId, "level");
                close();
              }}
            >
              <UserMinus className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Remove this level
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className={rightClickMenuItemClass}
            onClick={() => {
              onRemove(node.staffId, "chart");
              close();
            }}
          >
            <UserX className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            {isHire ? "Remove hiring card" : "Remove from chart"}
          </button>
        </>
      )}
    >
      {card}
    </RightClickMenu>
  ) : (
    card
  );

  const branchProps = {
    staff,
    byId,
    canEdit,
    placing,
    selectedId,
    draggingStaffId,
    dropTarget,
    assignedIds,
    canPlace,
    onDragStart,
    onDragEnd,
    onAllowDrop,
    onDrop,
    onPlace,
    onAssignPerson,
    onRemove,
    onSaveLabel,
    onHighlight,
    onRemoveCollab,
    onSelectHire,
    onAddHire,
    collapsedIds,
    onToggleCollapsed,
    management,
    showSalary,
    payByStaffId,
    positions,
    onSaveHire,
  };

  return (
    <li
      className={cn(
        reserveLabel && "dir-org-row-labels",
        reserveEmphasis && "dir-org-row-emphasis",
        !showChildren && "dir-org-leaf",
      )}
    >
      <div className="dir-org-person">
        {leftCollabs.length > 0 ? (
          <div className="dir-org-collabs dir-org-collabs-left">
            {leftCollabs.map((collab) => (
              <CollabChip
                key={collab.staffId}
                hostId={node.staffId}
                staffId={collab.staffId}
                member={byId.get(collab.staffId)}
                canEdit={canEdit}
                onRemove={onRemoveCollab}
                management={management}
                showSalary={showSalary}
                pay={payByStaffId[collab.staffId]}
              />
            ))}
            <span className="dir-org-collab-line" aria-hidden />
          </div>
        ) : null}

        <div className="dir-org-card-stack">
          {labelDraft != null ? (
            <form
              className="dir-org-label"
              onSubmit={(event) => {
                event.preventDefault();
                commitLabel();
              }}
            >
              <Input
                autoFocus
                value={labelDraft}
                maxLength={HIERARCHY_LABEL_MAX}
                placeholder="Department name"
                aria-label="Chart label"
                className="h-9 border-[var(--venue-primary,#6B7B3A)] bg-white text-center text-sm font-semibold"
                onChange={(event) => setLabelDraft(event.target.value)}
                onBlur={commitLabel}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    skipLabelBlur.current = true;
                    setLabelDraft(null);
                  }
                }}
              />
            </form>
          ) : node.label ? (
            <HierarchyLabelBadge
              label={node.label}
              management={management}
              showSalary={showSalary}
              salaryTotal={subtreeSalaryTotal(node, payByStaffId)}
              canEdit={canEdit}
              onEdit={beginEditLabel}
              onRemove={() => onSaveLabel(node.staffId, null)}
            />
          ) : null}

          <div className="relative inline-flex">
            {showSlots ? (
              <SiblingDropSlot
                where="before"
                active={dropTarget === beforeKey}
                onDragOver={(event) => {
                  event.stopPropagation();
                  onAllowDrop(event, beforeKey, {
                    kind: "sibling",
                    siblingId: node.staffId,
                    where: "before",
                  });
                }}
                onDrop={(event) => {
                  event.stopPropagation();
                  onDrop(event, {
                    kind: "sibling",
                    siblingId: node.staffId,
                    where: "before",
                  });
                }}
                onClick={() =>
                  onPlace({
                    kind: "sibling",
                    siblingId: node.staffId,
                    where: "before",
                  })
                }
              />
            ) : null}
            {wrappedCard}
            {showSlots ? (
              <SiblingDropSlot
                where="after"
                active={dropTarget === afterKey}
                onDragOver={(event) => {
                  event.stopPropagation();
                  onAllowDrop(event, afterKey, {
                    kind: "sibling",
                    siblingId: node.staffId,
                    where: "after",
                  });
                }}
                onDrop={(event) => {
                  event.stopPropagation();
                  onDrop(event, {
                    kind: "sibling",
                    siblingId: node.staffId,
                    where: "after",
                  });
                }}
                onClick={() =>
                  onPlace({
                    kind: "sibling",
                    siblingId: node.staffId,
                    where: "after",
                  })
                }
              />
            ) : null}
          </div>

          {pickerMode && pickerAnchor && typeof document !== "undefined"
            ? createPortal(
                <>
                  <div
                    className="fixed inset-0 z-[400]"
                    aria-hidden
                    onClick={closePicker}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      closePicker();
                    }}
                  />
                  <div
                    ref={pickerRef}
                    role="dialog"
                    aria-label={
                      pickerMode === "before"
                        ? "Add before — this person takes this level"
                        : pickerMode === "after"
                          ? "Add after"
                          : "Side collab"
                    }
                    style={{
                      position: "fixed",
                      top: pickerAnchor.top,
                      left: pickerAnchor.right + 8,
                    }}
                    className="z-[401] w-80 rounded-xl border border-black/10 bg-white p-2.5 shadow-xl"
                  >
                    <div className="flex items-start justify-between gap-2 px-1 pb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#3D421F]">
                          {pickerMode === "before"
                            ? "Add before"
                            : pickerMode === "after"
                              ? "Add after"
                              : "Side collab"}
                        </p>
                        {pickerMode === "before" ? (
                          <p className="mt-0.5 text-[11px] leading-snug text-black/45">
                            They take this level. This person and their team
                            move down.
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        aria-label="Close search"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-black/45 hover:bg-black/5 hover:text-[#3D421F]"
                        onClick={closePicker}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <label className="relative block">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
                      <Input
                        autoFocus
                        value={pickerQuery}
                        placeholder="Search people…"
                        className="h-9 pl-9 text-sm"
                        onChange={(event) => setPickerQuery(event.target.value)}
                      />
                    </label>
                    <ul className="mt-2 max-h-64 overflow-auto">
                      {pickerPeople.length === 0 ? (
                        <li className="px-2 py-3 text-center text-sm text-black/40">
                          No matching people
                        </li>
                      ) : (
                        pickerPeople.slice(0, 20).map((person) => (
                          <li key={person.id}>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-black/5"
                              onClick={() => {
                                if (!pickerTarget) return;
                                onAssignPerson(person.id, pickerTarget);
                                closePicker();
                              }}
                            >
                              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#3D421F]">
                                {firstLastName(person.fullName)}
                              </span>
                              <span className="max-w-[42%] truncate text-xs text-black/40">
                                {assignedIds.has(person.id)
                                  ? person.positionName ||
                                    person.departmentName ||
                                    person.empNo
                                  : "Not on chart"}
                              </span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                    {pickerMode === "collab" ? (
                      <p className="px-1 pt-1 text-xs text-black/40">
                        Lands on the right of this person.
                      </p>
                    ) : (
                      <p className="px-1 pt-1 text-xs text-black/40">
                        People not on the chart are listed first.
                      </p>
                    )}
                  </div>
                </>,
                document.body,
              )
            : null}
        </div>

        {rightCollabs.length > 0 ? (
          <div className="dir-org-collabs dir-org-collabs-right">
            <span className="dir-org-collab-line" aria-hidden />
            {rightCollabs.map((collab) => (
              <CollabChip
                key={collab.staffId}
                hostId={node.staffId}
                staffId={collab.staffId}
                member={byId.get(collab.staffId)}
                canEdit={canEdit}
                onRemove={onRemoveCollab}
                management={management}
                showSalary={showSalary}
                pay={payByStaffId[collab.staffId]}
              />
            ))}
          </div>
        ) : null}
      </div>

      {showChildren ? (
        <ul>
          {node.children.map((child) => (
            <HierarchyBranch
              key={child.staffId}
              node={child}
              reserveLabel={rowHasLabel(node.children)}
              reserveEmphasis={rowHasEmphasis(node.children)}
              {...branchProps}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function HireCardBody({
  node,
  positions,
  canEdit,
  management,
  showSalary,
  emphasized,
  onSaveHire,
}: {
  node: HierarchyNode;
  positions: DirectoryPositionOption[];
  canEdit: boolean;
  management: boolean;
  showSalary: boolean;
  emphasized: boolean;
  onSaveHire: (
    staffId: string,
    details: {
      hirePositionId?: string | null;
      hireBudgetedSalary?: number | null;
      hirePositionName?: string | null;
    },
  ) => void;
}) {
  const [salaryDraft, setSalaryDraft] = useState(
    salaryDraftValue(node.hireBudgetedSalary),
  );

  useEffect(() => {
    setSalaryDraft(salaryDraftValue(node.hireBudgetedSalary));
  }, [node.hireBudgetedSalary, node.staffId]);

  const options = useMemo(() => {
    const list = positions.map((position) => ({
      value: position.id,
      label: position.name,
      searchText: position.departmentName ?? undefined,
    }));
    if (
      node.hirePositionId &&
      !list.some((option) => option.value === node.hirePositionId)
    ) {
      list.unshift({
        value: node.hirePositionId,
        label: node.hirePositionName || "Position",
        searchText: undefined,
      });
    }
    return list;
  }, [node.hirePositionId, node.hirePositionName, positions]);

  function commitSalary() {
    const next = parseSalaryInput(salaryDraft);
    if (next === "invalid") {
      setSalaryDraft(salaryDraftValue(node.hireBudgetedSalary));
      return;
    }
    setSalaryDraft(salaryDraftValue(next));
    if (next === node.hireBudgetedSalary) return;
    onSaveHire(node.staffId, { hireBudgetedSalary: next });
  }

  function onPosition(id: string) {
    const position = positions.find((item) => item.id === id);
    const typical = position?.typicalPayable ?? null;
    setSalaryDraft(salaryDraftValue(typical));
    onSaveHire(node.staffId, {
      hirePositionId: id || null,
      hirePositionName: position?.name ?? null,
      hireBudgetedSalary: typical,
    });
  }

  const editable = canEdit && management;
  const positionLabel = node.hirePositionName?.trim() || "Open position";

  return (
    <>
      <div
        className={cn(
          "dir-org-photo flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-dashed border-[var(--venue-primary,#6B7B3A)]/40 bg-white/80 text-[var(--venue-primary,#6B7B3A)]",
          emphasized ? "h-28 w-36" : "h-24 w-32",
        )}
      >
        <UserPlus className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        <span className="text-[10px] font-semibold tracking-[0.14em]">
          HIRE
        </span>
      </div>
      <p
        className={cn(
          "mt-2 w-full truncate font-medium leading-tight text-[#3D421F]",
          emphasized ? "text-base" : "text-sm",
        )}
      >
        Hiring
      </p>
      {editable ? (
        <div
          data-hire-field
          className="mt-0.5 h-[14px] w-full overflow-hidden leading-tight"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <SearchableSelect
            value={node.hirePositionId ?? ""}
            onChange={onPosition}
            options={options}
            placeholder="Choose position"
            searchPlaceholder="Search positions…"
            aria-label="Hiring position"
            className="h-[14px]"
            triggerClassName="h-[14px] min-h-0 justify-center gap-0.5 overflow-hidden border-0 bg-transparent px-0 py-0 text-center text-[11px] leading-[14px] text-black/45 shadow-none ring-0 focus:border-transparent focus:ring-0 [&>span]:min-w-0 [&>span]:flex-none [&>span]:truncate [&>span]:text-center [&_svg]:h-3 [&_svg]:w-3"
            clearable={false}
          />
        </div>
      ) : (
        <p
          className={cn(
            "mt-0.5 w-full truncate leading-tight",
            emphasized ? "text-xs text-black/50" : "text-[11px] text-black/45",
          )}
        >
          {positionLabel}
        </p>
      )}
      {management && showSalary ? (
        editable ? (
          <div
            data-hire-field
            className="mt-1 flex w-full min-w-0 items-center justify-center gap-1 leading-none"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className="shrink-0 font-mono text-[10px] leading-none text-black/40">
              HIRE
            </span>
            <input
              inputMode="decimal"
              value={salaryDraft}
              placeholder="Budget"
              aria-label="Budgeted salary"
              className="min-w-0 w-[4.75rem] border-0 bg-transparent p-0 text-[10px] tabular-nums leading-none text-[#3D421F] outline-none placeholder:text-black/30"
              onChange={(event) => setSalaryDraft(event.target.value)}
              onBlur={commitSalary}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
          </div>
        ) : (
          <div className="mt-1 flex w-full min-w-0 items-center justify-center gap-1 leading-none">
            <span className="shrink-0 font-mono text-[10px] leading-none text-black/40">
              HIRE
            </span>
            <span className="truncate text-[10px] tabular-nums leading-none text-[#3D421F]">
              {formatAed(node.hireBudgetedSalary)}
            </span>
          </div>
        )
      ) : null}
    </>
  );
}

function CollabChip({
  hostId,
  staffId,
  member,
  canEdit,
  onRemove,
  management,
  showSalary,
  pay,
}: {
  hostId: string;
  staffId: string;
  member: DirectoryStaffMember | undefined;
  canEdit: boolean;
  onRemove: (hostId: string, staffId: string) => void;
  management: boolean;
  showSalary: boolean;
  pay: DirectoryStaffPay | undefined;
}) {
  return (
    <div
      className="dir-org-node relative flex min-h-[8.5rem] w-40 select-none flex-col items-center rounded-2xl border border-dashed border-black/10 bg-white px-2.5 py-3 text-center shadow-sm"
    >
      {canEdit ? (
        <button
          type="button"
          aria-label={`Remove ${firstLastName(member?.fullName) || "collab"}`}
          className="absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-black/10 bg-white text-black/45 hover:text-[#3D421F]"
          onClick={(event) => {
            event.stopPropagation();
            onRemove(hostId, staffId);
          }}
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
      {member ? (
        <StaffAvatar member={member} size="sm" preview />
      ) : (
        <div className="flex h-24 w-32 items-center justify-center rounded-2xl bg-black/10 text-xs text-black/40">
          ?
        </div>
      )}
      <p className="mt-2 w-full truncate font-medium leading-tight text-sm text-[#3D421F]">
        {firstLastName(member?.fullName) || "Unknown"}
      </p>
      <p className="mt-0.5 w-full truncate leading-tight text-[11px] text-black/45">
        {member?.positionName?.trim() || "—"}
      </p>
      {management ? (
        <StaffCardPay member={member} pay={pay} showSalary={showSalary} />
      ) : null}
    </div>
  );
}

function StaffCardPay({
  member,
  pay,
  showSalary,
}: {
  member: DirectoryStaffMember | undefined;
  pay: DirectoryStaffPay | undefined;
  showSalary: boolean;
}) {
  return (
    <div
      className="mt-1 flex w-full min-w-0 items-center justify-center gap-1 leading-none"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {member?.empNo ? (
        <StaffDirectoryLink
          staffId={member.id}
          empNo={member.empNo}
          link={!member.orgChartOnly}
          className="shrink-0 text-[10px] leading-none"
        />
      ) : (
        <span className="shrink-0 font-mono text-[10px] leading-none text-black/40">
          —
        </span>
      )}
      {showSalary ? (
        <span className="flex min-w-0 items-center gap-0.5 text-[10px] tabular-nums leading-none text-[#3D421F]">
          <span className="truncate">{formatAed(pay?.salaryToPay)}</span>
          {pay?.inAccommodation ? (
            <span
              title="Company accommodation"
              className="inline-flex shrink-0"
            >
              <House
                className="h-2.5 w-2.5 text-[var(--venue-primary,#6B7B3A)]"
                strokeWidth={2}
                aria-hidden
              />
              <span className="sr-only">Company accommodation</span>
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

function SiblingDropSlot({
  where,
  active,
  onDragOver,
  onDrop,
  onClick,
}: {
  where: "before" | "after";
  active: boolean;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={where === "before" ? "Place before" : "Place after"}
      className={cn(
        "absolute top-0 bottom-0 z-20 w-8",
        where === "before" ? "-left-4" : "-right-4",
        active
          ? "bg-[var(--venue-primary,#6B7B3A)]/35"
          : "bg-transparent hover:bg-[var(--venue-primary,#6B7B3A)]/20",
      )}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onClick}
    />
  );
}

function StaffAvatar({
  member,
  size = "md",
  preview = false,
  emphasized = false,
}: {
  member: DirectoryStaffMember;
  size?: "sm" | "md" | "lg";
  preview?: boolean;
  emphasized?: boolean;
}) {
  const box =
    size === "lg" ? "h-28 w-36" : size === "sm" ? "h-24 w-32" : "h-16 w-24";
  const frame = emphasized
    ? "border-[1.5px] border-white"
    : "border border-black/10";

  const media = member.photoUrl ? (
    <div
      className={cn(
        "dir-org-photo relative shrink-0 overflow-hidden rounded-2xl",
        frame,
        box,
      )}
    >
      <Image
        src={member.photoUrl}
        alt=""
        fill
        draggable={false}
        className="pointer-events-none object-cover"
        unoptimized
      />
    </div>
  ) : (
    <div
      className={cn(
        "dir-org-photo flex shrink-0 items-center justify-center rounded-2xl bg-[#3D421F] text-sm font-medium text-white",
        frame,
        box,
      )}
    >
      <PhotoPlaceholderMark className="h-[26%] w-[26%]" tone="bright" />
    </div>
  );

  if (!preview) return media;

  return (
    <StaffPhotoPreview
      fullName={member.fullName}
      photoUrl={member.photoUrl}
      details={staffPhotoDetailsFromDirectoryMember(member)}
    >
      {({ openPreview, isOpen }) => (
        <div
          role="button"
          tabIndex={0}
          className={cn(
            "rounded-2xl p-0 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--venue-primary,#818a40)]/50",
            isOpen && "invisible",
          )}
          aria-label={
            member.photoUrl
              ? `Enlarge photo of ${member.fullName}`
              : `View profile details for ${member.fullName}`
          }
          onClick={openPreview}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.currentTarget.click();
          }}
        >
          {media}
        </div>
      )}
    </StaffPhotoPreview>
  );
}
