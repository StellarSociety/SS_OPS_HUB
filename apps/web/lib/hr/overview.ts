import type { ExpiryItem, StaffWithLookups } from "./types";

export type HrBreakdownRow = {
  label: string;
  count: number;
  /** Share of the filtered (ON Board) cohort, 0–100. */
  percent: number;
};

export type HrOverviewStats = {
  totalStaff: number;
  activeStaff: number;
  onLeaveOrTerminated: number;
  departmentCount: number;
  nationalityCount: number;
  expiringSoon: number;
  overdue: number;
  byDepartment: HrBreakdownRow[];
  byStatus: HrBreakdownRow[];
  byNationality: HrBreakdownRow[];
};

const UNASSIGNED = "Unassigned";
const UNSPECIFIED = "Unspecified";
/** Matches employment_statuses seed / StatusBadge — currently employed. */
const ON_BOARD_STATUS_NAME = "ON Board";

function isOnBoard(member: StaffWithLookups): boolean {
  return member.employment_status?.name === ON_BOARD_STATUS_NAME;
}

function tallyBy(
  staff: StaffWithLookups[],
  keyOf: (member: StaffWithLookups) => string,
): HrBreakdownRow[] {
  const total = staff.length;
  const counts = new Map<string, number>();
  for (const member of staff) {
    const key = keyOf(member);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts, ([label, count]) => ({
    label,
    count,
    percent: total > 0 ? Math.round((count / total) * 100) : 0,
  })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** A staff member is treated as active when they have no termination date set. */
function isActive(member: StaffWithLookups): boolean {
  return !member.termination_date;
}

export function buildHrOverviewStats(
  staff: StaffWithLookups[],
  expiryItems: ExpiryItem[],
  options?: { topNationalities?: number },
): HrOverviewStats {
  const topNationalities = options?.topNationalities ?? 6;

  const activeStaff = staff.filter(isActive).length;
  const onBoardStaff = staff.filter(isOnBoard);

  const byDepartment = tallyBy(
    onBoardStaff,
    (member) => member.department?.name ?? UNASSIGNED,
  );
  const byStatus = tallyBy(
    staff,
    (member) => member.employment_status?.name ?? UNSPECIFIED,
  );
  const byNationality = tallyBy(
    onBoardStaff,
    (member) => member.nationality?.name ?? UNSPECIFIED,
  ).slice(0, topNationalities);

  const overdue = expiryItems.filter((item) => item.daysUntil < 0).length;

  return {
    totalStaff: staff.length,
    activeStaff,
    onLeaveOrTerminated: staff.length - activeStaff,
    departmentCount: byDepartment.filter((row) => row.label !== UNASSIGNED)
      .length,
    nationalityCount: new Set(
      onBoardStaff
        .map((member) => member.nationality?.name)
        .filter((name): name is string => Boolean(name)),
    ).size,
    expiringSoon: expiryItems.length,
    overdue,
    byDepartment,
    byStatus,
    byNationality,
  };
}
