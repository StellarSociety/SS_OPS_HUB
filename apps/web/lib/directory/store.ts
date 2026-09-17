import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isHiringEmploymentStatus,
  isOutEmploymentStatus,
} from "@/lib/hr/employment-status";
import {
  buildHierarchy,
  createHireId,
  flattenHierarchy,
  hireRecordId,
  initialHierarchyRoots,
  isHireId,
  parseCollabs,
  type HierarchyNode,
  type HierarchyPersistRow,
} from "./hierarchy-tree";
import {
  computeSalaryBreakdown,
  isInAccommodation,
  type SalaryPercentages,
} from "@/lib/hr/derived";
import { medianAmount } from "./hierarchy-pay";
import type {
  DirectoryPositionOption,
  DirectoryStaffMember,
  DirectoryStaffPay,
} from "./types";

const DIRECTORY_STAFF_SELECT = `
  id,
  emp_no,
  full_name,
  photo_url,
  dob,
  joining_date,
  contact_phone,
  whatsapp,
  personal_email,
  work_email,
  position_id,
  department:departments(name, sort_order),
  position:positions(id, name),
  employment_status:employment_statuses(name),
  nationality:nationalities(name)
`;

type Named = { id?: string; name: string } | { id?: string; name: string }[] | null;
type DepartmentRel =
  | { name: string; sort_order?: number | null }
  | { name: string; sort_order?: number | null }[]
  | null;

type DirectoryStaffRow = {
  id: string;
  emp_no: string;
  full_name: string;
  photo_url?: string | null;
  dob?: string | null;
  joining_date?: string | null;
  contact_phone?: string | null;
  whatsapp?: string | null;
  personal_email?: string | null;
  work_email?: string | null;
  department?: DepartmentRel;
  position?: Named;
  position_id?: string | null;
  employment_status?: Named;
  nationality?: Named;
};

function namedId(value: Named): string | null {
  if (!value) return null;
  const row = Array.isArray(value) ? value[0] : value;
  const id = row?.id?.trim();
  return id || null;
}

function named(value: Named | DepartmentRel): string | null {
  if (!value) return null;
  const row = Array.isArray(value) ? value[0] : value;
  const name = row?.name?.trim();
  return name || null;
}

