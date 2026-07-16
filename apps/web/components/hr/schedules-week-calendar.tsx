"use client";

import {
  Fragment,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Eraser, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { RosterLabelsDialog } from "@/components/hr/roster-labels-dialog";
import { SchedulesWeekNav } from "@/components/hr/schedules-week-nav";
import { WorkingStatusBadge } from "@/components/hr/working-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUnsavedChangesGuard } from "@/components/use-unsaved-changes-guard";
import {
  addWeekSection,
  deleteWeekSection,
  loadSchedulesWeekAttendance,
  loadSchedulesWeekData,
  listWeekSections,
  moveStaffToSection,
  renameWeekSection,
  reorderWeekSections,
  saveScheduleDayChanges,
} from "@/lib/actions/hr";
import {
  buildRosterAttendanceMap,
  cellValuesEqual,
  formatAttendanceRange,
  formatShiftRangeLabel,
  getScheduleDayLabel,
  getShiftTemplate,
  getMondayForWeekOffset,
  getWeekDayColumns,
  formatWeekRangeLabel,
  scheduleCellKey,
  scheduleDayLabelStyle,
  type ScheduleAttendanceCell,
  type ScheduleCellValue,
  type ScheduleDayLabel,
  type ScheduleDepartmentKey,
  type ScheduleStaffRow,
  type ScheduleWeekSection,
  type ShiftTemplate,
} from "@/lib/hr/schedules";
import {
  clearCachedScheduleSectionsAfter,
  getCachedScheduleDaysForStaff,
  getCachedScheduleSections,
  mergeCachedScheduleDays,
  patchCachedScheduleDays,
  scheduleSectionsCacheKey,
  scheduleWeekDaysCacheKey,
  setCachedScheduleSections,
} from "@/lib/hr/schedules-client-cache";
import { cn } from "@/lib/utils";

type SchedulesWeekCalendarProps = {
  departmentLabel: string;
  staff: ScheduleStaffRow[];
  labels: ScheduleDayLabel[];
  shiftTemplates: ShiftTemplate[];
  /** Map of YYYY-MM-DD → holiday name for purple column highlight. */
  publicHolidayByDate?: ReadonlyMap<string, string>;
  canEdit?: boolean;
  /** Flat roster list, or group staff under weekly section bands. */
  layout?: "flat" | "sections";
  departmentKey?: ScheduleDepartmentKey;
  /** Shared week offset from parent (keeps week when switching departments). */
  weekOffset?: number;
  onWeekOffsetChange?: (offset: number) => void;
  /**
   * Staff IDs to fetch for the week (defaults to `staff`).
   * Pass every department’s IDs so one request warms the shared week cache.
   */
  loadStaffIds?: string[];
  /**
   * All on-board staff used to load fingerprint attendance (defaults to `staff`).
   * Pass every department so punch times are not limited to the active tab.
   */
  attendanceStaff?: ScheduleStaffRow[];
  /** Lets the parent guard department/tab switches while drafts are open. */
  onRegisterUnsavedGuard?: (
    guardAction: ((action: () => void) => void) | null,
  ) => void;
  /** Hide built-in week controls when the parent renders them elsewhere. */
  hideWeekNavigation?: boolean;
};

type SelectedCell = {
  key: string;
  staffId: string;
  dateKey: string;
};

/** Draft value for a cell; `null` means clear the day on save. */
type DraftMap = Record<string, ScheduleCellValue | null>;

type DragLabelPayload = {
  key: string;
  staffId: string;
  dateKey: string;
  labelCode: string;
  shiftTemplateId: string | null;
};

const DRAG_MIME = "application/x-ss-ops-schedule-label";
const STAFF_DRAG_MIME = "application/x-ss-ops-section-staff";
const SECTION_DRAG_MIME = "application/x-ss-ops-section-reorder";
const UNASSIGNED_SECTION_ID = "__unassigned__";

type DragStaffPayload = {
  staffId: string;
  fromSectionId: string | null;
};

type DragSectionPayload = {
  sectionId: string;
};

function reconcileDraft(
  drafts: DraftMap,
  saved: Record<string, ScheduleCellValue>,
  key: string,
  value: ScheduleCellValue | null,
): DraftMap {
  const next = { ...drafts };
  const savedValue = saved[key] ?? null;
  if (cellValuesEqual(value, savedValue)) delete next[key];
  else next[key] = value;
  return next;
}

function cellPresentation(
  labels: ScheduleDayLabel[],
  shiftTemplates: ShiftTemplate[],
  value: ScheduleCellValue | null,
) {
  if (!value) return null;

  if (value.labelCode === "SHIFT" && value.shiftTemplateId) {
    const template = getShiftTemplate(shiftTemplates, value.shiftTemplateId);
    if (template) {
      return {
        abbreviation: template.abbreviation,
        name: `${template.name} (${formatShiftRangeLabel(template.startTime, template.endTime)})`,
        style: scheduleDayLabelStyle(template),
      };
    }
  }

  const label = getScheduleDayLabel(labels, value.labelCode);
  if (!label) return null;
  return {
    abbreviation: label.abbreviation,
    name: label.name,
    style: scheduleDayLabelStyle(label),
  };
}

function cellActualPunchLine(
  attendance: ScheduleAttendanceCell | null,
): string | null {
  if (!attendance) return null;
  return formatAttendanceRange(attendance.clockIn, attendance.clockOut);
}

function formatCoverageDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return isoDate.slice(0, 10);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${d} ${months[m - 1] ?? ""} ${y}`;
}

function attendanceHintForWeek(
  fromDate: string,
  rangeLabel: string,
  coverage: { minWorkDate: string | null; maxWorkDate: string | null },
  weekTotals: { dayCount: number; punchCount: number },
): string {
  const { minWorkDate, maxWorkDate } = coverage;
  if (weekTotals.dayCount > 0 || weekTotals.punchCount > 0) {
    return `Fingerprint records exist for the week of ${rangeLabel} (${weekTotals.dayCount} work days, ${weekTotals.punchCount} punches) but none match the staff shown on this roster. Check employee IDs (ORL####) on Attendance → Records.`;
  }
  if (!maxWorkDate) {
    return "No fingerprint data imported yet. Export InOutData from the device and import under Settings → Data Management → Attendance.";
  }
  if (fromDate > maxWorkDate) {
    return `No punch data for the week of ${rangeLabel} has been imported yet (last import runs through ${formatCoverageDate(maxWorkDate)}). Export a fresh InOutData file from the fingerprint device — include dates through this week — then import under Settings → Data Management → Attendance.`;
  }
  if (minWorkDate && maxWorkDate) {
    return `No punch times for the week of ${rangeLabel}. Imported records cover ${formatCoverageDate(minWorkDate)}–${formatCoverageDate(maxWorkDate)}.`;
  }
  return `No punch times for the week of ${rangeLabel}.`;
}

const SHOW_PUNCH_TIMES_STORAGE_KEY = "hr-schedules-show-punch-times";

