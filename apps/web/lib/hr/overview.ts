import { continentFromNationalityName } from "./nationality-flag";
import type { ExpiryItem, StaffWithLookups } from "./types";

export type HrBreakdownRow = {
  label: string;
  count: number;
  /** Share of the filtered (ON Board) cohort, 0–100. */
  percent: number;
};

export type HrContinentRow = HrBreakdownRow & {
  /** Nationalities within this continent, highest count first. */
  nationalities: { name: string; count: number }[];
  /** ON Board staff in this continent, sorted by name. */
  staff: {
    staffId: string;
    empNo: string;
    fullName: string;
    country: string;
    photoUrl: string | null;
    departmentName: string | null;
    positionName: string | null;
    employmentStatusName: string | null;
    workingStatusName: string | null;
    dob: string | null;
    joiningDate: string | null;
    terminationDate: string | null;
  }[];
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
  byContinent: HrContinentRow[];
  byNationality: HrBreakdownRow[];
};

const UNASSIGNED = "Unassigned";
const UNSPECIFIED = "Unspecified";
const OTHER = "Other";
/** Matches employment_statuses seed / StatusBadge — currently employed. */
const ON_BOARD_STATUS_NAME = "ON Board";

function isOnBoard(member: StaffWithLookups): boolean {
  return member.employment_status?.name === ON_BOARD_STATUS_NAME;
}

/** Largest-remainder rounding so integer percents always sum to 100 (or 0). */
function assignPercents(counts: number[], total: number): number[] {
  if (total <= 0 || counts.length === 0) {
    return counts.map(() => 0);
  }

  const exact = counts.map((count) => (count / total) * 100);
  const floored = exact.map((value) => Math.floor(value));
  let remaining = 100 - floored.reduce((sum, value) => sum + value, 0);

  const byFraction = exact
    .map((value, index) => ({ index, fraction: value - floored[index]! }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  const percents = [...floored];
  for (const { index } of byFraction) {
    if (remaining <= 0) break;
    percents[index] = (percents[index] ?? 0) + 1;
    remaining -= 1;
  }
  return percents;
}

function withPercents(
  rows: { label: string; count: number }[],
  total: number,
): HrBreakdownRow[] {
  const percents = assignPercents(
    rows.map((row) => row.count),
    total,
  );
  return rows.map((row, index) => ({
    label: row.label,
    count: row.count,
    percent: percents[index] ?? 0,
  }));
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
  const rows = Array.from(counts, ([label, count]) => ({ label, count })).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
  return withPercents(rows, total);
}

/** Keep the top N rows and roll the rest into Other so shares still sum to 100%. */
function takeTopWithOther(
  rows: HrBreakdownRow[],
  limit: number,
  total: number,
): HrBreakdownRow[] {
  if (rows.length <= limit) return rows;

  const top = rows.slice(0, limit).map(({ label, count }) => ({ label, count }));
  const otherCount = rows
    .slice(limit)
    .reduce((sum, row) => sum + row.count, 0);

  return withPercents([...top, { label: OTHER, count: otherCount }], total);
}

function tallyContinents(staff: StaffWithLookups[]): HrContinentRow[] {
  const total = staff.length;
  const byContinent = new Map<
    string,
    {
      count: number;
      nationalities: Map<string, number>;
      staff: {
        staffId: string;
        empNo: string;
        fullName: string;
        country: string;
        photoUrl: string | null;
        departmentName: string | null;
        positionName: string | null;
        employmentStatusName: string | null;
        workingStatusName: string | null;
        dob: string | null;
        joiningDate: string | null;
        terminationDate: string | null;
      }[];
    }
  >();

  for (const member of staff) {
    const continent =
      continentFromNationalityName(member.nationality?.name) ?? UNSPECIFIED;
    const nationality = member.nationality?.name?.trim() || UNSPECIFIED;
    let bucket = byContinent.get(continent);
    if (!bucket) {
      bucket = { count: 0, nationalities: new Map(), staff: [] };
      byContinent.set(continent, bucket);
    }
    bucket.count += 1;
    bucket.nationalities.set(
      nationality,
      (bucket.nationalities.get(nationality) ?? 0) + 1,
    );
    bucket.staff.push({
      staffId: member.id,
      empNo: member.emp_no,
      fullName: member.full_name,
      country: nationality,
      photoUrl: member.photo_url?.trim() || null,
      departmentName: member.department?.name ?? null,
      positionName: member.position?.name ?? null,
      employmentStatusName: member.employment_status?.name ?? null,
      workingStatusName: member.working_status?.name ?? null,
      dob: member.dob?.trim().slice(0, 10) || null,
      joiningDate: member.joining_date?.trim().slice(0, 10) || null,
      terminationDate: member.termination_date?.trim().slice(0, 10) || null,
    });
  }

  const rows = Array.from(byContinent, ([label, bucket]) => ({
    label,
    count: bucket.count,
    nationalities: Array.from(bucket.nationalities, ([name, count]) => ({
      name,
      count,
    })).sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name),
    ),
    staff: [...bucket.staff].sort(
      (a, b) =>
        a.fullName.localeCompare(b.fullName) ||
        a.empNo.localeCompare(b.empNo, undefined, { numeric: true }),
    ),
  })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const percents = assignPercents(
    rows.map((row) => row.count),
    total,
  );

  return rows.map((row, index) => ({
    ...row,
    percent: percents[index] ?? 0,
  }));
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
  const byContinent = tallyContinents(onBoardStaff);
  const byNationality = takeTopWithOther(
    tallyBy(
      onBoardStaff,
      (member) => member.nationality?.name ?? UNSPECIFIED,
    ),
    topNationalities,
    onBoardStaff.length,
  );

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
    byContinent,
    byNationality,
  };
}