function readDepartmentSortOrder(value: DepartmentRel): number | null {
  if (!value) return null;
  const row = Array.isArray(value) ? value[0] : value;
  const order = row?.sort_order;
  return typeof order === "number" ? order : null;
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isoDate(value: string | null | undefined): string | null {
  const trimmed = value?.trim().slice(0, 10) ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export function mapDirectoryStaffRow(row: DirectoryStaffRow): DirectoryStaffMember {
  return {
    id: row.id,
    empNo: row.emp_no,
    fullName: row.full_name,
    photoUrl: text(row.photo_url),
    departmentName: named(row.department),
    departmentSortOrder: readDepartmentSortOrder(row.department),
    positionName: named(row.position),
    positionId: text(row.position_id) || namedId(row.position),
    employmentStatusName: named(row.employment_status),
    nationalityName: named(row.nationality),
    dob: isoDate(row.dob),
    joiningDate: isoDate(row.joining_date),
    contactPhone: text(row.contact_phone),
    whatsapp: text(row.whatsapp),
    personalEmail: text(row.personal_email),
    workEmail: text(row.work_email),
  };
}

export function isVisibleDirectoryStaff(
  member: Pick<DirectoryStaffMember, "employmentStatusName">,
): boolean {
  const status = member.employmentStatusName;
  return !isHiringEmploymentStatus(status) && !isOutEmploymentStatus(status);
}

export async function loadDirectoryStaff(
  supabase: SupabaseClient,
  venue: { id: string; is_global?: boolean },
): Promise<DirectoryStaffMember[]> {
  if (venue.is_global) return [];

  const { data, error } = await supabase
    .from("staff")
    .select(DIRECTORY_STAFF_SELECT)
    .eq("home_venue_id", venue.id)
    .order("full_name");

  if (error) {
    console.error("[directory] loadDirectoryStaff:", error.message);
    return [];
  }

  return ((data ?? []) as DirectoryStaffRow[])
    .map(mapDirectoryStaffRow)
    .filter(isVisibleDirectoryStaff)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

function money(value: unknown): number | null {
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

/** Payable salary + accommodation flag for Hierarchy Management cards. */
export async function loadDirectoryStaffPay(
  supabase: SupabaseClient,
  venue: { id: string; is_global?: boolean },
  staff: DirectoryStaffMember[],
  pct: SalaryPercentages,
): Promise<Record<string, DirectoryStaffPay>> {
  if (venue.is_global || staff.length === 0) return {};

  const { data, error } = await supabase
    .from("staff")
    .select("id, wage_package, company_accommodation")
    .eq("home_venue_id", venue.id)
    .in(
      "id",
      staff.map((member) => member.id),
    );

  if (error) {
    console.error("[directory] loadDirectoryStaffPay:", error.message);
    return {};
  }

  const pay: Record<string, DirectoryStaffPay> = {};
  for (const row of data ?? []) {
    const record = row as {
      id: string;
      wage_package?: unknown;
      company_accommodation?: string | null;
    };
    const inAccommodation = isInAccommodation(record.company_accommodation);
    const wage = money(record.wage_package);
    pay[record.id] = {
      salaryToPay: computeSalaryBreakdown(wage, inAccommodation, pct)
        .salaryToPay,
      inAccommodation,
    };
  }
  return pay;
}

type HierarchyNodeRow = {
  staff_id: string;
  reports_to_staff_id: string | null;
  sort_order: number;
  label?: string | null;
  collabs?: unknown;
  highlighted?: boolean | null;
};

function mapHierarchyRow(row: HierarchyNodeRow): HierarchyPersistRow {
  return {
    staffId: row.staff_id,
    reportsToStaffId: row.reports_to_staff_id,
    sortOrder: row.sort_order,
    label: row.label?.trim() || null,
    collabs: parseCollabs(row.collabs),
    highlighted: Boolean(row.highlighted),
    hirePositionId: null,
    hireBudgetedSalary: null,
    hirePositionName: null,
  };
}

export async function loadDirectoryHierarchy(
  supabase: SupabaseClient,
  venue: { id: string; is_global?: boolean },
  staff: DirectoryStaffMember[],
  options?: { includeHires?: boolean },
): Promise<HierarchyNode[]> {
  if (venue.is_global) return [];
  const includeHires = Boolean(options?.includeHires);

  const chartQuery = supabase
    .from("directory_hierarchy_charts")
    .select("venue_id")
    .eq("venue_id", venue.id)
    .maybeSingle();

  const nodesQuery = (columns: string) =>
    supabase
      .from("directory_hierarchy_nodes")
      .select(columns)
      .eq("venue_id", venue.id)
      .order("sort_order");

  const [{ data: chart, error: chartError }, firstNodes] = await Promise.all([
    chartQuery,
    nodesQuery("staff_id, reports_to_staff_id, sort_order, label, collabs, highlighted"),
  ]);

  let rows = firstNodes.data;
  let rowsError = firstNodes.error;
  if (rowsError?.message.includes("does not exist")) {
    const fallback = await nodesQuery(
      "staff_id, reports_to_staff_id, sort_order, label, collabs",
    );
    rows = fallback.data;
    rowsError = fallback.error;
  }

  if (chartError) {
    console.error("[directory] loadDirectoryHierarchy chart:", chartError.message);
  }
  if (rowsError) {
    console.error("[directory] loadDirectoryHierarchy nodes:", rowsError.message);
  }

  const known = new Set(staff.map((member) => member.id));
  const staffRows = ((rows ?? []) as HierarchyNodeRow[]).map(mapHierarchyRow);
  const hireRows = includeHires
    ? await loadDirectoryHierarchyHires(supabase, venue.id)
    : [];
  for (const hire of hireRows) known.add(hire.staffId);

  if (chart) {
    return buildHierarchy([...staffRows, ...hireRows], known);
  }

  if (includeHires && hireRows.length > 0) {
    return buildHierarchy(hireRows, known);
  }

  return initialHierarchyRoots(staff);
}

type HierarchyHireRow = {
  id: string;
  reports_to_staff_id: string | null;
  sort_order: number;
  position_id: string | null;
  budgeted_salary: number | string | null;
  position?: Named;
};

async function loadDirectoryHierarchyHires(
  supabase: SupabaseClient,
  venueId: string,
): Promise<HierarchyPersistRow[]> {
  const { data, error } = await supabase
    .from("directory_hierarchy_hires")
    .select(
      "id, reports_to_staff_id, sort_order, position_id, budgeted_salary, position:positions(name)",
    )
    .eq("venue_id", venueId)
    .order("sort_order");

  if (error) {
    if (!error.message.includes("does not exist")) {
      console.error("[directory] loadDirectoryHierarchy hires:", error.message);
    }
    return [];
  }

  return ((data ?? []) as HierarchyHireRow[]).map((row) => {
    const salary =
      row.budgeted_salary == null || row.budgeted_salary === ""
        ? null
        : Number(row.budgeted_salary);
    return {
      staffId: createHireId(row.id),
      reportsToStaffId: row.reports_to_staff_id,
      sortOrder: row.sort_order,
      label: null,
      collabs: [],
      highlighted: false,
      hirePositionId: row.position_id,
      hireBudgetedSalary:
        salary != null && Number.isFinite(salary) ? salary : null,
      hirePositionName: named(row.position),
    };
  });
}

export async function loadDirectoryPositions(
  supabase: SupabaseClient,
  venue: { id: string; is_global?: boolean },
  staff: DirectoryStaffMember[],
  payByStaffId: Record<string, DirectoryStaffPay>,
): Promise<DirectoryPositionOption[]> {
  if (venue.is_global) return [];

  const { data, error } = await supabase
    .from("positions")
    .select("id, name, department:departments(name)")
    .eq("venue_id", venue.id)
    .order("sort_order");

  if (error) {
    console.error("[directory] loadDirectoryPositions:", error.message);
    return [];
  }

  const payByPosition = new Map<string, number[]>();
  for (const member of staff) {
    if (!member.positionId) continue;
    const amount = payByStaffId[member.id]?.salaryToPay;
    if (amount == null || Number.isNaN(amount)) continue;
    const list = payByPosition.get(member.positionId) ?? [];
    list.push(amount);
    payByPosition.set(member.positionId, list);
  }

  return ((data ?? []) as Array<{
    id: string;
    name: string;
    department?: Named;
  }>).map((row) => ({
    id: row.id,
    name: row.name,
    departmentName: named(row.department),
    typicalPayable: medianAmount(payByPosition.get(row.id) ?? []),
  }));
}

export function hierarchyPayload(roots: HierarchyNode[]) {
  return flattenHierarchy(roots)
    .filter((row) => !isHireId(row.staffId))
    .map((row) => ({
      staff_id: row.staffId,
      reports_to_staff_id:
        row.reportsToStaffId && !isHireId(row.reportsToStaffId)
          ? row.reportsToStaffId
          : null,
      sort_order: row.sortOrder,
      label: row.label,
      collabs: row.collabs.map((collab) => ({
        staff_id: collab.staffId,
        side: collab.side,
      })),
      highlighted: Boolean(row.highlighted),
    }));
}

export function hierarchyHirePayload(roots: HierarchyNode[]) {
  return flattenHierarchy(roots)
    .filter((row) => isHireId(row.staffId))
    .map((row) => ({
      id: hireRecordId(row.staffId),
      reports_to_staff_id:
        row.reportsToStaffId && !isHireId(row.reportsToStaffId)
          ? row.reportsToStaffId
          : null,
      sort_order: row.sortOrder,
      position_id: row.hirePositionId,
      budgeted_salary: row.hireBudgetedSalary,
    }));
}