export function SchedulesWeekCalendar({
  departmentLabel,
  staff,
  labels,
  shiftTemplates = [],
  publicHolidayByDate,
  canEdit = false,
  layout = "flat",
  departmentKey,
  weekOffset: weekOffsetProp,
  onWeekOffsetChange,
  loadStaffIds,
  attendanceStaff: attendanceStaffProp,
  onRegisterUnsavedGuard,
  hideWeekNavigation = false,
}: SchedulesWeekCalendarProps) {
  const sectionsMode = layout === "sections" && Boolean(departmentKey);
  const [weekOffsetState, setWeekOffsetState] = useState(0);
  const weekOffset = weekOffsetProp ?? weekOffsetState;
  function setWeekOffset(next: number | ((current: number) => number)) {
    const value =
      typeof next === "function" ? next(weekOffset) : next;
    onWeekOffsetChange?.(value);
    if (weekOffsetProp === undefined) setWeekOffsetState(value);
  }
  const saveDraftsRef = useRef<() => Promise<boolean>>(async () => true);
  const [saved, setSaved] = useState<Record<string, ScheduleCellValue>>({});
  const [attendance, setAttendance] = useState<
    Record<string, ScheduleAttendanceCell>
  >({});
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceHint, setAttendanceHint] = useState<string | null>(null);
  const [showPunchTimes, setShowPunchTimes] = useState(true);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [labelsDialogOpen, setLabelsDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Map<string, SelectedCell>>(
    () => new Map(),
  );
  const [isPainting, setIsPainting] = useState(false);
  const [paintMode, setPaintMode] = useState<"add" | "remove">("add");
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const suppressClickRef = useRef(false);
  const loadGenRef = useRef(0);
  const [, startTransition] = useTransition();

  const [sections, setSections] = useState<ScheduleWeekSection[]>([]);
  const [sectionDropId, setSectionDropId] = useState<string | null>(null);
  const [sectionReorderTarget, setSectionReorderTarget] = useState<{
    sectionId: string;
    edge: "before" | "after";
  } | null>(null);
  const [staffReorderTarget, setStaffReorderTarget] = useState<{
    staffId: string;
    sectionId: string | null;
    edge: "before" | "after";
  } | null>(null);
  const [draggingStaffId, setDraggingStaffId] = useState<string | null>(null);
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(
    null,
  );
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editSectionName, setEditSectionName] = useState("");
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");

  const monday = useMemo(
    () => getMondayForWeekOffset(weekOffset),
    [weekOffset],
  );
  const days = useMemo(
    () => getWeekDayColumns(monday, publicHolidayByDate),
    [monday, publicHolidayByDate],
  );
  const weekDateKeys = useMemo(() => days.map((day) => day.key), [days]);
  const rangeLabel = formatWeekRangeLabel(monday);
  const fromDate = days[0]?.key ?? "";
  const toDate = days[6]?.key ?? "";
  const weekStart = fromDate;
  const displayStaffIdsKey = staff.map((s) => s.id).join(",");
  const staffEmpKey = useMemo(
    () => staff.map((member) => `${member.id}:${member.empNo}`).join("|"),
    [staff],
  );
  const fetchStaffIds = useMemo(() => {
    if (loadStaffIds && loadStaffIds.length > 0) return loadStaffIds;
    return staff.map((member) => member.id);
  }, [loadStaffIds, staff]);
  const attendanceStaff = attendanceStaffProp ?? staff;
  const attendanceStaffKey = useMemo(
    () =>
      attendanceStaff.map((member) => `${member.id}:${member.empNo}`).join("|"),
    [attendanceStaff],
  );
  const fetchStaffIdsKey = fetchStaffIds.join(",");
  const staffById = useMemo(() => {
    const map = new Map<string, ScheduleStaffRow>();
    for (const member of staff) map.set(member.id, member);
    return map;
  }, [staff]);
  const knownCodes = useMemo(
    () => new Set(labels.map((label) => label.code)),
    [labels],
  );
  const selectedCount = selected.size;
  const draftEntries = useMemo(() => Object.entries(drafts), [drafts]);
  const dirtyCount = draftEntries.length;
  const isDirty = canEdit && dirtyCount > 0;
  const { guardAction, unsavedDialog } = useUnsavedChangesGuard({
    isDirty,
    onSaveRef: saveDraftsRef,
  });

  useEffect(() => {
    if (!onRegisterUnsavedGuard) return;
    onRegisterUnsavedGuard(guardAction);
    return () => onRegisterUnsavedGuard(null);
  }, [guardAction, onRegisterUnsavedGuard]);

  const displayAssignments = useMemo(() => {
    const next: Record<string, ScheduleCellValue | null> = { ...saved };
    for (const [key, value] of draftEntries) {
      next[key] = value;
    }
    return next;
  }, [saved, draftEntries]);

  const selectedShiftCount = useMemo(() => {
    let count = 0;
    for (const cell of selected.values()) {
      const value = displayAssignments[cell.key] ?? null;
      if (value?.labelCode === "SHIFT") count += 1;
    }
    return count;
  }, [selected, displayAssignments]);

  const assignedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const section of sections) {
      for (const staffId of section.staffIds) ids.add(staffId);
    }
    return ids;
  }, [sections]);

  const unassignedStaff = useMemo(
    () => staff.filter((member) => !assignedIds.has(member.id)),
    [staff, assignedIds],
  );

  const loadSections = useEffectEvent(async () => {
    if (!sectionsMode || !departmentKey || !weekStart) {
      return;
    }

    const sectionsKey = scheduleSectionsCacheKey(departmentKey, weekStart);
    const cached = getCachedScheduleSections(sectionsKey);
    if (cached) {
      setSections(cached);
      return;
    }

    const result = await listWeekSections({
      departmentKey,
      weekStart,
    });
    if (result.error) {
      setError(result.error);
      setSections([]);
      return;
    }
    const next = result.sections ?? [];
    setCachedScheduleSections(sectionsKey, next);
    setSections(next);
  });

  const loadWeek = useEffectEvent(async () => {
    const gen = ++loadGenRef.current;
    const staffIds = fetchStaffIds;
    const displayIds = displayStaffIdsKey
      ? displayStaffIdsKey.split(",").filter(Boolean)
      : [];
    const weekKey = scheduleWeekDaysCacheKey(fromDate, toDate);
    const sectionsKey =
      sectionsMode && departmentKey && weekStart
        ? scheduleSectionsCacheKey(departmentKey, weekStart)
        : null;

    try {
      const cachedDays = getCachedScheduleDaysForStaff(weekKey, displayIds);
      if (cachedDays) {
        setSaved(cachedDays);
        setLoading(false);
      }

      if (sectionsKey) {
        const cachedSections = getCachedScheduleSections(sectionsKey);
        if (cachedSections) setSections(cachedSections);
      }

      if (!fromDate || !toDate) {
        setSaved({});
        setLoading(false);
        return;
      }

      if (displayIds.length === 0) {
        setSaved({});
        setLoading(false);
        if (sectionsKey && !getCachedScheduleSections(sectionsKey)) {
          await loadSections();
        }
        return;
      }

      const needDays = !getCachedScheduleDaysForStaff(weekKey, staffIds);
      const needSections = Boolean(
        sectionsKey && !getCachedScheduleSections(sectionsKey),
      );

      if (!needDays && !needSections) {
        const fresh = getCachedScheduleDaysForStaff(weekKey, displayIds);
        if (fresh) setSaved(fresh);
        setLoading(false);
        return;
      }

      if (needDays && !cachedDays) setLoading(true);

      function cellsFromDays(
        days: {
          staff_id: string;
          work_date: string;
          label_code: string;
          shift_template_id: string | null;
        }[],
      ) {
        const next: Record<string, ScheduleCellValue> = {};
        for (const day of days) {
          if (!knownCodes.has(day.label_code) && day.label_code !== "LP") continue;
          const code = day.label_code === "LP" ? "AL" : day.label_code;
          if (!knownCodes.has(code)) continue;
          next[scheduleCellKey(day.staff_id, day.work_date)] = {
            labelCode: code,
            shiftTemplateId:
              code === "SHIFT" ? (day.shift_template_id ?? null) : null,
          };
        }
        return next;
      }

      if (needDays && needSections) {
        const result = await loadSchedulesWeekData({
          staffIds,
          fromDate,
          toDate,
          departmentKey,
          weekStart,
          includeSections: true,
        });

        if (gen !== loadGenRef.current) return;

        if (result.error) {
          setError(result.error);
          setLoading(false);
          return;
        }

        const next = cellsFromDays(result.days ?? []);
        mergeCachedScheduleDays(weekKey, staffIds, next);
        setSaved(getCachedScheduleDaysForStaff(weekKey, displayIds) ?? next);

        const nextSections = result.sections ?? [];
        if (sectionsKey) setCachedScheduleSections(sectionsKey, nextSections);
        setSections(nextSections);
        setLoading(false);
        return;
      }

      if (needDays) {
        const result = await loadSchedulesWeekData({
          staffIds,
          fromDate,
          toDate,
          includeSections: false,
        });

        if (gen !== loadGenRef.current) return;

        if (result.error) {
          setError(result.error);
          setLoading(false);
          return;
        }

        const next = cellsFromDays(result.days ?? []);
        mergeCachedScheduleDays(weekKey, staffIds, next);
        setSaved(getCachedScheduleDaysForStaff(weekKey, displayIds) ?? next);
        setLoading(false);
      } else {
        const fresh = getCachedScheduleDaysForStaff(weekKey, displayIds);
        if (fresh) setSaved(fresh);
        setLoading(false);
      }

      if (needSections) {
        await loadSections();
      }
    } finally {
      /* attendance loaded in dedicated effect */
    }
  });

  useEffect(() => {
    try {
      if (localStorage.getItem(SHOW_PUNCH_TIMES_STORAGE_KEY) === "0") {
        setShowPunchTimes(false);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAttendanceForWeek() {
      if (!fromDate || !toDate || staff.length === 0) {
        if (!cancelled) {
          setAttendance({});
          setAttendanceHint(null);
          setAttendanceLoading(false);
        }
        return;
      }

      setAttendanceLoading(true);
      const result = await loadSchedulesWeekAttendance({
        staffIds: attendanceStaff.map((member) => member.id),
        empNos: attendanceStaff.map((member) => member.empNo),
        fromDate,
        toDate,
      });

      if (cancelled) return;

      if (result.error) {
        setAttendance({});
        setAttendanceHint(
          "Could not load punch times for this week. Try refreshing the page.",
        );
        setAttendanceLoading(false);
        return;
      }

      const map = buildRosterAttendanceMap(
        {
          days: result.days ?? [],
          punches: result.punches ?? [],
        },
        staff,
        weekDateKeys,
        result.timezone,
        result.overnightCutoffTime ?? "05:00",
      );
      setAttendance(map);
      setAttendanceLoading(false);

      if (Object.keys(map).length === 0) {
        setAttendanceHint(
          attendanceHintForWeek(
            fromDate,
            rangeLabel,
            result.coverage ?? {
              minWorkDate: null,
              maxWorkDate: null,
            },
            result.weekTotals ?? { dayCount: 0, punchCount: 0 },
          ),
        );
      } else {
        setAttendanceHint(null);
      }
    }

    void loadAttendanceForWeek();
    return () => {
      cancelled = true;
    };
  }, [
    fromDate,
    toDate,
    staffEmpKey,
    attendanceStaffKey,
    rangeLabel,
    staff,
    attendanceStaff,
    weekDateKeys,
  ]);

  useEffect(() => {
    void loadWeek();
  }, [
    fromDate,
    toDate,
    fetchStaffIdsKey,
    displayStaffIdsKey,
    knownCodes,
    sectionsMode,
    departmentKey,
    weekStart,
  ]);

  // Keep the shared sections cache in sync after local edits.
  useEffect(() => {
    if (!departmentKey || !weekStart) return;
    if (sections.length === 0) return;
    setCachedScheduleSections(
      scheduleSectionsCacheKey(departmentKey, weekStart),
      sections,
    );
  }, [sections, departmentKey, weekStart]);

  useEffect(() => {
    setSelected(new Map());
    setDrafts({});
    setDraggingKey(null);
    setDropTargetKey(null);
    setSectionDropId(null);
    setSectionReorderTarget(null);
    setStaffReorderTarget(null);
    setDraggingStaffId(null);
    setDraggingSectionId(null);
    setEditingSectionId(null);
    setAddingSection(false);
    setNewSectionName("");

    if (departmentKey && weekStart) {
      const cached = getCachedScheduleSections(
        scheduleSectionsCacheKey(departmentKey, weekStart),
      );
      setSections(cached ?? []);
    } else {
      setSections([]);
    }
  }, [weekOffset, departmentLabel, departmentKey, weekStart]);

  useEffect(() => {
    function stopPaint() {
      setIsPainting(false);
    }
    window.addEventListener("mouseup", stopPaint);
    window.addEventListener("blur", stopPaint);
    return () => {
      window.removeEventListener("mouseup", stopPaint);
      window.removeEventListener("blur", stopPaint);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (labelsDialogOpen) return;
      setSelected(new Map());
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [labelsDialogOpen]);

  function paintCell(staffId: string, dateKey: string, mode: "add" | "remove") {
    const key = scheduleCellKey(staffId, dateKey);
    setSelected((current) => {
      const next = new Map(current);
      if (mode === "remove") next.delete(key);
      else next.set(key, { key, staffId, dateKey });
      return next;
    });
  }

  function toggleCell(staffId: string, dateKey: string) {
    const key = scheduleCellKey(staffId, dateKey);
    const removing = selected.has(key);
    setPaintMode(removing ? "remove" : "add");
    setIsPainting(true);
    paintCell(staffId, dateKey, removing ? "remove" : "add");
  }

  function toggleSelectOnly(staffId: string, dateKey: string) {
    const key = scheduleCellKey(staffId, dateKey);
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(key)) next.delete(key);
      else next.set(key, { key, staffId, dateKey });
      return next;
    });
  }

  /** Stage a label/shift on the current selection only (no DB write). */
  function stageValue(value: ScheduleCellValue | null) {
    if (!canEdit || selectedCount === 0) return;

    setDrafts((current) => {
      let next = current;
      for (const cell of selected.values()) {
        next = reconcileDraft(next, saved, cell.key, value);
      }
      return next;
    });
    setSelected(new Map());
    setError(null);
  }

  function stageLabel(labelCode: string | null) {
    if (labelCode === null) {
      stageValue(null);
      return;
    }
    stageValue({ labelCode, shiftTemplateId: null });
  }

  /**
   * Apply a shift time to selected SHIFT days only (multi-select).
   * Non-SHIFT cells in the selection are left unchanged.
   */
  function applyShiftTime(templateId: string) {
    if (!canEdit || selectedShiftCount === 0) return;

    setDrafts((current) => {
      let next = current;
      for (const cell of selected.values()) {
        const existing = displayAssignments[cell.key] ?? null;
        if (existing?.labelCode !== "SHIFT") continue;
        next = reconcileDraft(next, saved, cell.key, {
          labelCode: "SHIFT",
          shiftTemplateId: templateId,
        });
      }
      return next;
    });
    setSelected(new Map());
    setError(null);
  }

  /** Clear the timed shift back to plain SHIFT on selected shift days. */
  function clearShiftTimes() {
    if (!canEdit || selectedShiftCount === 0) return;

    setDrafts((current) => {
      let next = current;
      for (const cell of selected.values()) {
        const existing = displayAssignments[cell.key] ?? null;
        if (existing?.labelCode !== "SHIFT") continue;
        next = reconcileDraft(next, saved, cell.key, {
          labelCode: "SHIFT",
          shiftTemplateId: null,
        });
      }
      return next;
    });
    setSelected(new Map());
    setError(null);
  }

  /** Stage clearing every day this week for one staff member (no DB write). */
  function stageClearWeek(staffId: string) {
    if (!canEdit) return;

    setDrafts((current) => {
      let next = current;
      for (const day of days) {
        const key = scheduleCellKey(staffId, day.key);
        next = reconcileDraft(next, saved, key, null);
      }
      return next;
    });
    setSelected((current) => {
      const next = new Map(current);
      for (const day of days) {
        next.delete(scheduleCellKey(staffId, day.key));
      }
      return next;
    });
    setError(null);
  }

  /** Move a label from one day cell to another (draft only). */
  function stageMoveLabel(
    from: DragLabelPayload,
    toStaffId: string,
    toDateKey: string,
  ) {
    const toKey = scheduleCellKey(toStaffId, toDateKey);
    if (from.key === toKey) return;

    const movingValue: ScheduleCellValue = {
      labelCode: from.labelCode,
      shiftTemplateId: from.shiftTemplateId,
    };
    const targetValue = displayAssignments[toKey] ?? null;

    setDrafts((current) => {
      let next = reconcileDraft(current, saved, toKey, movingValue);
      // Swap if the target already had a label; otherwise clear the source.
      next = reconcileDraft(next, saved, from.key, targetValue);
      return next;
    });
    setSelected(new Map());
    setError(null);
  }

  function discardDrafts() {
    setDrafts({});
    setError(null);
  }

  async function saveDrafts(): Promise<boolean> {
    if (!canEdit || dirtyCount === 0) return true;

    const changes = draftEntries.map(([key, value]) => {
      const [staffId, dateKey] = key.split(":");
      return {
        staffId,
        workDate: dateKey,
        labelCode: value?.labelCode ?? null,
        shiftTemplateId: value?.shiftTemplateId ?? null,
      };
    });
    const entriesSnapshot = draftEntries;

    setPending(true);
    setError(null);

    const result = await saveScheduleDayChanges({ changes });
    setPending(false);
    if (result.error) {
      setError(result.error);
      return false;
    }

    setSaved((current) => {
      const next = { ...current };
      const patch: Record<string, ScheduleCellValue | null> = {};
      for (const [key, value] of entriesSnapshot) {
        if (value) next[key] = value;
        else delete next[key];
        patch[key] = value;
      }
      patchCachedScheduleDays(
        scheduleWeekDaysCacheKey(fromDate, toDate),
        patch,
      );
      return next;
    });
    setDrafts({});
    setSelected(new Map());
    return true;
  }

  saveDraftsRef.current = saveDrafts;

  function applyLocalStaffPlacement(
    staffId: string,
    toSectionId: string | null,
    targetStaffId: string | null,
    edge: "before" | "after",
  ): string[] | null {
    let nextOrder: string[] | null = null;

    setSections((current) =>
      current.map((section) => {
        const without = section.staffIds.filter((id) => id !== staffId);
        if (!toSectionId || section.id !== toSectionId) {
          return { ...section, staffIds: without };
        }

        const ids = [...without];
        if (!targetStaffId) {
          ids.push(staffId);
        } else {
          let idx = ids.indexOf(targetStaffId);
          if (idx < 0) {
            ids.push(staffId);
          } else {
            if (edge === "after") idx += 1;
            ids.splice(idx, 0, staffId);
          }
        }
        nextOrder = ids;
        return { ...section, staffIds: ids };
      }),
    );

    return nextOrder;
  }

  function onStaffSectionDrop(
    event: React.DragEvent,
    toSectionId: string | null,
  ) {
    if (!canEdit || !sectionsMode || !departmentKey || !weekStart || pending) {
      return;
    }

    const types = Array.from(event.dataTransfer.types);
    if (types.includes(SECTION_DRAG_MIME)) {
      // Handled by onSectionReorderDrop
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setSectionDropId(null);
    setSectionReorderTarget(null);
    setStaffReorderTarget(null);
    setDraggingStaffId(null);

    let payload: DragStaffPayload | null = null;
    try {
      const raw =
        event.dataTransfer.getData(STAFF_DRAG_MIME) ||
        event.dataTransfer.getData("text/plain");
      if (raw) payload = JSON.parse(raw) as DragStaffPayload;
    } catch {
      payload = null;
    }
    if (!payload?.staffId) return;

    // Dropping on a section header: same section → no-op (append would reorder unintentionally).
    if (payload.fromSectionId === toSectionId) return;

    const previous = sections;
    const orderedStaffIds = applyLocalStaffPlacement(
      payload.staffId,
      toSectionId,
      null,
      "after",
    );
    setError(null);

    startTransition(async () => {
      const result = await moveStaffToSection({
        departmentKey,
        weekStart,
        staffId: payload!.staffId,
        sectionId: toSectionId,
        orderedStaffIds: orderedStaffIds ?? undefined,
      });
      if (result.error) {
        setSections(previous);
        setError(result.error);
        return;
      }
      clearCachedScheduleSectionsAfter(departmentKey, weekStart);
    });
  }

  function onStaffReorderDrop(
    event: React.DragEvent,
    targetStaffId: string,
    targetSectionId: string | null,
    edge: "before" | "after",
  ) {
    if (!canEdit || !sectionsMode || !departmentKey || !weekStart || pending) {
      return;
    }

    const types = Array.from(event.dataTransfer.types);
    if (types.includes(SECTION_DRAG_MIME)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setSectionDropId(null);
    setSectionReorderTarget(null);
    setStaffReorderTarget(null);
    setDraggingStaffId(null);

    let payload: DragStaffPayload | null = null;
    try {
      const raw =
        event.dataTransfer.getData(STAFF_DRAG_MIME) ||
        event.dataTransfer.getData("text/plain");
      if (raw) payload = JSON.parse(raw) as DragStaffPayload;
    } catch {
      payload = null;
    }
    if (!payload?.staffId || payload.staffId === targetStaffId) return;

    // Unassigned has no persisted order — dropping on an unassigned row unassigns.
    if (targetSectionId === null) {
      if (payload.fromSectionId === null) return;
      const previous = sections;
      applyLocalStaffPlacement(payload.staffId, null, null, "after");
      setError(null);
      startTransition(async () => {
        const result = await moveStaffToSection({
          departmentKey,
          weekStart,
          staffId: payload!.staffId,
          sectionId: null,
        });
        if (result.error) {
          setSections(previous);
          setError(result.error);
          return;
        }
        clearCachedScheduleSectionsAfter(departmentKey, weekStart);
      });
      return;
    }

    const previous = sections;
    const orderedStaffIds = applyLocalStaffPlacement(
      payload.staffId,
      targetSectionId,
      targetStaffId,
      edge,
    );

    // No-op if order unchanged.
    const previousOrder =
      previous.find((section) => section.id === targetSectionId)?.staffIds ??
      [];
    if (
      orderedStaffIds &&
      orderedStaffIds.length === previousOrder.length &&
      orderedStaffIds.every((id, index) => id === previousOrder[index])
    ) {
      return;
    }

    setError(null);

    startTransition(async () => {
      const result = await moveStaffToSection({
        departmentKey,
        weekStart,
        staffId: payload!.staffId,
        sectionId: targetSectionId,
        orderedStaffIds: orderedStaffIds ?? undefined,
      });
      if (result.error) {
        setSections(previous);
        setError(result.error);
        return;
      }
      clearCachedScheduleSectionsAfter(departmentKey, weekStart);
    });
  }

  function onSectionReorderDrop(
    event: React.DragEvent,
    targetSectionId: string,
    edge: "before" | "after",
  ) {
    if (!canEdit || !sectionsMode || !departmentKey || !weekStart || pending) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setSectionDropId(null);
    setSectionReorderTarget(null);
    setStaffReorderTarget(null);
    setDraggingSectionId(null);

    let payload: DragSectionPayload | null = null;
    try {
      const raw =
        event.dataTransfer.getData(SECTION_DRAG_MIME) ||
        event.dataTransfer.getData("text/plain");
      if (raw) payload = JSON.parse(raw) as DragSectionPayload;
    } catch {
      payload = null;
    }
    if (!payload?.sectionId) return;
    if (payload.sectionId === targetSectionId) return;

    const previous = sections;
    const fromIdx = previous.findIndex(
      (section) => section.id === payload!.sectionId,
    );
    const toIdx = previous.findIndex(
      (section) => section.id === targetSectionId,
    );
    if (fromIdx < 0 || toIdx < 0) return;

    // Insert into the gap before/after the target — never swap/replace.
    let insertIdx = edge === "after" ? toIdx + 1 : toIdx;
    if (fromIdx < insertIdx) insertIdx -= 1;
    if (insertIdx === fromIdx) return;

    const next = [...previous];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(insertIdx, 0, moved);
    const ordered = next.map((section, index) => ({
      ...section,
      sortOrder: index + 1,
    }));
    setSections(ordered);
    setError(null);

    startTransition(async () => {
      const result = await reorderWeekSections({
        departmentKey,
        weekStart,
        orderedIds: ordered.map((section) => section.id),
      });
      if (result.error) {
        setSections(previous);
        setError(result.error);
        return;
      }
      clearCachedScheduleSectionsAfter(departmentKey, weekStart);
    });
  }

  function commitRenameSection() {
    if (!editingSectionId) return;
    const name = editSectionName.trim();
    const sectionId = editingSectionId;
    setEditingSectionId(null);
    if (!name) return;

    const previous = sections;
    setSections((current) =>
      current.map((section) =>
        section.id === sectionId ? { ...section, name } : section,
      ),
    );
    startTransition(async () => {
      const result = await renameWeekSection({ sectionId, name });
      if (result.error) {
        setSections(previous);
        setError(result.error);
        return;
      }
      if (departmentKey && weekStart) {
        clearCachedScheduleSectionsAfter(departmentKey, weekStart);
      }
    });
  }

  function commitAddSection() {
    if (!departmentKey || !weekStart) return;
    const name = newSectionName.trim();
    if (!name) {
      setAddingSection(false);
      return;
    }
    setAddingSection(false);
    setNewSectionName("");
    startTransition(async () => {
      const result = await addWeekSection({
        departmentKey,
        weekStart,
        name,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.section) {
        setSections((current) => [...current, result.section!]);
      }
      clearCachedScheduleSectionsAfter(departmentKey, weekStart);
    });
  }

  function removeSection(section: ScheduleWeekSection) {
    if (
      !window.confirm(
        `Delete "${section.name}"? Staff in this section move back to Unassigned.`,
      )
    ) {
      return;
    }
    const previous = sections;
    setSections((current) => current.filter((row) => row.id !== section.id));
    startTransition(async () => {
      const result = await deleteWeekSection({ sectionId: section.id });
      if (result.error) {
        setSections(previous);
        setError(result.error);
        return;
      }
      if (departmentKey && weekStart) {
        clearCachedScheduleSectionsAfter(departmentKey, weekStart);
      }
    });
  }

  function renderSectionHeaderRow(
    title: string,
    sectionId: string | null,
    count: number,
    section?: ScheduleWeekSection,
  ) {
    const dropId = sectionId ?? UNASSIGNED_SECTION_ID;
    const isStaffDropTarget =
      Boolean(draggingStaffId) && sectionDropId === dropId;
    const showBeforeGap =
      Boolean(section) &&
      sectionReorderTarget?.sectionId === section!.id &&
      sectionReorderTarget.edge === "before";
    const editing = section ? editingSectionId === section.id : false;
    const canDragSection = Boolean(canEdit && section && !pending);
    const dayColSpan = days.length;
    const colSpanTotal = canEdit ? dayColSpan + 2 : dayColSpan + 1;

    return (
      <Fragment key={`section:${dropId}`}>
        {showBeforeGap ? (
          <tr aria-hidden className="pointer-events-none">
            <td colSpan={colSpanTotal} className="h-0 p-0">
              <div className="h-0.5 bg-[var(--venue-primary)] shadow-[0_0_0_1px_var(--venue-primary)]" />
            </td>
          </tr>
        ) : null}
        <tr
          className={cn(
            "relative border-b border-black/10",
            isStaffDropTarget
              ? "bg-[var(--venue-primary)]/20"
              : "bg-[var(--venue-primary)]/8",
            draggingSectionId === sectionId && "opacity-40",
          )}
          onDragOver={(event) => {
            if (!canEdit || pending) return;
            const types = Array.from(event.dataTransfer.types);
            const draggingStaff = Boolean(draggingStaffId);
            const draggingSection =
              Boolean(draggingSectionId) && Boolean(section);
            if (
              !draggingStaff &&
              !draggingSection &&
              !types.includes(STAFF_DRAG_MIME) &&
              !types.includes(SECTION_DRAG_MIME)
            ) {
              return;
            }
            // Unassigned only accepts staff, not section reorder.
            if (
              !section &&
              (draggingSectionId || types.includes(SECTION_DRAG_MIME))
            ) {
              return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";

            if (
              section &&
              (draggingSectionId || types.includes(SECTION_DRAG_MIME))
            ) {
              // Don't target the section being dragged.
              if (draggingSectionId === section.id) {
                setSectionReorderTarget(null);
                setSectionDropId(null);
                return;
              }
              const rect = event.currentTarget.getBoundingClientRect();
              const edge: "before" | "after" =
                event.clientY < rect.top + rect.height / 2
                  ? "before"
                  : "after";
              setSectionDropId(null);
              setSectionReorderTarget((current) =>
                current?.sectionId === section.id && current.edge === edge
                  ? current
                  : { sectionId: section.id, edge },
              );
              return;
            }

            setSectionReorderTarget(null);
            setSectionDropId(dropId);
          }}
          onDragLeave={(event) => {
            const related = event.relatedTarget as Node | null;
            if (related && event.currentTarget.contains(related)) return;
            if (sectionDropId === dropId) setSectionDropId(null);
            if (section && sectionReorderTarget?.sectionId === section.id) {
              setSectionReorderTarget(null);
            }
          }}
          onDrop={(event) => {
            const types = Array.from(event.dataTransfer.types);
            if (
              section &&
              (types.includes(SECTION_DRAG_MIME) || draggingSectionId)
            ) {
              const edge =
                sectionReorderTarget?.sectionId === section.id
                  ? sectionReorderTarget.edge
                  : (() => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      return event.clientY < rect.top + rect.height / 2
                        ? "before"
                        : "after";
                    })();
              onSectionReorderDrop(event, section.id, edge);
              return;
            }
            onStaffSectionDrop(event, sectionId);
          }}
        >
          <th
            scope="row"
            className={cn(
              "sticky left-0 z-10 w-[240px] border-r border-black/10 px-2 py-1 text-left font-serif text-xs font-semibold uppercase tracking-wide text-[#3D421F] backdrop-blur-md",
              isStaffDropTarget
                ? "bg-[var(--venue-primary)]/25"
                : "bg-[var(--venue-secondary,#F0F3DD)]/90",
            )}
          >
            {editing && section ? (
              <Input
                autoFocus
                value={editSectionName}
                onChange={(event) => setEditSectionName(event.target.value)}
                className="h-7 border-black/15 bg-white text-xs text-[#3D421F] placeholder:text-black/40"
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitRenameSection();
                  if (event.key === "Escape") setEditingSectionId(null);
                }}
                onBlur={() => commitRenameSection()}
              />
            ) : (
              <span className="flex items-center gap-1 text-[#3D421F]">
                {canDragSection ? (
                  <span
                    draggable
                    onDragStart={(event) => {
                      const payload: DragSectionPayload = {
                        sectionId: section!.id,
                      };
                      event.dataTransfer.setData(
                        SECTION_DRAG_MIME,
                        JSON.stringify(payload),
                      );
                      event.dataTransfer.setData(
                        "text/plain",
                        JSON.stringify(payload),
                      );
                      event.dataTransfer.effectAllowed = "move";
                      setIsPainting(false);
                      setDraggingSectionId(section!.id);
                      setDraggingStaffId(null);
                      setSectionDropId(null);
                      setSectionReorderTarget(null);
                    }}
                    onDragEnd={() => {
                      setDraggingSectionId(null);
                      setSectionDropId(null);
                      setSectionReorderTarget(null);
                    }}
                    className="inline-flex h-5 w-4 shrink-0 cursor-grab items-center justify-center text-black/30 active:cursor-grabbing"
                    title="Drag to reorder section"
                    aria-label={`Drag to reorder ${title}`}
                  >
                    <GripVertical className="h-3.5 w-3.5" aria-hidden />
                  </span>
                ) : (
                  <span className="inline-flex h-5 w-4 shrink-0" aria-hidden />
                )}
                <span className="min-w-0 truncate">{title}</span>
                <span className="shrink-0 text-[10px] font-normal tabular-nums normal-case tracking-normal text-black/40">
                  {count}
                </span>
              </span>
            )}
          </th>
          <td
            colSpan={dayColSpan}
            className={cn(
              "border-l border-black/5 px-2 py-1 align-middle",
              isStaffDropTarget && "bg-[var(--venue-primary)]/10",
            )}
          />
          {canEdit ? (
            <td className="w-10 border-l border-black/5 p-0 align-middle">
              {section ? (
                <div className="flex items-center justify-center gap-0.5">
                  <button
                    type="button"
                    title="Rename section"
                    aria-label={`Rename ${section.name}`}
                    disabled={pending}
                    onClick={() => {
                      setEditingSectionId(section.id);
                      setEditSectionName(section.name);
                    }}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-black/40 hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-40"
                  >
                    <Pencil className="h-3 w-3" aria-hidden />
                  </button>
                  <button
                    type="button"
                    title="Delete section"
                    aria-label={`Delete ${section.name}`}
                    disabled={pending}
                    onClick={() => removeSection(section)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-black/40 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                  </button>
                </div>
              ) : null}
            </td>
          ) : null}
        </tr>
      </Fragment>
    );
  }

  function renderSectionAfterGap(sectionId: string) {
    if (
      sectionReorderTarget?.sectionId !== sectionId ||
      sectionReorderTarget.edge !== "after"
    ) {
      return null;
    }
    const colSpanTotal = canEdit ? days.length + 2 : days.length + 1;
    return (
      <tr key={`section-after:${sectionId}`} aria-hidden className="pointer-events-none">
        <td colSpan={colSpanTotal} className="h-0 p-0">
          <div className="h-0.5 bg-[var(--venue-primary)] shadow-[0_0_0_1px_var(--venue-primary)]" />
        </td>
      </tr>
    );
  }

  function renderStaffRow(
    member: ScheduleStaffRow,
    sectionId: string | null,
  ) {
    const canDragStaff = Boolean(canEdit && sectionsMode && !pending);
    const showBeforeGap =
      staffReorderTarget?.staffId === member.id &&
      staffReorderTarget.edge === "before";
    const showAfterGap =
      staffReorderTarget?.staffId === member.id &&
      staffReorderTarget.edge === "after";
    const colSpanTotal = canEdit ? days.length + 2 : days.length + 1;

    return (
      <Fragment key={member.id}>
        {showBeforeGap ? (
          <tr aria-hidden className="pointer-events-none">
            <td colSpan={colSpanTotal} className="h-0 p-0">
              <div className="h-0.5 bg-[var(--venue-primary)] shadow-[0_0_0_1px_var(--venue-primary)]" />
            </td>
          </tr>
        ) : null}
        <tr
          className={cn(
            "border-b border-black/5 last:border-b-0",
            draggingStaffId === member.id && "opacity-40",
          )}
          onDragOver={(event) => {
            if (!canEdit || pending) return;

            // While reordering sections, treat staff rows as "after this section"
            // so the insert gap stays visible between section blocks.
            if (draggingSectionId) {
              if (!sectionId || draggingSectionId === sectionId) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setSectionDropId(null);
              setStaffReorderTarget(null);
              setSectionReorderTarget((current) =>
                current?.sectionId === sectionId && current.edge === "after"
                  ? current
                  : { sectionId, edge: "after" },
              );
              return;
            }

            if (
              !draggingStaffId ||
              draggingStaffId === member.id
            ) {
              return;
            }

            // Unassigned rows: accept assigned staff to unassign (no order within Unassigned).
            if (sectionId === null) {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setStaffReorderTarget(null);
              setSectionReorderTarget(null);
              setSectionDropId(UNASSIGNED_SECTION_ID);
              return;
            }

            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            const rect = event.currentTarget.getBoundingClientRect();
            const edge: "before" | "after" =
              event.clientY < rect.top + rect.height / 2 ? "before" : "after";
            setSectionDropId(null);
            setSectionReorderTarget(null);
            setStaffReorderTarget((current) =>
              current?.staffId === member.id &&
              current.sectionId === sectionId &&
              current.edge === edge
                ? current
                : { staffId: member.id, sectionId, edge },
            );
          }}
          onDragLeave={(event) => {
            const related = event.relatedTarget as Node | null;
            if (related && event.currentTarget.contains(related)) return;
            if (staffReorderTarget?.staffId === member.id) {
              setStaffReorderTarget(null);
            }
          }}
          onDrop={(event) => {
            if (!canEdit || pending) return;
            const types = Array.from(event.dataTransfer.types);

            if (types.includes(SECTION_DRAG_MIME) || draggingSectionId) {
              if (!sectionId) return;
              onSectionReorderDrop(event, sectionId, "after");
              return;
            }

            if (types.includes(STAFF_DRAG_MIME) || draggingStaffId) {
              const edge =
                staffReorderTarget?.staffId === member.id
                  ? staffReorderTarget.edge
                  : (() => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      return event.clientY < rect.top + rect.height / 2
                        ? "before"
                        : "after";
                    })();
              onStaffReorderDrop(event, member.id, sectionId, edge);
            }
          }}
        >
        <th
          scope="row"
          className="sticky left-0 z-10 w-[240px] border-r border-black/10 bg-white/90 px-2 py-2.5 text-left font-medium text-[#3D421F] backdrop-blur-md"
        >
          <div className="flex items-start gap-1">
            {canDragStaff ? (
              <span
                draggable
                onDragStart={(event) => {
                  const payload: DragStaffPayload = {
                    staffId: member.id,
                    fromSectionId: sectionId,
                  };
                  event.dataTransfer.setData(
                    STAFF_DRAG_MIME,
                    JSON.stringify(payload),
                  );
                  event.dataTransfer.setData(
                    "text/plain",
                    JSON.stringify(payload),
                  );
                  event.dataTransfer.effectAllowed = "move";
                  setIsPainting(false);
                  setDraggingStaffId(member.id);
                  setDraggingSectionId(null);
                  setStaffReorderTarget(null);
                  setSectionReorderTarget(null);
                }}
                onDragEnd={() => {
                  setDraggingStaffId(null);
                  setSectionDropId(null);
                  setSectionReorderTarget(null);
                  setStaffReorderTarget(null);
                }}
                className="mt-0.5 inline-flex h-5 w-4 shrink-0 cursor-grab items-center justify-center text-black/30 active:cursor-grabbing"
                title="Drag to reorder within this section, or move to another"
                aria-label={`Drag ${member.fullName} to reorder or move`}
              >
                <GripVertical className="h-3.5 w-3.5" aria-hidden />
              </span>
            ) : sectionsMode ? (
              <span className="inline-flex h-5 w-4 shrink-0" aria-hidden />
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{member.fullName}</span>
                <WorkingStatusBadge status={member.workingStatus} />
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[11px] font-normal text-black/50">
                <span className="shrink-0 tabular-nums text-black/40">
                  {member.empNo}
                </span>
                <span className="text-black/25" aria-hidden>
                  ·
                </span>
                <span className="min-w-0 truncate">
                  {member.position ?? "—"}
                </span>
              </span>
            </span>
          </div>
        </th>
        {days.map((day) => {
          const key = scheduleCellKey(member.id, day.key);
          const value = displayAssignments[key] ?? null;
          const presentation = cellPresentation(
            labels,
            shiftTemplates,
            value,
          );
          const attendanceCell = attendance[key] ?? null;
          const punchLine = showPunchTimes
            ? cellActualPunchLine(attendanceCell)
            : null;
          const attendanceOnly = Boolean(!presentation && punchLine);
          const isSelected = selected.has(key);
          const isDraft = Object.prototype.hasOwnProperty.call(drafts, key);
          const isDropTarget = dropTargetKey === key;
          const isDragging = draggingKey === key;
          const canDragLabel = Boolean(canEdit && value && !pending);

          return (
            <td
              key={day.key}
              className={cn(
                "relative min-h-[3.25rem] w-[94px] border-l border-black/5 px-1 py-0.5 align-middle",
                day.isPublicHoliday
                  ? "bg-[#ede9fe]/45"
                  : day.isToday && "bg-[var(--venue-primary)]/5",
              )}
              onDragOver={(event) => {
                if (
                  !canEdit ||
                  pending ||
                  !draggingKey ||
                  draggingSectionId ||
                  draggingStaffId
                ) {
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (dropTargetKey !== key) setDropTargetKey(key);
              }}
              onDragLeave={() => {
                if (dropTargetKey === key) setDropTargetKey(null);
              }}
              onDrop={(event) => {
                if (!canEdit || pending) return;
                const types = Array.from(event.dataTransfer.types);
                if (
                  types.includes(STAFF_DRAG_MIME) ||
                  types.includes(SECTION_DRAG_MIME)
                ) {
                  return;
                }
                event.preventDefault();
                setDropTargetKey(null);
                setDraggingKey(null);

                let payload: DragLabelPayload | null = null;
                try {
                  const raw =
                    event.dataTransfer.getData(DRAG_MIME) ||
                    event.dataTransfer.getData("text/plain");
                  if (raw) {
                    payload = JSON.parse(raw) as DragLabelPayload;
                  }
                } catch {
                  payload = null;
                }
                if (!payload?.labelCode || !payload.key) return;

                suppressClickRef.current = true;
                stageMoveLabel(payload, member.id, day.key);
                window.setTimeout(() => {
                  suppressClickRef.current = false;
                }, 0);
              }}
            >
              <button
                type="button"
                disabled={!canEdit || pending}
                draggable={canDragLabel}
                title={
                  presentation
                    ? `${presentation.abbreviation} — ${presentation.name}${punchLine ? ` · In/out: ${punchLine}` : ""}${isDraft ? " (unsaved)" : ""}${canDragLabel ? " · drag to move" : ""}`
                    : punchLine
                      ? `In/out: ${punchLine}`
                      : canEdit
                        ? isDraft
                          ? "Cleared (unsaved)"
                          : "Select day"
                        : undefined
                }
                aria-pressed={isSelected}
                aria-label={
                  presentation
                    ? `${member.fullName} ${day.dayLabel}: ${presentation.name}${punchLine ? `, in/out ${punchLine}` : ""}`
                    : punchLine
                      ? `${member.fullName} ${day.dayLabel}: in/out ${punchLine}`
                      : `${member.fullName} ${day.dayLabel}: empty`
                }
                onMouseDown={(event) => {
                  if (!canEdit || pending) return;
                  if (value) return;
                  event.preventDefault();
                  toggleCell(member.id, day.key);
                }}
                onClick={() => {
                  if (!canEdit || pending || !value) return;
                  if (suppressClickRef.current) return;
                  toggleSelectOnly(member.id, day.key);
                }}
                onMouseEnter={() => {
                  if (!canEdit || !isPainting || pending || draggingKey) {
                    return;
                  }
                  paintCell(member.id, day.key, paintMode);
                }}
                onDragStart={(event) => {
                  if (!canDragLabel || !value) {
                    event.preventDefault();
                    return;
                  }
                  const payload: DragLabelPayload = {
                    key,
                    staffId: member.id,
                    dateKey: day.key,
                    labelCode: value.labelCode,
                    shiftTemplateId: value.shiftTemplateId,
                  };
                  event.dataTransfer.setData(
                    DRAG_MIME,
                    JSON.stringify(payload),
                  );
                  event.dataTransfer.setData(
                    "text/plain",
                    JSON.stringify(payload),
                  );
                  event.dataTransfer.effectAllowed = "move";
                  setIsPainting(false);
                  setDraggingKey(key);
                  suppressClickRef.current = true;
                }}
                onDragEnd={() => {
                  setDraggingKey(null);
                  setDropTargetKey(null);
                  window.setTimeout(() => {
                    suppressClickRef.current = false;
                  }, 0);
                }}
                className={cn(
                  "flex min-h-9 w-full flex-col items-center justify-center gap-0 rounded-md border px-0.5 py-0.5 text-[11px] font-semibold uppercase leading-tight tracking-wide transition-colors",
                  presentation
                    ? "border"
                    : attendanceOnly
                      ? "border border-black/15 bg-white/90 text-[#3D421F]"
                      : "border-dashed border-black/15 bg-transparent text-black/25",
                  canEdit &&
                    "hover:border-[var(--venue-primary)]/40 hover:bg-white/80",
                  canDragLabel && "cursor-grab active:cursor-grabbing",
                  !canEdit && "cursor-default",
                  pending && "opacity-60",
                  isSelected &&
                    "ring-2 ring-[var(--venue-primary)] ring-offset-1",
                  isDraft &&
                    !isSelected &&
                    !isDropTarget &&
                    "outline outline-1 outline-dashed outline-black/25",
                  isDragging && "opacity-40",
                  isDropTarget &&
                    "ring-2 ring-[var(--venue-primary)] ring-offset-1 scale-[1.02]",
                )}
                style={presentation ? presentation.style : undefined}
              >
                {presentation?.abbreviation ?? null}
                {punchLine ? (
                  <span
                    className={cn(
                      "font-normal normal-case tracking-normal text-[#1a1a1a]",
                      presentation
                        ? "mt-0.5 text-[9px] font-semibold"
                        : "text-[10px] font-semibold",
                    )}
                  >
                    {punchLine}
                  </span>
                ) : !presentation ? (
                  "·"
                ) : null}
              </button>
            </td>
          );
        })}
        {canEdit ? (
          <td className="w-10 border-l border-black/5 p-0 align-middle">
            <div className="flex h-full min-h-12 items-center justify-center">
              <button
                type="button"
                disabled={pending}
                title={`Clear all labels this week for ${member.fullName}`}
                aria-label={`Clear week for ${member.fullName}`}
                onClick={() => stageClearWeek(member.id)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-black/40 transition-colors hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
              >
                <Eraser className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </td>
        ) : null}
      </tr>
        {showAfterGap ? (
          <tr aria-hidden className="pointer-events-none">
            <td colSpan={colSpanTotal} className="h-0 p-0">
              <div className="h-0.5 bg-[var(--venue-primary)] shadow-[0_0_0_1px_var(--venue-primary)]" />
            </td>
          </tr>
        ) : null}
      </Fragment>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-sm text-black/55">
            {departmentLabel} {sectionsMode ? "sections" : "roster"} · week of{" "}
            <span className="font-medium text-[#3D421F]">{rangeLabel}</span>
            {loading ? (
              <span className="ml-2 text-xs text-black/40">Loading…</span>
            ) : null}
          </p>
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[#3D421F]">
            <input
              type="checkbox"
              checked={showPunchTimes}
              onChange={(event) => {
                const next = event.target.checked;
                setShowPunchTimes(next);
                try {
                  localStorage.setItem(
                    SHOW_PUNCH_TIMES_STORAGE_KEY,
                    next ? "1" : "0",
                  );
                } catch {
                  /* ignore */
                }
              }}
              className="h-3.5 w-3.5 rounded border-black/20 accent-[var(--venue-primary)]"
            />
            Show punch in/out times
            {attendanceLoading ? (
              <span className="text-black/40">(loading…)</span>
            ) : null}
          </label>
          {showPunchTimes && attendanceHint ? (
            <p className="text-xs text-amber-800/80">{attendanceHint}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {!canEdit ? (
            <button
              type="button"
              onClick={() => setLabelsDialogOpen(true)}
              className="mr-1 h-9 rounded-lg border border-black/10 bg-white/70 px-3 text-xs font-medium text-[#3D421F] transition-colors hover:bg-white"
            >
              Roster labels
            </button>
          ) : null}
          {!hideWeekNavigation ? (
            <SchedulesWeekNav
              weekOffset={weekOffset}
              onWeekOffsetChange={(offset) => setWeekOffset(offset)}
              guardAction={guardAction}
            />
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      ) : null}

      {canEdit ? (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
          <div className="min-w-0 flex-1 rounded-lg border border-[var(--venue-primary)]/25 bg-[var(--venue-primary)]/8 p-3">
            <div className="mb-2 min-w-0 space-y-1">
              {selectedCount > 0 ? (
                <p className="text-sm font-medium text-[#3D421F]">
                  {selectedCount} day{selectedCount === 1 ? "" : "s"} selected —
                  pick a label (not saved yet)
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => setLabelsDialogOpen(true)}
                  className="text-sm font-medium text-[#3D421F] underline-offset-2 transition-colors hover:underline"
                >
                  Roster labels
                </button>
              )}
              <p className="text-xs text-black/50">
                Click or drag empty days to multi-select, then assign a label
                (including Shift). Drag an existing tag onto another day to move
                it. Save when ready. Esc clears selection.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {labels.map((label) => (
                <button
                  key={label.code}
                  type="button"
                  disabled={pending || selectedCount === 0}
                  title={label.name}
                  onClick={() => stageLabel(label.code)}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={scheduleDayLabelStyle(label)}
                >
                  {label.abbreviation}
                </button>
              ))}
              <button
                type="button"
                disabled={pending || selectedCount === 0}
                onClick={() => stageLabel(null)}
                className="rounded-md border border-black/15 bg-white/80 px-2 py-1 text-[11px] font-medium text-black/55 transition-colors hover:text-[#3D421F] disabled:opacity-40"
              >
                Clear days
              </button>
            </div>
          </div>

          <div className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white/70 p-3 lg:max-w-md">
            <div className="mb-2 min-w-0 space-y-1">
              <p className="text-sm font-medium text-[#3D421F]">
                Shift times
                {selectedShiftCount > 0 ? (
                  <span className="font-normal text-black/50">
                    {" "}
                    · {selectedShiftCount} Shift day
                    {selectedShiftCount === 1 ? "" : "s"} selected
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-black/50">
                Select Shift days on the grid, then apply a time. Only Shift
                cells are updated.
              </p>
            </div>

            {shiftTemplates.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {shiftTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    disabled={pending || selectedShiftCount === 0}
                    title={`${template.name} · ${formatShiftRangeLabel(template.startTime, template.endTime)}`}
                    onClick={() => applyShiftTime(template.id)}
                    className="inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-semibold tracking-wide transition-opacity hover:opacity-90 disabled:opacity-40"
                    style={scheduleDayLabelStyle(template)}
                  >
                    {formatShiftRangeLabel(
                      template.startTime,
                      template.endTime,
                    )}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={pending || selectedShiftCount === 0}
                  onClick={clearShiftTimes}
                  className="rounded-md border border-black/15 bg-white/80 px-2 py-1 text-[11px] font-medium text-black/55 transition-colors hover:text-[#3D421F] disabled:opacity-40"
                >
                  Clear times
                </button>
              </div>
            ) : (
              <p className="text-xs text-black/45">
                No shift times configured yet. Add them under HR Settings →
                Attendance → Shift Templates.
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-black/10 bg-white/70 px-2.5 py-2 text-center sm:w-[152px] lg:self-stretch">
            <p className="w-full text-[11px] leading-tight text-black/45">
              {dirtyCount > 0
                ? `${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}`
                : "No unsaved changes"}
            </p>
            <Button
              type="button"
              size="sm"
              disabled={pending || dirtyCount === 0}
              onClick={() => {
                void saveDrafts();
              }}
              className="h-8 w-full"
            >
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending || dirtyCount === 0}
              onClick={discardDrafts}
              className="h-7 w-full bg-black/[0.06] hover:bg-black/10"
            >
              Discard
            </Button>
            <button
              type="button"
              disabled={pending || selectedCount === 0}
              onClick={() => setSelected(new Map())}
              className="inline-flex h-6 w-full items-center justify-center gap-1 rounded-md px-1 text-[10px] font-medium leading-none text-black/55 transition-colors hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-40"
            >
              <X className="h-3 w-3 shrink-0" aria-hidden />
              Clear selection
            </button>
          </div>
        </div>
      ) : null}

      {canEdit && sectionsMode ? (
        <div className="rounded-lg border border-black/10 bg-white/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-black/50">
              Drag staff grips to reorder within a section or move between
              sections. Drag section grips between rows to reorder sections.
              Day labels work the same as Roster.
            </p>
            {addingSection ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  autoFocus
                  value={newSectionName}
                  onChange={(event) => setNewSectionName(event.target.value)}
                  placeholder="Section name"
                  className="h-8 w-44 border-black/15 bg-white text-sm text-[#3D421F] placeholder:text-black/40"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitAddSection();
                    if (event.key === "Escape") {
                      setAddingSection(false);
                      setNewSectionName("");
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  onClick={commitAddSection}
                >
                  Add
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 px-0"
                  onClick={() => {
                    setAddingSection(false);
                    setNewSectionName("");
                  }}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending}
                className="h-8 gap-1.5"
                onClick={() => {
                  setAddingSection(true);
                  setEditingSectionId(null);
                }}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add section
              </Button>
            )}
          </div>
        </div>
      ) : null}

      <div
        className="overflow-x-auto rounded-lg border border-black/10 select-none"
        onMouseLeave={() => setIsPainting(false)}
      >
        <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-[240px]" />
            <col className="w-[94px]" />
            <col className="w-[94px]" />
            <col className="w-[94px]" />
            <col className="w-[94px]" />
            <col className="w-[94px]" />
            <col className="w-[94px]" />
            <col className="w-[94px]" />
            {canEdit ? <col className="w-10" /> : null}
          </colgroup>
          <thead>
            <tr className="bg-black/[0.03]">
              <th
                scope="col"
                className="sticky left-0 z-10 w-[240px] border-b border-r border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/80 px-3 py-2.5 text-left font-serif text-sm font-medium text-[#3D421F] backdrop-blur-md"
              >
                Staff
              </th>
              {days.map((day) => (
                <th
                  key={day.key}
                  scope="col"
                  title={
                    day.isPublicHoliday
                      ? (day.publicHolidayName ?? "Public holiday")
                      : undefined
                  }
                  className={cn(
                    "w-[94px] border-b border-black/10 px-2 py-2.5 text-center font-medium",
                    day.isPublicHoliday
                      ? "bg-[#ede9fe] text-[#5b21b6]"
                      : day.isToday
                        ? "bg-[var(--venue-primary)]/15 text-[#3D421F]"
                        : "text-black/60",
                  )}
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.08em]">
                    {day.weekdayLabel}
                    {day.isPublicHoliday ? (
                      <span className="ml-1 normal-case tracking-normal">
                        · PH
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs tabular-nums">
                    {day.dayLabel}
                  </span>
                </th>
              ))}
              {canEdit ? (
                <th
                  scope="col"
                  className="w-10 border-b border-l border-black/10 p-0"
                >
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr>
                <td
                  colSpan={canEdit ? 9 : 8}
                  className="px-3 py-10 text-center text-sm text-black/45"
                >
                  No ON Board staff in {departmentLabel}.
                </td>
              </tr>
            ) : sectionsMode ? (
              <>
                {renderSectionHeaderRow(
                  "Unassigned",
                  null,
                  unassignedStaff.length,
                )}
                {unassignedStaff.map((member) =>
                  renderStaffRow(member, null),
                )}
                {sections.map((section) => {
                  const members = section.staffIds
                    .map((id) => staffById.get(id))
                    .filter((row): row is ScheduleStaffRow => Boolean(row));
                  return (
                    <Fragment key={section.id}>
                      {renderSectionHeaderRow(
                        section.name,
                        section.id,
                        members.length,
                        section,
                      )}
                      {members.map((member) =>
                        renderStaffRow(member, section.id),
                      )}
                      {renderSectionAfterGap(section.id)}
                    </Fragment>
                  );
                })}
              </>
            ) : (
              staff.map((member) => renderStaffRow(member, null))
            )}
          </tbody>
        </table>
      </div>

      <RosterLabelsDialog
        open={labelsDialogOpen}
        labels={labels}
        onClose={() => setLabelsDialogOpen(false)}
      />
      {unsavedDialog}
    </div>
  );
}
