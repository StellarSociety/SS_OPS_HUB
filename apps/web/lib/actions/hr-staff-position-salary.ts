"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import {
  computeSalaryBreakdown,
  type SalaryPercentages,
} from "@/lib/hr/derived";
import {
  canEditOwnStaff,
  canViewSalary,
  canViewStaff,
} from "@/lib/hr/permissions";
import {
  DEFAULT_HR_SALARY_DEFAULTS,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  normalizeVisaStatusLabel,
} from "@/lib/hr/types";
import { getHrVenueSetting } from "@/lib/hr/store";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PositionSalaryChangeKind = "position" | "salary" | "both" | "visa";

export type StaffPositionSalaryChangeItem = {
  id: string;
  effectiveDate: string;
  changeKind: PositionSalaryChangeKind;
  changeVisa: boolean;
  fromDepartmentId: string | null;
  toDepartmentId: string | null;
  fromPositionId: string | null;
  toPositionId: string | null;
  fromDepartmentName: string | null;
  toDepartmentName: string | null;
  fromPositionName: string | null;
  toPositionName: string | null;
  fromWagePackage: number | null;
  toWagePackage: number | null;
  fromCompanyAccommodation: string | null;
  toCompanyAccommodation: string | null;
  fromVisaStatus: string | null;
  toVisaStatus: string | null;
  fromVisaExpiry: string | null;
  toVisaExpiry: string | null;
  reason: string;
  notes: string | null;
  createdAt: string;
};

export type CreatePositionSalaryChangeInput = {
  staffId: string;
  effectiveDate: string;
  changePosition: boolean;
  changeSalary: boolean;
  changeVisa?: boolean;
  toDepartmentId: string | null;
  toPositionId: string | null;
  toWagePackage: number | null;
  toCompanyAccommodation: string | null;
  toVisaStatus?: string | null;
  toVisaExpiry?: string | null;
  reason: string;
  notes?: string | null;
};

export type CreatePositionSalaryChangeResult =
  | {
      ok: true;
      item: StaffPositionSalaryChangeItem;
      staffPatch: {
        department_id: string;
        position_id: string;
        wage_package: string;
        company_accommodation: string;
        visa_status?: string;
        visa_expiry?: string;
      };
    }
  | { ok: false; error: string };

export type UpdatePositionSalaryChangeInput = CreatePositionSalaryChangeInput & {
  changeId: string;
};

function parseIsoDate(value: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})$/.exec(value.trim());
  return m ? m[1] : null;
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalIsoDate(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return parseIsoDate(trimmed);
}

function normalizeVisaStatus(value: string | null | undefined): string | null {
  return normalizeVisaStatusLabel(value);
}

