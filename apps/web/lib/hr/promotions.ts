import "server-only";

import { dubaiTodayIso } from "@/lib/hr/benefits/flight-ticket";
import { createServiceClient } from "@/lib/supabase/service";

export type PromotionStatus = "completed" | "scheduled";

export type PathChangeKind = "position" | "salary" | "both";

export type PromotionItem = {
  id: string;
  changeKind: PathChangeKind;
  /** Position moved to a new role, or the reason mentions a promotion. */
  isPromotion: boolean;
  /** Employee's role today (salary-only changes carry no position). */
  currentPositionName: string | null;
  currentDepartmentName: string | null;
  staffId: string;
  empNo: string;
  fullName: string;
  photoUrl: string | null;
  employmentStatus: string | null;
  effectiveDate: string;
  status: PromotionStatus;
  fromDepartmentName: string | null;
  toDepartmentName: string | null;
  fromPositionName: string | null;
  toPositionName: string | null;
  fromWagePackage: number | null;
  toWagePackage: number | null;
  reason: string;
  notes: string | null;
};

function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Every position and/or salary change on Employment paths (visa-only changes
 * excluded). `isPromotion` marks moves to a new position plus any change whose
 * reason says "promotion". Future effective dates are reported as scheduled.
 */
export async function listPromotionItems(
  venueId: string,
  { showSalary }: { showSalary: boolean },
): Promise<PromotionItem[]> {
  // Service role: RLS on the change table calls has_feature_permission per row
  // and can stall the user-scoped client (see hr-staff-position-salary).
  const service = createServiceClient();

  const { data: changes, error } = await service
    .from("hr_staff_position_salary_changes")
    .select(
      "id, staff_id, effective_date, change_kind, from_department_id, to_department_id, from_position_id, to_position_id, from_wage_package, to_wage_package, reason, notes",
    )
    .eq("venue_id", venueId)
    .in("change_kind", ["position", "salary", "both"])
    .order("effective_date", { ascending: false })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) {
    console.error("[hr] listPromotionItems:", error.message);
    return [];
  }

  const rows = changes ?? [];
  if (rows.length === 0) return [];

  const isPromotion = (row: (typeof rows)[number]) => {
    if (String(row.reason ?? "").toLowerCase().includes("promot")) return true;
    // A "position" change back to the same role is a correction, not a promotion.
    return (
      row.change_kind !== "salary" &&
      row.to_position_id != null &&
      row.to_position_id !== row.from_position_id
    );
  };

  const staffIds = [...new Set(rows.map((r) => r.staff_id as string))];
  const [{ data: staff }, { data: departments }, { data: positions }] =
    await Promise.all([
      service
        .from("staff")
        .select(
          "id, emp_no, full_name, photo_url, employment_status:employment_statuses(name), department:departments(name), position:positions(name)",
        )
        .in("id", staffIds),
      service.from("departments").select("id, name").eq("venue_id", venueId),
      service.from("positions").select("id, name").eq("venue_id", venueId),
    ]);

  const staffById = new Map(
    (staff ?? []).map((s) => [s.id as string, s as Record<string, unknown>]),
  );
  const deptNames = new Map(
    (departments ?? []).map((d) => [d.id as string, String(d.name)]),
  );
  const posNames = new Map(
    (positions ?? []).map((p) => [p.id as string, String(p.name)]),
  );
  const name = (map: Map<string, string>, id: unknown) =>
    typeof id === "string" ? (map.get(id) ?? null) : null;

  const today = dubaiTodayIso();

  return rows.flatMap((row) => {
    const person = staffById.get(row.staff_id as string);
    if (!person) return [];
    const status = person.employment_status as { name?: string } | null;
    const currentDept = person.department as { name?: string } | null;
    const currentPos = person.position as { name?: string } | null;
    const effectiveDate = String(row.effective_date).slice(0, 10);
    return [
      {
        id: row.id as string,
        changeKind: row.change_kind as PathChangeKind,
        isPromotion: isPromotion(row),
        currentPositionName: currentPos?.name ?? null,
        currentDepartmentName: currentDept?.name ?? null,
        staffId: row.staff_id as string,
        empNo: String(person.emp_no ?? ""),
        fullName: String(person.full_name ?? ""),
        photoUrl: (person.photo_url as string | null) ?? null,
        employmentStatus: status?.name ?? null,
        effectiveDate,
        status: effectiveDate > today ? "scheduled" : "completed",
        fromDepartmentName: name(deptNames, row.from_department_id),
        toDepartmentName: name(deptNames, row.to_department_id),
        fromPositionName: name(posNames, row.from_position_id),
        toPositionName: name(posNames, row.to_position_id),
        fromWagePackage: showSalary ? numOrNull(row.from_wage_package) : null,
        toWagePackage: showSalary ? numOrNull(row.to_wage_package) : null,
        reason: String(row.reason ?? ""),
        notes: (row.notes as string | null) ?? null,
      } satisfies PromotionItem,
    ];
  });
}