function mapChangeRow(
  row: Record<string, unknown>,
  names: {
    departments: Map<string, string>;
    positions: Map<string, string>;
  },
): StaffPositionSalaryChangeItem {
  const fromDept = (row.from_department_id as string | null) ?? null;
  const toDept = (row.to_department_id as string | null) ?? null;
  const fromPos = (row.from_position_id as string | null) ?? null;
  const toPos = (row.to_position_id as string | null) ?? null;
  const kind = row.change_kind as PositionSalaryChangeKind;
  const fromVisaExpiry = row.from_visa_expiry
    ? String(row.from_visa_expiry).slice(0, 10)
    : null;
  const toVisaExpiry = row.to_visa_expiry
    ? String(row.to_visa_expiry).slice(0, 10)
    : null;
  return {
    id: row.id as string,
    effectiveDate: String(row.effective_date).slice(0, 10),
    changeKind: kind,
    changeVisa: Boolean(row.change_visa) || kind === "visa",
    fromDepartmentId: fromDept,
    toDepartmentId: toDept,
    fromPositionId: fromPos,
    toPositionId: toPos,
    fromDepartmentName: fromDept
      ? (names.departments.get(fromDept) ?? null)
      : null,
    toDepartmentName: toDept ? (names.departments.get(toDept) ?? null) : null,
    fromPositionName: fromPos ? (names.positions.get(fromPos) ?? null) : null,
    toPositionName: toPos ? (names.positions.get(toPos) ?? null) : null,
    fromWagePackage: numOrNull(row.from_wage_package),
    toWagePackage: numOrNull(row.to_wage_package),
    fromCompanyAccommodation:
      (row.from_company_accommodation as string | null) ?? null,
    toCompanyAccommodation:
      (row.to_company_accommodation as string | null) ?? null,
    fromVisaStatus: (row.from_visa_status as string | null) ?? null,
    toVisaStatus: (row.to_visa_status as string | null) ?? null,
    fromVisaExpiry,
    toVisaExpiry,
    reason: String(row.reason ?? ""),
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

async function loadLookupNames(supabase: SupabaseClient, venueId: string) {
  const [{ data: departments }, { data: positions }] = await Promise.all([
    supabase.from("departments").select("id, name").eq("venue_id", venueId),
    supabase.from("positions").select("id, name").eq("venue_id", venueId),
  ]);
  return {
    departments: new Map(
      (departments ?? []).map((d) => [d.id as string, String(d.name)]),
    ),
    positions: new Map(
      (positions ?? []).map((p) => [p.id as string, String(p.name)]),
    ),
  };
}

function revalidateStaffPaths(staffId: string) {
  revalidatePath(`/hr/${staffId}`);
  revalidatePath("/hr");
  revalidatePath("/hr/staff");
  revalidatePath("/hr/staff/entry");
}

export async function listStaffPositionSalaryChanges(
  staffId: string,
): Promise<
  | { ok: true; items: StaffPositionSalaryChangeItem[] }
  | { ok: false; error: string }
> {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { supabase, venue, permissions } = ctx;

  if (!canViewStaff(permissions, venue.id)) {
    return { ok: false, error: "No permission to view staff history." };
  }

  const id = staffId.trim();
  if (!id) return { ok: false, error: "Staff member is required." };

  const { data, error } = await supabase
    .from("hr_staff_position_salary_changes")
    .select("*")
    .eq("venue_id", venue.id)
    .eq("staff_id", id)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[hr] list position/salary changes:", error.message);
    return { ok: false, error: error.message };
  }

  const names = await loadLookupNames(supabase, venue.id);
  const showSalary = canViewSalary(permissions, venue.id);
  const items = (data ?? []).map((row) => {
    const mapped = mapChangeRow(row as Record<string, unknown>, names);
    if (showSalary) return mapped;
    return {
      ...mapped,
      fromWagePackage: null,
      toWagePackage: null,
      fromCompanyAccommodation: null,
      toCompanyAccommodation: null,
    };
  });

  return { ok: true, items };
}

export async function createStaffPositionSalaryChange(
  input: CreatePositionSalaryChangeInput,
): Promise<CreatePositionSalaryChangeResult> {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { supabase, user, venue, permissions } = ctx;

  const staffId = input.staffId.trim();
  if (!staffId) return { ok: false, error: "Staff member is required." };

  const effectiveDate = parseIsoDate(input.effectiveDate);
  if (!effectiveDate) {
    return { ok: false, error: "Enter a valid effective date." };
  }

  const changePosition = Boolean(input.changePosition);
  const changeSalary = Boolean(input.changeSalary);
  const changeVisa = Boolean(input.changeVisa);
  if (!changePosition && !changeSalary && !changeVisa) {
    return {
      ok: false,
      error: "Choose a position, salary, and/or visa change.",
    };
  }

  if (changeSalary && !/^\d{4}-\d{2}-01$/.test(effectiveDate)) {
    return {
      ok: false,
      error:
        "Salary changes must take effect on the 1st of a month. Payroll uses one package for the whole month.",
    };
  }

  const reason = input.reason.trim();

  const { data: before, error: loadError } = await supabase
    .from("staff")
    .select(
      "id, created_by, department_id, position_id, wage_package, basic_salary_60, accom_all_25, transp_all_15, company_accommodation, visa_status, visa_expiry, home_venue_id",
    )
    .eq("id", staffId)
    .eq("home_venue_id", venue.id)
    .maybeSingle();

  if (loadError || !before) {
    return { ok: false, error: loadError?.message ?? "Staff member not found." };
  }

  if (
    !canEditOwnStaff(
      permissions,
      venue.id,
      (before.created_by as string | null) ?? null,
      user.id,
    )
  ) {
    return { ok: false, error: "You do not have permission to edit staff." };
  }

  if (changeSalary && !canViewSalary(permissions, venue.id)) {
    return { ok: false, error: "You do not have permission to change salary." };
  }

  const fromDepartmentId = (before.department_id as string | null) ?? null;
  const fromPositionId = (before.position_id as string | null) ?? null;
  const fromWage = numOrNull(before.wage_package);
  const fromBasic = numOrNull(before.basic_salary_60);
  const fromAccom = numOrNull(before.accom_all_25);
  const fromTransp = numOrNull(before.transp_all_15);
  const fromAccomFlag =
    (before.company_accommodation as string | null)?.trim() || "No";
  const fromVisaStatus = normalizeVisaStatus(
    before.visa_status as string | null,
  );
  const fromVisaExpiry = before.visa_expiry
    ? String(before.visa_expiry).slice(0, 10)
    : null;

  let toDepartmentId = fromDepartmentId;
  let toPositionId = fromPositionId;
  let toWage = fromWage;
  let toBasic = fromBasic;
  let toAccom = fromAccom;
  let toTransp = fromTransp;
  let toAccomFlag = fromAccomFlag;
  let toVisaStatus = fromVisaStatus;
  let toVisaExpiry = fromVisaExpiry;

  if (changePosition) {
    toDepartmentId = input.toDepartmentId?.trim() || null;
    toPositionId = input.toPositionId?.trim() || null;
    if (!toPositionId) {
      return { ok: false, error: "Select the new position." };
    }
  }

  if (changeSalary) {
    toWage = input.toWagePackage;
    if (toWage == null || !Number.isFinite(toWage) || toWage < 0) {
      return { ok: false, error: "Enter a valid wage package amount." };
    }
    const rawFlag = (input.toCompanyAccommodation ?? "No").trim();
    toAccomFlag =
      rawFlag.toLowerCase() === "yes" || rawFlag === "Yes" ? "Yes" : "No";

    const salaryDefaults = await getHrVenueSetting(
      supabase,
      venue.id,
      HR_SETTINGS_KEYS.salaryDefaults,
      DEFAULT_HR_SALARY_DEFAULTS,
    );
    const pct: SalaryPercentages = {
      basic: salaryDefaults.basicPct,
      accom: salaryDefaults.accomPct,
      transp: salaryDefaults.transpPct,
    };
    const breakdown = computeSalaryBreakdown(
      toWage,
      toAccomFlag === "Yes",
      pct,
    );
    toBasic = breakdown.basic;
    toAccom = breakdown.accom;
    toTransp = breakdown.transp;
  }

  if (changeVisa) {
    toVisaStatus = normalizeVisaStatus(input.toVisaStatus);
    toVisaExpiry = parseOptionalIsoDate(input.toVisaExpiry);
    if (input.toVisaExpiry?.trim() && !toVisaExpiry) {
      return { ok: false, error: "Enter a valid visa expiry date." };
    }
  }

  const positionActuallyChanged =
    changePosition &&
    (toDepartmentId !== fromDepartmentId || toPositionId !== fromPositionId);
  const salaryActuallyChanged =
    changeSalary &&
    (toWage !== fromWage || toAccomFlag !== fromAccomFlag);
  const visaActuallyChanged =
    changeVisa &&
    (toVisaStatus !== fromVisaStatus || toVisaExpiry !== fromVisaExpiry);

  if (
    !positionActuallyChanged &&
    !salaryActuallyChanged &&
    !visaActuallyChanged
  ) {
    if (changeVisa && !changePosition && !changeSalary) {
      return {
        ok: false,
        error: "Update visa status or expiry, or turn off Visa update.",
      };
    }
    if (changePosition && changeSalary) {
      return {
        ok: false,
        error:
          "Nothing changed — pick a different position and/or a different salary.",
      };
    }
    if (changePosition) {
      return {
        ok: false,
        error: "Select a different position, or turn off Position change.",
      };
    }
    if (changeSalary) {
      return {
        ok: false,
        error: "Enter a different salary, or turn off Salary update.",
      };
    }
    return {
      ok: false,
      error: "Choose a position, salary, and/or visa change.",
    };
  }

  const applyPosition = positionActuallyChanged;
  const applySalary = salaryActuallyChanged;
  const applyVisa = visaActuallyChanged;

  const changeKind: PositionSalaryChangeKind =
    !applyPosition && !applySalary && applyVisa
      ? "visa"
      : applyPosition && applySalary
        ? "both"
        : applyPosition
          ? "position"
          : "salary";

  const insertRow = {
    venue_id: venue.id,
    staff_id: staffId,
    effective_date: effectiveDate,
    change_kind: changeKind,
    change_visa: applyVisa,
    from_department_id: fromDepartmentId,
    to_department_id: applyPosition ? toDepartmentId : fromDepartmentId,
    from_position_id: fromPositionId,
    to_position_id: applyPosition ? toPositionId : fromPositionId,
    from_wage_package: fromWage,
    to_wage_package: applySalary ? toWage : fromWage,
    from_basic_salary_60: fromBasic,
    to_basic_salary_60: applySalary ? toBasic : fromBasic,
    from_accom_all_25: fromAccom,
    to_accom_all_25: applySalary ? toAccom : fromAccom,
    from_transp_all_15: fromTransp,
    to_transp_all_15: applySalary ? toTransp : fromTransp,
    from_company_accommodation: fromAccomFlag,
    to_company_accommodation: applySalary ? toAccomFlag : fromAccomFlag,
    from_visa_status: fromVisaStatus,
    to_visa_status: applyVisa ? toVisaStatus : fromVisaStatus,
    from_visa_expiry: fromVisaExpiry,
    to_visa_expiry: applyVisa ? toVisaExpiry : fromVisaExpiry,
    reason,
    notes: input.notes?.trim() || null,
    created_by: user.id,
  };

  const service = createServiceClient();

  const { data: created, error: insertError } = await service
    .from("hr_staff_position_salary_changes")
    .insert(insertRow)
    .select("*")
    .single();

  if (insertError || !created) {
    return {
      ok: false,
      error: insertError?.message ?? "Could not save alteration.",
    };
  }

  const staffUpdates: Record<string, unknown> = {};
  if (applyPosition) {
    staffUpdates.department_id = toDepartmentId;
    staffUpdates.position_id = toPositionId;
  }
  if (applySalary) {
    staffUpdates.wage_package = toWage;
    staffUpdates.basic_salary_60 = toBasic;
    staffUpdates.accom_all_25 = toAccom;
    staffUpdates.transp_all_15 = toTransp;
    staffUpdates.company_accommodation = toAccomFlag;
  }
  if (applyVisa) {
    staffUpdates.visa_status = toVisaStatus;
    staffUpdates.visa_expiry = toVisaExpiry;
  }

  const { error: updateError } = await service
    .from("staff")
    .update(staffUpdates)
    .eq("id", staffId)
    .eq("home_venue_id", venue.id);

  if (updateError) {
    await service
      .from("hr_staff_position_salary_changes")
      .delete()
      .eq("id", created.id);
    return { ok: false, error: updateError.message };
  }

  await writeAuditLog({
    actor_id: user.id,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "staff_position_salary_change",
    entity_id: created.id as string,
    venue_id: venue.id,
    before: {
      staff_id: staffId,
      department_id: fromDepartmentId,
      position_id: fromPositionId,
      wage_package: fromWage,
      company_accommodation: fromAccomFlag,
      visa_status: fromVisaStatus,
      visa_expiry: fromVisaExpiry,
    },
    after: {
      ...insertRow,
      staff_updates: staffUpdates,
    },
  });

  revalidateStaffPaths(staffId);

  const names = await loadLookupNames(supabase, venue.id);
  const item = mapChangeRow(created as Record<string, unknown>, names);

  return {
    ok: true,
    item,
    staffPatch: {
      department_id: String(
        (staffUpdates.department_id as string | null | undefined) ??
          fromDepartmentId ??
          "",
      ),
      position_id: String(
        (staffUpdates.position_id as string | null | undefined) ??
          fromPositionId ??
          "",
      ),
      wage_package:
        applySalary && toWage != null
          ? String(toWage)
          : fromWage != null
            ? String(fromWage)
            : "",
      company_accommodation: applySalary ? toAccomFlag : fromAccomFlag,
      ...(applyVisa
        ? {
            visa_status: toVisaStatus ?? "",
            visa_expiry: toVisaExpiry ?? "",
          }
        : {}),
    },
  };
}

export async function updateStaffPositionSalaryChange(
  input: UpdatePositionSalaryChangeInput,
): Promise<CreatePositionSalaryChangeResult> {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { supabase, user, venue, permissions } = ctx;

  const changeId = input.changeId.trim();
  const staffId = input.staffId.trim();
  if (!changeId || !staffId) {
    return { ok: false, error: "Alteration and staff are required." };
  }

  const effectiveDate = parseIsoDate(input.effectiveDate);
  if (!effectiveDate) {
    return { ok: false, error: "Enter a valid effective date." };
  }

  const changePosition = Boolean(input.changePosition);
  const changeSalary = Boolean(input.changeSalary);
  const changeVisa = Boolean(input.changeVisa);
  if (!changePosition && !changeSalary && !changeVisa) {
    return {
      ok: false,
      error: "Choose a position, salary, and/or visa change.",
    };
  }

  if (changeSalary && !/^\d{4}-\d{2}-01$/.test(effectiveDate)) {
    return {
      ok: false,
      error:
        "Salary changes must take effect on the 1st of a month. Payroll uses one package for the whole month.",
    };
  }

  if (changeSalary && !canViewSalary(permissions, venue.id)) {
    return { ok: false, error: "You do not have permission to change salary." };
  }

  const { data: existing, error: loadChangeError } = await supabase
    .from("hr_staff_position_salary_changes")
    .select("*")
    .eq("id", changeId)
    .eq("venue_id", venue.id)
    .eq("staff_id", staffId)
    .maybeSingle();

  if (loadChangeError || !existing) {
    return {
      ok: false,
      error: loadChangeError?.message ?? "Alteration not found.",
    };
  }

  const { data: staff, error: loadStaffError } = await supabase
    .from("staff")
    .select("id, created_by, visa_status, visa_expiry")
    .eq("id", staffId)
    .eq("home_venue_id", venue.id)
    .maybeSingle();

  if (loadStaffError || !staff) {
    return { ok: false, error: loadStaffError?.message ?? "Staff not found." };
  }

  if (
    !canEditOwnStaff(
      permissions,
      venue.id,
      (staff.created_by as string | null) ?? null,
      user.id,
    )
  ) {
    return { ok: false, error: "You do not have permission to edit staff." };
  }

  const fromDepartmentId =
    (existing.from_department_id as string | null) ?? null;
  const fromPositionId = (existing.from_position_id as string | null) ?? null;
  const fromWage = numOrNull(existing.from_wage_package);
  const fromBasic = numOrNull(existing.from_basic_salary_60);
  const fromAccomAmt = numOrNull(existing.from_accom_all_25);
  const fromTransp = numOrNull(existing.from_transp_all_15);
  const fromAccomFlag =
    (existing.from_company_accommodation as string | null)?.trim() || "No";
  const fromVisaStatus =
    normalizeVisaStatus(existing.from_visa_status as string | null) ??
    normalizeVisaStatus(staff.visa_status as string | null);
  const fromVisaExpiry = existing.from_visa_expiry
    ? String(existing.from_visa_expiry).slice(0, 10)
    : staff.visa_expiry
      ? String(staff.visa_expiry).slice(0, 10)
      : null;

  let toDepartmentId = fromDepartmentId;
  let toPositionId = fromPositionId;
  let toWage = fromWage;
  let toBasic = fromBasic;
  let toAccomAmt = fromAccomAmt;
  let toTransp = fromTransp;
  let toAccomFlag = fromAccomFlag;
  let toVisaStatus = fromVisaStatus;
  let toVisaExpiry = fromVisaExpiry;

  if (changePosition) {
    toDepartmentId = input.toDepartmentId?.trim() || null;
    toPositionId = input.toPositionId?.trim() || null;
    if (!toPositionId) {
      return { ok: false, error: "Select the new position." };
    }
  }

  if (changeSalary) {
    toWage = input.toWagePackage;
    if (toWage == null || !Number.isFinite(toWage) || toWage < 0) {
      return { ok: false, error: "Enter a valid wage package amount." };
    }
    const rawFlag = (input.toCompanyAccommodation ?? "No").trim();
    toAccomFlag =
      rawFlag.toLowerCase() === "yes" || rawFlag === "Yes" ? "Yes" : "No";

    const salaryDefaults = await getHrVenueSetting(
      supabase,
      venue.id,
      HR_SETTINGS_KEYS.salaryDefaults,
      DEFAULT_HR_SALARY_DEFAULTS,
    );
    const breakdown = computeSalaryBreakdown(toWage, toAccomFlag === "Yes", {
      basic: salaryDefaults.basicPct,
      accom: salaryDefaults.accomPct,
      transp: salaryDefaults.transpPct,
    });
    toBasic = breakdown.basic;
    toAccomAmt = breakdown.accom;
    toTransp = breakdown.transp;
  }

  if (changeVisa) {
    toVisaStatus = normalizeVisaStatus(input.toVisaStatus);
    toVisaExpiry = parseOptionalIsoDate(input.toVisaExpiry);
    if (input.toVisaExpiry?.trim() && !toVisaExpiry) {
      return { ok: false, error: "Enter a valid visa expiry date." };
    }
  }

  const applyPosition = changePosition;
  const applySalary = changeSalary;
  const applyVisa = changeVisa;

  const changeKind: PositionSalaryChangeKind =
    !applyPosition && !applySalary && applyVisa
      ? "visa"
      : applyPosition && applySalary
        ? "both"
        : applyPosition
          ? "position"
          : "salary";

  const updateRow = {
    effective_date: effectiveDate,
    change_kind: changeKind,
    change_visa: applyVisa,
    to_department_id: changePosition ? toDepartmentId : fromDepartmentId,
    to_position_id: changePosition ? toPositionId : fromPositionId,
    to_wage_package: changeSalary ? toWage : fromWage,
    to_basic_salary_60: changeSalary ? toBasic : fromBasic,
    to_accom_all_25: changeSalary ? toAccomAmt : fromAccomAmt,
    to_transp_all_15: changeSalary ? toTransp : fromTransp,
    to_company_accommodation: changeSalary ? toAccomFlag : fromAccomFlag,
    from_visa_status: fromVisaStatus,
    to_visa_status: applyVisa ? toVisaStatus : fromVisaStatus,
    from_visa_expiry: fromVisaExpiry,
    to_visa_expiry: applyVisa ? toVisaExpiry : fromVisaExpiry,
    reason: input.reason.trim(),
    notes: input.notes?.trim() || null,
  };

  const service = createServiceClient();

  const { data: updated, error: updateError } = await service
    .from("hr_staff_position_salary_changes")
    .update(updateRow)
    .eq("id", changeId)
    .eq("venue_id", venue.id)
    .select("*")
    .single();

  if (updateError || !updated) {
    return {
      ok: false,
      error: updateError?.message ?? "Could not update alteration.",
    };
  }

  const { data: latest } = await service
    .from("hr_staff_position_salary_changes")
    .select("id")
    .eq("venue_id", venue.id)
    .eq("staff_id", staffId)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const staffUpdates: Record<string, unknown> = {};
  if (latest?.id === changeId) {
    if (changePosition) {
      staffUpdates.department_id = updateRow.to_department_id;
      staffUpdates.position_id = updateRow.to_position_id;
    }
    if (changeSalary) {
      staffUpdates.wage_package = updateRow.to_wage_package;
      staffUpdates.basic_salary_60 = updateRow.to_basic_salary_60;
      staffUpdates.accom_all_25 = updateRow.to_accom_all_25;
      staffUpdates.transp_all_15 = updateRow.to_transp_all_15;
      staffUpdates.company_accommodation = updateRow.to_company_accommodation;
    }
    if (applyVisa) {
      staffUpdates.visa_status = toVisaStatus;
      staffUpdates.visa_expiry = toVisaExpiry;
    }
    if (Object.keys(staffUpdates).length > 0) {
      const { error: staffError } = await service
        .from("staff")
        .update(staffUpdates)
        .eq("id", staffId)
        .eq("home_venue_id", venue.id);
      if (staffError) return { ok: false, error: staffError.message };
    }
  }

  await writeAuditLog({
    actor_id: user.id,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "staff_position_salary_change",
    entity_id: changeId,
    venue_id: venue.id,
    before: existing,
    after: { ...updateRow, staff_updates: staffUpdates },
  });

  revalidateStaffPaths(staffId);

  const names = await loadLookupNames(supabase, venue.id);
  const item = mapChangeRow(updated as Record<string, unknown>, names);

  return {
    ok: true,
    item,
    staffPatch: {
      department_id: String(
        (staffUpdates.department_id as string | null | undefined) ??
          item.toDepartmentId ??
          "",
      ),
      position_id: String(
        (staffUpdates.position_id as string | null | undefined) ??
          item.toPositionId ??
          "",
      ),
      wage_package:
        item.toWagePackage != null ? String(item.toWagePackage) : "",
      company_accommodation: item.toCompanyAccommodation || "No",
      ...(applyVisa && latest?.id === changeId
        ? {
            visa_status: toVisaStatus ?? "",
            visa_expiry: toVisaExpiry ?? "",
          }
        : {}),
    },
  };
}
