"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { resolveActiveVenue } from "@/lib/venue/active-venue";
import { scopedHrefForVenue } from "@/lib/venue/scope-routing";
import {
  computeProbationEndDate,
  durationExceedsLegalMax,
  PROBATION_MAX_MONTHS,
  suggestProbationStatus,
  tallyProbationScheduleDays,
  type ProbationDurationUnit,
} from "@/lib/hr/probation";
import { parseDate, parseNumber, parseStaffCsv, type ImportStaffRow } from "@/lib/hr/import";
import {
  canAccessSchedules,
  canAccessStaff,
  canAdminLookups,
  canAdminStaff,
  canEditOwnStaff,
  canEditSchedules,
  canEditStaff,
  canSubmitStaff,
  canViewStaff,
  stripSensitiveStaffWrites,
} from "@/lib/hr/permissions";
import {
  listDepartments,
  listEmploymentStatuses,
  listNationalities,
  listPositions,
  listPublicHolidays,
  listStaffScheduleDays,
  listScheduleDaysByDateRange,
  listAttendanceDaysForStaff,
  listAttendancePunchesForStaff,
  countAttendanceForWeekRange,
  getAttendanceDateBounds,
  getHrVenueSetting,
  listWeekSectionAssignments,
  listWeekSectionsRaw,
  findPreviousWeekStartWithSections,
  listFutureWeekStartsWithSections,
  resolveLookupId,
  resolvePositionId,
} from "@/lib/hr/store";
import {
  DEFAULT_HR_EXPIRY_SETTINGS,
  DEFAULT_HR_SALARY_DEFAULTS,
  DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
} from "@/lib/hr/types";
import {
  DEFAULT_SCHEDULE_DAY_LABELS,
  DEFAULT_SCHEDULE_SECTIONS,
  DEFAULT_SHIFT_TEMPLATES,
  deriveScheduleLabelColors,
  isWorkDateAfterTermination,
  normalizeShiftTime,
  postTerminationBlockMessage,
  shiftSpansMidnight,
  type ScheduleDepartmentKey,
  type ScheduleWeekSection,
} from "@/lib/hr/schedules";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getActionAuthContext, diagnosePersistenceAccess } from "@/lib/auth/action-context";
import {
  convertImageToWebp,
  isRasterImageMime,
} from "@/lib/storage/convert-to-webp";

async function getAuthContext() {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) {
    throw new Error(ctx.error);
  }
  return ctx;
}

/** Logged-in diagnostic for production save issues (Settings → Developers). */
export async function diagnoseHrPersistence() {
  return diagnosePersistenceAccess();
}

export async function importStaffFromCsv(csvText: string) {
  const rows = parseStaffCsv(csvText);
  if (rows.length === 0) {
    return { error: "No data rows found in CSV." };
  }
  return importStaffRows(rows);
}

/**
 * Bulk import employee rows from the HR → Settings → Data Management Excel
 * template. Rows are keyed by emp no (idempotent upsert) with lookups resolved
 * by name. Shares the same core as the legacy CSV import.
 */
export async function importEmployeesFromRows(rows: ImportStaffRow[]) {
  if (!rows.length) {
    return { error: "No data rows found in the file." };
  }
  return importStaffRows(rows);
}

async function importStaffRows(rows: ImportStaffRow[]) {
  const { supabase, user, venue, permissions } = await getAuthContext();

  if (!canEditStaff(permissions, venue.id)) {
    return { error: "You do not have permission to import staff." };
  }

  if (venue.is_global) {
    return {
      error: "Import venue staff at a specific venue, not Global.",
    };
  }

  if (rows.length === 0) {
    return { error: "No data rows found." };
  }

  const [departments, positions, statuses, nationalities] = await Promise.all([
    listDepartments(supabase, venue.id),
    listPositions(supabase, venue.id),
    listEmploymentStatuses(supabase),
    listNationalities(supabase),
  ]);

  const service = createServiceClient();
  let inserted = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const empNo = row.emp_no?.trim();
    if (!empNo) {
      errors.push("Skipped row without emp_no.");
      continue;
    }

    const departmentId = resolveLookupId(departments, row.department);
    const statusId = resolveLookupId(statuses, row.status);
    const nationalityId = resolveLookupId(nationalities, row.nationality);
    const positionId = resolvePositionId(
      positions,
      departmentId,
      row.position,
    );

    const firstName = row.first_name || null;
    const lastName = row.last_name || null;
    const fullName =
      row.full_name?.trim() ||
      [firstName, lastName].filter(Boolean).join(" ") ||
      empNo;

    // Only write columns that are present in the uploaded sheet so a partial
    // import never blanks out fields it doesn't include (e.g. columns that were
    // intentionally removed from the Excel template).
    const has = (key: string) =>
      Object.prototype.hasOwnProperty.call(row, key);
    const nameProvided =
      has("full_name") || has("first_name") || has("last_name");

    const payload: Record<string, unknown> = {
      home_venue_id: venue.id,
      emp_no: empNo,
    };

    if (nameProvided) payload.full_name = fullName;
    if (has("first_name")) payload.first_name = firstName;
    if (has("last_name")) payload.last_name = lastName;
    if (has("department")) payload.department_id = departmentId;
    if (has("position")) payload.position_id = positionId;
    if (has("status")) payload.employment_status_id = statusId;
    if (has("nationality")) payload.nationality_id = nationalityId;

    const TEXT_FIELDS = [
      "contact_phone",
      "personal_email",
      "work_email",
      "gender",
      "civil_status",
      "passport_no",
      "eid_no",
      "iban",
      "swift_code",
      "bank_name",
      "wps_employee_id",
      "company_accommodation",
      "insurance_category",
      "contract_kind",
      "visa_status",
      "probation_duration_unit",
      "probation_status",
    ] as const;
    const DATE_FIELDS = [
      "dob",
      "passport_expiry",
      "eid_expiry",
      "visa_expiry",
      "joining_date",
      "termination_date",
      "ohc_date",
      "pic_date",
      "basic_food_safety_date",
      "fire_safety_date",
      "first_aid_date",
      "medical_insurance_issue_date",
      "medical_insurance_expiry_date",
    ] as const;
    const NUMBER_FIELDS = [
      "unpaid_leave_days_total",
      "vacations_entitle",
      "vacations_balance",
      "wage_package",
      "basic_salary_60",
      "accom_all_25",
      "transp_all_15",
      "fly_home_ticket_per_year",
      "provisional_leave",
      "provisional_eosb",
      "visa_expenses",
      "visa_penalties_paid",
      "medical_insurance_value",
      "probation_duration_value",
    ] as const;

    for (const field of TEXT_FIELDS) {
      if (has(field)) payload[field] = row[field] || null;
    }
    for (const field of DATE_FIELDS) {
      if (has(field)) payload[field] = parseDate(row[field]);
    }
    for (const field of NUMBER_FIELDS) {
      if (has(field)) payload[field] = parseNumber(row[field]);
    }

    const { data: existing } = await service
      .from("staff")
      .select("id")
      .eq("home_venue_id", venue.id)
      .eq("emp_no", empNo)
      .maybeSingle();

    if (existing) {
      const { error } = await service
        .from("staff")
        .update(payload)
        .eq("id", existing.id);
      if (error) {
        errors.push(`${empNo}: ${error.message}`);
      } else {
        updated += 1;
        await writeAuditLog({
          actor_id: user.id,
          action: "update",
          module_key: HR_MODULE_KEY,
          entity: "staff",
          entity_id: existing.id,
          venue_id: venue.id,
          after: { emp_no: empNo, source: "import" },
        });
      }
    } else {
      const { data: created, error } = await service
        .from("staff")
        .insert({ full_name: fullName, ...payload, created_by: user.id })
        .select("id")
        .single();
      if (error) {
        errors.push(`${empNo}: ${error.message}`);
      } else {
        inserted += 1;
        await writeAuditLog({
          actor_id: user.id,
          action: "create",
          module_key: HR_MODULE_KEY,
          entity: "staff",
          entity_id: created.id,
          venue_id: venue.id,
          after: { emp_no: empNo, source: "import" },
        });
      }
    }
  }

  revalidatePath("/hr");
  revalidatePath("/hr/staff");
  revalidatePath("/hr/staff/data");
  revalidatePath("/hr/settings/data-management/employees-details");
  revalidatePath("/dashboard");

  return {
    inserted,
    updated,
    total: rows.length,
    errors: errors.length ? errors : undefined,
  };
}

export async function updateStaff(
  staffId: string,
  formData: FormData,
) {
  try {
    return await updateStaffInner(staffId, formData);
  } catch (err) {
    const digest =
      err && typeof err === "object" && "digest" in err
        ? String((err as { digest?: unknown }).digest ?? "")
        : "";
    if (digest.startsWith("NEXT_")) throw err;
    const message =
      err instanceof Error ? err.message : "Could not save staff details.";
    console.error("[hr] updateStaff:", message);
    return { error: message };
  }
}

async function updateStaffInner(
  staffId: string,
  formData: FormData,
) {
  const { supabase, user, venue, permissions } = await getAuthContext();

  const { data: before } = await supabase
    .from("staff")
    .select("*")
    .eq("id", staffId)
    .eq("home_venue_id", venue.id)
    .single();

  if (!before) return { error: "Staff member not found." };

  if (!canEditOwnStaff(permissions, venue.id, before.created_by, user.id)) {
    return { error: "You do not have permission to edit staff." };
  }

  const payload = formDataToStaffPayload(formData);
  const probationError = validateProbationPayload(payload);
  if (probationError) return { error: probationError };

  const updates: Record<string, unknown> = stripSensitiveStaffWrites(
    payload,
    permissions,
    venue.id,
  );
  const service = createServiceClient();

  const photoResult = await resolveStaffPhotoUpdate({
    service,
    venueId: venue.id,
    staffId,
    formData,
    previousUrl: (before as { photo_url?: string | null }).photo_url ?? null,
  });
  if (photoResult.error) return { error: photoResult.error };
  if (photoResult.photo_url !== undefined) {
    updates.photo_url = photoResult.photo_url;
  }

  const { error } = await service
    .from("staff")
    .update(updates)
    .eq("id", staffId);

  if (error) return { error: error.message };

  await writeAuditLog({
    actor_id: user.id,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "staff",
    entity_id: staffId,
    venue_id: venue.id,
    before,
    after: updates,
  });

  revalidatePath(`/hr/${staffId}`);
  revalidatePath("/hr");
  revalidatePath("/hr/staff");
  return { success: true };
}

export async function createStaff(formData: FormData) {
  try {
    return await createStaffInner(formData);
  } catch (err) {
    const digest =
      err && typeof err === "object" && "digest" in err
        ? String((err as { digest?: unknown }).digest ?? "")
        : "";
    if (digest.startsWith("NEXT_")) throw err;
    const message =
      err instanceof Error ? err.message : "Could not create staff member.";
    console.error("[hr] createStaff:", message);
    return { error: message };
  }
}

async function createStaffInner(formData: FormData) {
  const { user, venue, permissions } = await getAuthContext();

  if (!canSubmitStaff(permissions, venue.id)) {
    return { error: "You do not have permission to add staff." };
  }

  if (venue.is_global) {
    return { error: "Add venue staff at a specific venue, not Global." };
  }

  const empNo = String(formData.get("emp_no") ?? "").trim();
  if (!empNo) return { error: "Employee number is required." };

  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!fullName) return { error: "Full name is required." };

  const service = createServiceClient();

  const { data: existing } = await service
    .from("staff")
    .select("id")
    .eq("home_venue_id", venue.id)
    .eq("emp_no", empNo)
    .maybeSingle();
  if (existing) {
    return { error: `Employee number "${empNo}" already exists.` };
  }

  const payload = {
    ...formDataToStaffPayload(formData),
    home_venue_id: venue.id,
    emp_no: empNo,
    full_name: fullName,
    created_by: user.id,
  };

  const probationError = validateProbationPayload(payload);
  if (probationError) return { error: probationError };

  const { data: created, error } = await service
    .from("staff")
    .insert(payload)
    .select("id")
    .single();

  if (error) return { error: error.message };

  const photoResult = await resolveStaffPhotoUpdate({
    service,
    venueId: venue.id,
    staffId: created.id,
    formData,
    previousUrl: null,
  });
  if (photoResult.error) {
    return { error: photoResult.error, id: created.id as string };
  }
  if (photoResult.photo_url) {
    await service
      .from("staff")
      .update({ photo_url: photoResult.photo_url })
      .eq("id", created.id);
  }

  await writeAuditLog({
    actor_id: user.id,
    action: "create",
    module_key: HR_MODULE_KEY,
    entity: "staff",
    entity_id: created.id,
    venue_id: venue.id,
    after: { emp_no: empNo, full_name: fullName, source: "manual" },
  });

  revalidatePath("/hr");
  revalidatePath("/hr/staff");
  revalidatePath("/hr/staff/data");
  revalidatePath("/dashboard");

  return { success: true, id: created.id as string };
}

export async function deleteStaff(staffId: string) {
  const { supabase, user, venue, permissions } = await getAuthContext();

  if (!canAdminStaff(permissions, venue.id)) {
    return { error: "You do not have permission to delete staff." };
  }

  const { data: before } = await supabase
    .from("staff")
    .select("*")
    .eq("id", staffId)
    .eq("home_venue_id", venue.id)
    .single();

  if (!before) return { error: "Staff member not found." };

  const service = createServiceClient();
  const { error } = await service.from("staff").delete().eq("id", staffId);
  if (error) return { error: error.message };

  await writeAuditLog({
    actor_id: user.id,
    action: "delete",
    module_key: HR_MODULE_KEY,
    entity: "staff",
    entity_id: staffId,
    venue_id: venue.id,
    before,
  });

  revalidatePath("/hr");
  revalidatePath("/hr/staff");
  redirect(scopedHrefForVenue(venue, "/hr/staff"));
}

export async function upsertDepartment(formData: FormData): Promise<void> {
  await upsertLookup("departments", formData);
}

export async function upsertPosition(formData: FormData): Promise<void> {
  await upsertLookup("positions", formData);
}

export async function upsertEmploymentStatus(formData: FormData): Promise<void> {
  await upsertLookup("employment_statuses", formData);
}

export async function upsertNationality(formData: FormData): Promise<void> {
  await upsertLookup("nationalities", formData);
}

export async function deleteDepartment(id: string): Promise<void> {
  await deleteLookup("departments", id);
}

export async function deletePosition(id: string): Promise<void> {
  await deleteLookup("positions", id);
}

export async function deleteEmploymentStatus(id: string): Promise<void> {
  await deleteLookup("employment_statuses", id);
}

export async function deleteNationality(id: string): Promise<void> {
  await deleteLookup("nationalities", id);
}

export async function reorderDepartments(orderedIds: string[]): Promise<void> {
  await reorderLookup("departments", orderedIds);
}

export async function reorderPositions(orderedIds: string[]): Promise<void> {
  await reorderLookup("positions", orderedIds);
}

export async function reorderEmploymentStatuses(
  orderedIds: string[],
): Promise<void> {
  await reorderLookup("employment_statuses", orderedIds);
}

export async function upsertWorkingStatus(formData: FormData): Promise<void> {
  await upsertLookup("working_statuses", formData);
}

export async function deleteWorkingStatus(id: string): Promise<void> {
  await deleteLookup("working_statuses", id);
}

export async function reorderWorkingStatuses(
  orderedIds: string[],
): Promise<void> {
  await reorderLookup("working_statuses", orderedIds);
}

export async function reorderNationalities(orderedIds: string[]): Promise<void> {
  await reorderLookup("nationalities", orderedIds);
}

export async function upsertCivilStatus(formData: FormData): Promise<void> {
  await upsertLookup("civil_statuses", formData);
}

export async function deleteCivilStatus(id: string): Promise<void> {
  await deleteLookup("civil_statuses", id);
}

export async function reorderCivilStatuses(orderedIds: string[]): Promise<void> {
  await reorderLookup("civil_statuses", orderedIds);
}

export async function upsertGender(formData: FormData): Promise<void> {
  await upsertLookup("genders", formData);
}

export async function deleteGender(id: string): Promise<void> {
  await deleteLookup("genders", id);
}

export async function reorderGenders(orderedIds: string[]): Promise<void> {
  await reorderLookup("genders", orderedIds);
}

export async function upsertInsuranceCategory(
  formData: FormData,
): Promise<void> {
  await upsertLookup("insurance_categories", formData);
}

export async function deleteInsuranceCategory(id: string): Promise<void> {
  await deleteLookup("insurance_categories", id);
}

export async function reorderInsuranceCategories(
  orderedIds: string[],
): Promise<void> {
  await reorderLookup("insurance_categories", orderedIds);
}

export async function upsertCertificationType(
  formData: FormData,
): Promise<void> {
  await upsertLookup("certification_types", formData);
}

export async function deleteCertificationType(id: string): Promise<void> {
  await deleteLookup("certification_types", id);
}

export async function reorderCertificationTypes(
  orderedIds: string[],
): Promise<void> {
  await reorderLookup("certification_types", orderedIds);
}

type LookupTable =
  | "departments"
  | "positions"
  | "employment_statuses"
  | "working_statuses"
  | "nationalities"
  | "civil_statuses"
  | "genders"
  | "insurance_categories"
  | "certification_types";

type LookupTableConfig = {
  /** Adds venue_id to the payload (venue-scoped lookups). */
  venueScoped?: boolean;
  /** Required foreign-key fields read from the form (e.g. department_id). */
  refFields?: string[];
  /** Numeric fields read from the form (parsed, defaulting to 0). */
  numericFields?: string[];
};

const LOOKUP_CONFIG: Record<LookupTable, LookupTableConfig> = {
  departments: { venueScoped: true },
  positions: { venueScoped: true, refFields: ["department_id"] },
  employment_statuses: {},
  working_statuses: {},
  nationalities: { numericFields: ["fly_home_ticket_value"] },
  civil_statuses: {},
  genders: {},
  insurance_categories: { numericFields: ["default_medical_value"] },
  certification_types: { numericFields: ["renewal_months", "lead_days"] },
};

async function upsertLookup(table: LookupTable, formData: FormData) {
  const { user, venue, permissions } = await getAuthContext();

  if (!canAdminLookups(permissions, venue.id)) {
    return;
  }

  const id = (formData.get("id") as string | null) || null;
  const name = (formData.get("name") as string)?.trim();
  if (!name) return;

  const config = LOOKUP_CONFIG[table];
  const payload: Record<string, unknown> = {
    name,
    sort_order: Number(formData.get("sort_order") ?? 0),
  };

  if (config.venueScoped) {
    payload.venue_id = venue.id;
  }
  for (const field of config.refFields ?? []) {
    const value = (formData.get(field) as string) || null;
    if (!value) return;
    payload[field] = value;
  }
  for (const field of config.numericFields ?? []) {
    payload[field] = parseNumber((formData.get(field) as string) ?? "") ?? 0;
  }

  const service = createServiceClient();
  const { error } = id
    ? await service.from(table).update(payload).eq("id", id)
    : await service.from(table).insert(payload);
  if (error) {
    console.error(`[hr] ${table} upsert failed:`, error.message);
    return;
  }

  await writeAuditLog({
    actor_id: user.id,
    action: id ? "update" : "create",
    module_key: HR_MODULE_KEY,
    entity: table,
    entity_id: id ?? name,
    venue_id: venue.id,
    after: { name },
  });

  revalidatePath("/hr/settings", "layout");
}

async function deleteLookup(table: LookupTable, id: string) {
  const { user, venue, permissions } = await getAuthContext();

  if (!canAdminLookups(permissions, venue.id)) {
    return;
  }
  if (!id) return;

  const service = createServiceClient();
  const { error } = await service.from(table).delete().eq("id", id);
  if (error) {
    console.error(`[hr] ${table} delete failed:`, error.message);
    return;
  }

  await writeAuditLog({
    actor_id: user.id,
    action: "delete",
    module_key: HR_MODULE_KEY,
    entity: table,
    entity_id: id,
    venue_id: venue.id,
  });

  revalidatePath("/hr/settings", "layout");
}

async function reorderLookup(table: LookupTable, orderedIds: string[]) {
  const { venue, permissions } = await getAuthContext();

  if (!canAdminLookups(permissions, venue.id)) {
    return;
  }
  if (!orderedIds.length) return;

  const service = createServiceClient();

  await Promise.all(
    orderedIds.map((id, index) =>
      service
        .from(table)
        .update({ sort_order: index + 1 })
        .eq("id", id),
    ),
  );

  revalidatePath("/hr/settings", "layout");
}

async function saveHrVenueSetting(
  key: string,
  value: Record<string, unknown>,
) {
  const { user, venue, permissions } = await getAuthContext();

  if (!canAdminLookups(permissions, venue.id)) {
    return;
  }

  const service = createServiceClient();
  const { error } = await service.from("hr_venue_settings").upsert(
    {
      venue_id: venue.id,
      key,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "venue_id,key" },
  );
  if (error) {
    console.error(`[hr] settings "${key}" save failed:`, error.message);
    return;
  }

  await writeAuditLog({
    actor_id: user.id,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "hr_venue_settings",
    entity_id: key,
    venue_id: venue.id,
    after: value,
  });

  revalidatePath("/hr/settings", "layout");
  revalidatePath("/hr");
}

function num(formData: FormData, key: string, fallback: number): number {
  const parsed = parseNumber((formData.get(key) as string) ?? "");
  return parsed ?? fallback;
}

export async function saveHrExpirySettings(formData: FormData): Promise<void> {
  const reminderLeadDays = String(formData.get("reminder_lead_days") ?? "")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a);

  await saveHrVenueSetting(HR_SETTINGS_KEYS.expiry, {
    displayWindowDays: num(
      formData,
      "display_window_days",
      DEFAULT_HR_EXPIRY_SETTINGS.displayWindowDays,
    ),
    reminderLeadDays: reminderLeadDays.length
      ? reminderLeadDays
      : DEFAULT_HR_EXPIRY_SETTINGS.reminderLeadDays,
  });
}

export async function saveHrSalaryDefaults(formData: FormData): Promise<void> {
  await saveHrVenueSetting(HR_SETTINGS_KEYS.salaryDefaults, {
    basicPct: num(formData, "basic_pct", DEFAULT_HR_SALARY_DEFAULTS.basicPct),
    accomPct: num(formData, "accom_pct", DEFAULT_HR_SALARY_DEFAULTS.accomPct),
    transpPct: num(formData, "transp_pct", DEFAULT_HR_SALARY_DEFAULTS.transpPct),
    annualLeaveDays: num(
      formData,
      "annual_leave_days",
      DEFAULT_HR_SALARY_DEFAULTS.annualLeaveDays,
    ),
    eosbDaysPerYear: num(
      formData,
      "eosb_days_per_year",
      DEFAULT_HR_SALARY_DEFAULTS.eosbDaysPerYear,
    ),
  });
}

export async function saveHrNotificationSettings(
  formData: FormData,
): Promise<void> {
  await saveHrVenueSetting(HR_SETTINGS_KEYS.notifications, {
    expiryEmailsEnabled: formData.get("expiry_emails_enabled") === "on",
    newStaffEnabled: formData.get("new_staff_enabled") === "on",
    terminationEnabled: formData.get("termination_enabled") === "on",
    recipientRoles: String(formData.get("recipient_roles") ?? "")
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean),
  });
}

function validateProbationPayload(payload: {
  joining_date?: string | null;
  probation_duration_value?: number | null;
  probation_duration_unit?: string | null;
}): string | null {
  const value = payload.probation_duration_value;
  const unit = payload.probation_duration_unit;
  if (value == null && !unit) return null;
  if (value != null && value <= 0) {
    return "Probation period must be greater than zero.";
  }
  if (value != null && !unit) {
    return "Select days or months for the probation period.";
  }
  if (
    durationExceedsLegalMax(
      payload.joining_date,
      value,
      unit as ProbationDurationUnit | null,
    )
  ) {
    return `Probation duration cannot exceed ${PROBATION_MAX_MONTHS} calendar months from the employment commencement date.`;
  }
  return null;
}

function formDataToStaffPayload(formData: FormData) {
  const str = (key: string) => {
    const v = formData.get(key);
    return v && String(v).trim() ? String(v).trim() : null;
  };

  const joiningDate = parseDate(str("joining_date") ?? undefined);
  const durationValue = parseNumber(str("probation_duration_value") ?? undefined);
  const durationUnitRaw = str("probation_duration_unit");
  const durationUnit =
    durationUnitRaw === "days" || durationUnitRaw === "months"
      ? durationUnitRaw
      : null;

  let probationStatus = str("probation_status");
  const terminationDate = parseDate(str("termination_date") ?? undefined);

  // Normalize Pending/Expired from dates when not manually Confirmed/Terminated.
  if (joiningDate && durationValue != null && durationUnit) {
    const ends = computeProbationEndDate(joiningDate, durationValue, durationUnit);
    const suggested = suggestProbationStatus({
      legalEndDate: ends.legal,
      terminationDate,
      storedStatus: probationStatus,
    });
    if (
      !probationStatus ||
      probationStatus === "Pending" ||
      probationStatus === "Expired"
    ) {
      probationStatus = suggested;
    }
  }

  return {
    department_id: str("department_id"),
    position_id: str("position_id"),
    employment_status_id: str("employment_status_id"),
    nationality_id: str("nationality_id"),
    first_name: str("first_name"),
    last_name: str("last_name"),
    full_name: str("full_name") ?? "",
    contact_phone: str("contact_phone"),
    personal_email: str("personal_email"),
    work_email: str("work_email"),
    gender: str("gender"),
    civil_status: str("civil_status"),
    dob: parseDate(str("dob") ?? undefined),
    passport_no: str("passport_no"),
    passport_expiry: parseDate(str("passport_expiry") ?? undefined),
    eid_no: str("eid_no"),
    eid_expiry: parseDate(str("eid_expiry") ?? undefined),
    iban: str("iban"),
    swift_code: str("swift_code"),
    bank_name: str("bank_name"),
    wps_employee_id: str("wps_employee_id"),
    joining_date: joiningDate,
    termination_date: terminationDate,
    contract_kind: str("contract_kind"),
    visa_status: str("visa_status"),
    visa_expiry: parseDate(str("visa_expiry") ?? undefined),
    probation_duration_value: durationValue,
    probation_duration_unit: durationUnit,
    probation_status: probationStatus,
    unpaid_leave_days_total: parseNumber(str("unpaid_leave_days_total") ?? undefined),
    vacations_entitle: parseNumber(str("vacations_entitle") ?? undefined),
    vacations_balance: parseNumber(str("vacations_balance") ?? undefined),
    wage_package: parseNumber(str("wage_package") ?? undefined),
    company_accommodation: str("company_accommodation"),
    basic_salary_60: parseNumber(str("basic_salary_60") ?? undefined),
    accom_all_25: parseNumber(str("accom_all_25") ?? undefined),
    transp_all_15: parseNumber(str("transp_all_15") ?? undefined),
    fly_home_ticket_per_year: parseNumber(
      str("fly_home_ticket_per_year") ?? undefined,
    ),
    provisional_leave: parseNumber(str("provisional_leave") ?? undefined),
    provisional_eosb: parseNumber(str("provisional_eosb") ?? undefined),
    visa_expenses: parseNumber(str("visa_expenses") ?? undefined),
    visa_penalties_paid: parseNumber(str("visa_penalties_paid") ?? undefined),
    ohc_date: parseDate(str("ohc_date") ?? undefined),
    pic_date: parseDate(str("pic_date") ?? undefined),
    basic_food_safety_date: parseDate(str("basic_food_safety_date") ?? undefined),
    fire_safety_date: parseDate(str("fire_safety_date") ?? undefined),
    first_aid_date: parseDate(str("first_aid_date") ?? undefined),
    insurance_category: str("insurance_category"),
    medical_insurance_value: parseNumber(str("medical_insurance_value") ?? undefined),
    medical_insurance_issue_date: parseDate(
      str("medical_insurance_issue_date") ?? undefined,
    ),
    medical_insurance_expiry_date: parseDate(
      str("medical_insurance_expiry_date") ?? undefined,
    ),
  };
}

const STAFF_PHOTOS_BUCKET = "staff-photos";
/** Cropped passport photos are small; keep a hard ceiling for safety. */
const STAFF_PHOTO_MAX_BYTES = 512 * 1024;
/** Uncropped source kept for re-framing after save (resized server-side). */
const STAFF_PHOTO_SOURCE_MAX_BYTES = 8 * 1024 * 1024;
const STAFF_PHOTO_SOURCE_MAX_EDGE = 1600;

function staffPhotoObjectPaths(venueId: string, staffId: string) {
  return {
    crop: `${venueId}/${staffId}.webp`,
    source: `${venueId}/${staffId}-source.webp`,
    legacy: [
      `${venueId}/${staffId}.jpg`,
      `${venueId}/${staffId}.jpeg`,
      `${venueId}/${staffId}.png`,
      `${venueId}/${staffId}-source.jpg`,
      `${venueId}/${staffId}-source.jpeg`,
      `${venueId}/${staffId}-source.png`,
    ],
  };
}

async function resolveStaffPhotoUpdate({
  service,
  venueId,
  staffId,
  formData,
  previousUrl,
}: {
  service: ReturnType<typeof createServiceClient>;
  venueId: string;
  staffId: string;
  formData: FormData;
  previousUrl: string | null;
}): Promise<{ photo_url?: string | null; error?: string }> {
  const clear = String(formData.get("photo_clear") ?? "") === "1";
  const photo = formData.get("photo");
  const photoSource = formData.get("photo_source");
  const paths = staffPhotoObjectPaths(venueId, staffId);

  if (photo instanceof File && photo.size > 0) {
    if (photo.size > STAFF_PHOTO_MAX_BYTES) {
      return { error: "Staff photo must be 512 KB or smaller." };
    }
    if (!isRasterImageMime(photo.type)) {
      return { error: "Staff photo must be a PNG, JPEG, or WebP image." };
    }

    // Canonical cropped WebP per staff member — public URL only in the DB.
    const bytes = Buffer.from(await photo.arrayBuffer());

    let webp: Awaited<ReturnType<typeof convertImageToWebp>>;
    try {
      webp = await convertImageToWebp(bytes);
    } catch {
      return { error: "Could not convert staff photo to WebP." };
    }

    // Remove any older format variants so storage stays lean.
    await service.storage
      .from(STAFF_PHOTOS_BUCKET)
      .remove([paths.crop, ...paths.legacy]);

    const { error: uploadError } = await service.storage
      .from(STAFF_PHOTOS_BUCKET)
      .upload(paths.crop, webp.buffer, {
        contentType: webp.contentType,
        upsert: true,
        cacheControl: "31536000",
      });

    if (uploadError) {
      return {
        error:
          "Could not upload staff photo. Ensure the staff-photos storage bucket exists (run db migrations).",
      };
    }

    // Optional uncropped original — enables Adjust after the form is saved.
    if (photoSource instanceof File && photoSource.size > 0) {
      if (photoSource.size > STAFF_PHOTO_SOURCE_MAX_BYTES) {
        return { error: "Staff photo source must be 8 MB or smaller." };
      }
      if (!isRasterImageMime(photoSource.type)) {
        return { error: "Staff photo source must be a PNG, JPEG, or WebP image." };
      }
      try {
        const sourceWebp = await convertImageToWebp(
          Buffer.from(await photoSource.arrayBuffer()),
          {
            maxWidth: STAFF_PHOTO_SOURCE_MAX_EDGE,
            maxHeight: STAFF_PHOTO_SOURCE_MAX_EDGE,
          },
        );
        await service.storage
          .from(STAFF_PHOTOS_BUCKET)
          .upload(paths.source, sourceWebp.buffer, {
            contentType: sourceWebp.contentType,
            upsert: true,
            cacheControl: "31536000",
          });
      } catch {
        return { error: "Could not store staff photo source for re-editing." };
      }
    }

    const { data: publicData } = service.storage
      .from(STAFF_PHOTOS_BUCKET)
      .getPublicUrl(paths.crop);

    // Persist only the public HTTPS URL on staff.photo_url (not binary).
    return { photo_url: `${publicData.publicUrl}?v=${Date.now()}` };
  }

  if (clear) {
    const toRemove = new Set<string>([
      paths.crop,
      paths.source,
      ...paths.legacy,
    ]);
    if (previousUrl) {
      const match = previousUrl.match(/\/staff-photos\/([^?]+)/);
      if (match?.[1]) {
        const objectPath = decodeURIComponent(match[1]);
        toRemove.add(objectPath);
        toRemove.add(objectPath.replace(/(\.[a-z0-9]+)$/i, "-source$1"));
      }
    }
    await service.storage.from(STAFF_PHOTOS_BUCKET).remove([...toRemove]);
    return { photo_url: null };
  }

  return {};
}

export async function getHrAccess() {
  const { venue, permissions } = await getAuthContext();
  return {
    venue,
    canAccess: canAccessStaff(permissions, venue.id),
    canView: canViewStaff(permissions, venue.id),
    canEdit: canEditStaff(permissions, venue.id),
    canAdmin: canAdminStaff(permissions, venue.id),
    canViewSalary: permissions.some(
      (p) =>
        p.module_key === HR_MODULE_KEY &&
        p.feature_key === "salary" &&
        (p.venue_id === null || p.venue_id === venue.id),
    ),
    canAdminLookups: canAdminLookups(permissions, venue.id),
  };
}

export async function listScheduleDaysForRange(params: {
  staffIds: string[];
  fromDate: string;
  toDate: string;
}) {
  const { supabase, venue, permissions } = await getAuthContext();
  if (!canAccessSchedules(permissions, venue.id)) {
    return { error: "No access.", days: [] as const };
  }

  const days = await listStaffScheduleDays(supabase, venue.id, params);
  return { days };
}

/** Roster-derived leave/work tallies for a staff probation window. */
export async function getProbationScheduleTallies(params: {
  staffId: string;
  fromDate: string;
  toDate: string;
}) {
  const { supabase, venue, permissions } = await getAuthContext();
  if (!canAccessStaff(permissions, venue.id)) {
    return { error: "No access." as const, tallies: null };
  }

  const days = await listStaffScheduleDays(supabase, venue.id, {
    staffIds: [params.staffId],
    fromDate: params.fromDate,
    toDate: params.toDate,
  });

  return {
    tallies: tallyProbationScheduleDays(days, {
      from: params.fromDate,
      to: params.toDate,
    }),
  };
}

export async function upsertScheduleDay(params: {
  staffId: string;
  workDate: string;
  labelCode: string | null;
  shiftTemplateId?: string | null;
}) {
  return saveScheduleDayChanges({
    changes: [
      {
        staffId: params.staffId,
        workDate: params.workDate,
        labelCode: params.labelCode,
        shiftTemplateId: params.shiftTemplateId ?? null,
      },
    ],
  });
}

/** Persist mixed draft changes (set label or clear) for many cells. */
export async function saveScheduleDayChanges(params: {
  changes: {
    staffId: string;
    workDate: string;
    labelCode: string | null;
    shiftTemplateId?: string | null;
  }[];
}) {
  try {
    return await saveScheduleDayChangesInner(params);
  } catch (err) {
    const digest =
      err && typeof err === "object" && "digest" in err
        ? String((err as { digest?: unknown }).digest ?? "")
        : "";
    if (digest.startsWith("NEXT_")) throw err;
    const message =
      err instanceof Error ? err.message : "Could not save roster labels.";
    console.error("[hr] saveScheduleDayChanges:", message);
    return { error: message };
  }
}

async function saveScheduleDayChangesInner(params: {
  changes: {
    staffId: string;
    workDate: string;
    labelCode: string | null;
    shiftTemplateId?: string | null;
  }[];
}) {
  const { user, venue, permissions } = await getAuthContext();
  if (!canEditSchedules(permissions, venue.id)) {
    return { error: "You do not have permission to edit schedules." };
  }

  const changes = params.changes.filter(
    (change) =>
      change.staffId && /^\d{4}-\d{2}-\d{2}$/.test(change.workDate),
  );
  if (changes.length === 0) {
    return { error: "No changes to save." };
  }

  const staffIds = [...new Set(changes.map((change) => change.staffId))];
  const needsTemplateCheck = changes.some(
    (change) =>
      (change.labelCode ?? "").trim().toUpperCase() === "SHIFT" &&
      Boolean(change.shiftTemplateId),
  );

  // One round-trip for staff + label codes (+ templates only when needed).
  // Service client after permission check — faster than RLS-scoped user client.
  const service = createServiceClient();
  const [staffResult, labelsResult, templatesResult] = await Promise.all([
    service
      .from("staff")
      .select("id, emp_no, full_name, department_id, termination_date")
      .eq("home_venue_id", venue.id)
      .in("id", staffIds),
    service.from("schedule_day_labels").select("code"),
    needsTemplateCheck
      ? service
          .from("hr_shift_templates")
          .select("id")
          .eq("venue_id", venue.id)
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
  ]);

  if (staffResult.error || !staffResult.data?.length) {
    console.error("[hr] save schedule staff lookup:", staffResult.error?.message);
    return { error: "Could not resolve selected staff." };
  }

  const staffById = new Map(
    staffResult.data.map((row) => [row.id as string, row] as const),
  );

  // Block setting labels after termination (clearing those days is still allowed).
  for (const change of changes) {
    if (change.labelCode === null) continue;
    const staffRow = staffById.get(change.staffId);
    const terminationDate =
      (staffRow?.termination_date as string | null | undefined) ?? null;
    if (
      isWorkDateAfterTermination(change.workDate, terminationDate) &&
      terminationDate
    ) {
      return {
        error: postTerminationBlockMessage({
          terminationDate,
          fullName: (staffRow?.full_name as string | null) ?? null,
          empNo: (staffRow?.emp_no as string | null) ?? null,
          kind: "schedule",
        }),
      };
    }
  }

  const knownCodes = new Set(
    (
      labelsResult.data?.map((row) => row.code as string) ??
      DEFAULT_SCHEDULE_DAY_LABELS.map((label) => label.code)
    ).map((code) => code.toUpperCase()),
  );
  if (labelsResult.error || knownCodes.size === 0) {
    for (const label of DEFAULT_SCHEDULE_DAY_LABELS) {
      knownCodes.add(label.code);
    }
  }

  const knownTemplateIds = new Set(
    (templatesResult.data ?? []).map((row) => row.id as string),
  );

  const toClear = changes.filter((change) => change.labelCode === null);
  const toUpsert = changes.filter((change) => change.labelCode !== null);

  // Batch clears per staff (one delete per person, not per cell).
  if (toClear.length > 0) {
    const datesByStaff = new Map<string, string[]>();
    for (const change of toClear) {
      const dates = datesByStaff.get(change.staffId) ?? [];
      dates.push(change.workDate);
      datesByStaff.set(change.staffId, dates);
    }
    const results = await Promise.all(
      [...datesByStaff.entries()].map(([staffId, dates]) =>
        service
          .from("hr_schedule_days")
          .delete()
          .eq("venue_id", venue.id)
          .eq("staff_id", staffId)
          .in("work_date", dates),
      ),
    );
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      console.error("[hr] save clear schedule:", failed.error.message);
      return { error: "Could not clear one or more days." };
    }
  }

  const changedDates = [...new Set(changes.map((c) => c.workDate))];
  const holidayDates = new Set<string>();
  const needsHolidayLookup =
    toUpsert.some((c) => {
      const code = (c.labelCode ?? "").trim().toUpperCase();
      return (
        code === "OFF" ||
        code === "PH" ||
        code === "PH-REPL" ||
        code === "SHIFT"
      );
    }) || toClear.length > 0;

  if (needsHolidayLookup && changedDates.length > 0) {
    const { data: holidayRows, error: holidayError } = await service
      .from("hr_public_holidays")
      .select("holiday_date")
      .eq("venue_id", venue.id)
      .in("holiday_date", changedDates);
    if (holidayError) {
      console.error("[hr] holiday lookup on save:", holidayError.message);
    } else {
      for (const row of holidayRows ?? []) {
        holidayDates.add(String(row.holiday_date).slice(0, 10));
      }
    }
  }

  if (toUpsert.length > 0) {
    const rows = [];
    const now = new Date().toISOString();
    for (const change of toUpsert) {
      let code = change.labelCode!.trim().toUpperCase();
      // PH-REPL is always valid alongside calendar PH (older label sets may omit it).
      if (
        !knownCodes.has(code) &&
        !(code === "PH-REPL" && knownCodes.has("PH"))
      ) {
        return { error: `Unknown schedule label: ${code}` };
      }
      // On a configured public holiday date:
      // - OFF → PH (taken) — same meaning, keep labels consistent
      // - PH-REPL → PH (cannot take a replacement day on the holiday itself)
      // - PH on a non-holiday → PH-REPL (replacement taken)
      if (code === "OFF" && holidayDates.has(change.workDate)) {
        code = "PH";
      }
      if (code === "PH-REPL" && holidayDates.has(change.workDate)) {
        code = "PH";
      }
      if (code === "PH" && !holidayDates.has(change.workDate)) {
        if (!knownCodes.has("PH-REPL") && !knownCodes.has("PH")) {
          return {
            error: `PH can only be used on a public holiday date (${change.workDate} is not one).`,
          };
        }
        code = "PH-REPL";
      }
      const staffRow = staffById.get(change.staffId);
      const empNo = (staffRow?.emp_no as string | undefined)?.trim();
      if (!staffRow || !empNo) {
        return { error: "One or more staff members are missing Employee ID." };
      }

      let shiftTemplateId =
        code === "SHIFT" ? (change.shiftTemplateId ?? null) : null;
      if (shiftTemplateId && !knownTemplateIds.has(shiftTemplateId)) {
        return { error: "Unknown shift template." };
      }

      rows.push({
        venue_id: venue.id,
        staff_id: change.staffId,
        emp_no: empNo,
        work_date: change.workDate,
        label_code: code,
        shift_template_id: shiftTemplateId,
        department_id: staffRow.department_id ?? null,
        source: "manual" as const,
        updated_by: user.id,
        updated_at: now,
      });
    }

    const { error } = await service
      .from("hr_schedule_days")
      .upsert(rows, { onConflict: "staff_id,work_date" });

    if (error) {
      console.error("[hr] save upsert schedule:", error.message);
      return { error: "Could not save roster labels." };
    }
  }

  // Client already patches the session cache — skip revalidatePath so save
  // does not remount the page. PH-REPL credits resync on Leave Balances load;
  // do not import next/server `after` here (breaks the server-action bundle).

  return { ok: true as const, count: changes.length };
}

/** @deprecated Prefer saveScheduleDayChanges for mixed drafts. */
export async function upsertScheduleDaysBatch(params: {
  cells: { staffId: string; workDate: string }[];
  labelCode: string | null;
  shiftTemplateId?: string | null;
}) {
  return saveScheduleDayChanges({
    changes: params.cells.map((cell) => ({
      ...cell,
      labelCode: params.labelCode,
      shiftTemplateId: params.shiftTemplateId ?? null,
    })),
  });
}

function normalizeHexColor(value: string | null | undefined, fallback: string) {
  const raw = (value ?? "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  return fallback;
}

export async function upsertScheduleDayLabel(formData: FormData): Promise<void> {
  const { user, venue, permissions } = await getAuthContext();
  if (!canAdminLookups(permissions, venue.id)) return;

  const id = (formData.get("id") as string | null) || null;
  const code = ((formData.get("code") as string) || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");
  const abbreviation = ((formData.get("abbreviation") as string) || "").trim();
  const name = ((formData.get("name") as string) || "").trim();
  if (!code || !abbreviation || !name) return;

  const colors = deriveScheduleLabelColors(
    normalizeHexColor(formData.get("bg_color") as string, "#e5e5e5"),
  );

  const payload = {
    code,
    abbreviation,
    name,
    bg_color: colors.bgColor,
    text_color: colors.textColor,
    border_color: colors.borderColor,
    sort_order: Number(formData.get("sort_order") ?? 0),
  };

  const service = createServiceClient();
  const { error } = id
    ? await service.from("schedule_day_labels").update(payload).eq("id", id)
    : await service.from("schedule_day_labels").insert(payload);

  if (error) {
    console.error("[hr] schedule_day_labels upsert failed:", error.message);
    return;
  }

  await writeAuditLog({
    actor_id: user.id,
    action: id ? "update" : "create",
    module_key: HR_MODULE_KEY,
    entity: "schedule_day_labels",
    entity_id: id ?? code,
    venue_id: venue.id,
    after: payload,
  });

  revalidatePath("/hr/settings", "layout");
  revalidatePath("/hr/schedules", "page");
}

export async function deleteScheduleDayLabel(id: string): Promise<void> {
  const { user, venue, permissions } = await getAuthContext();
  if (!canAdminLookups(permissions, venue.id)) return;
  if (!id) return;

  const service = createServiceClient();
  const { error } = await service.from("schedule_day_labels").delete().eq("id", id);
  if (error) {
    console.error("[hr] schedule_day_labels delete failed:", error.message);
    return;
  }

  await writeAuditLog({
    actor_id: user.id,
    action: "delete",
    module_key: HR_MODULE_KEY,
    entity: "schedule_day_labels",
    entity_id: id,
    venue_id: venue.id,
  });

  revalidatePath("/hr/settings", "layout");
  revalidatePath("/hr/schedules", "page");
}

export async function reorderScheduleDayLabels(
  orderedIds: string[],
): Promise<void> {
  const { venue, permissions } = await getAuthContext();
  if (!canAdminLookups(permissions, venue.id)) return;
  if (!orderedIds.length) return;

  const service = createServiceClient();
  await Promise.all(
    orderedIds.map((id, index) =>
      service
        .from("schedule_day_labels")
        .update({ sort_order: index + 1 })
        .eq("id", id),
    ),
  );

  revalidatePath("/hr/settings", "layout");
  revalidatePath("/hr/schedules", "page");
}

export async function upsertShiftTemplate(formData: FormData): Promise<void> {
  const { user, venue, permissions } = await getAuthContext();
  if (!canAdminLookups(permissions, venue.id)) return;

  const id = (formData.get("id") as string | null) || null;
  const name = ((formData.get("name") as string) || "").trim();
  const abbreviation = ((formData.get("abbreviation") as string) || "").trim();
  const startTime = normalizeShiftTime(formData.get("start_time") as string);
  const endTime = normalizeShiftTime(formData.get("end_time") as string);
  if (!name || !abbreviation) return;

  const colors = deriveScheduleLabelColors(
    normalizeHexColor(formData.get("bg_color") as string, "#d1fae5"),
  );
  const spansMidnight =
    formData.get("spans_midnight") === "on" ||
    formData.get("spans_midnight") === "true" ||
    shiftSpansMidnight(startTime, endTime);

  const payload = {
    venue_id: venue.id,
    name,
    abbreviation,
    start_time: startTime,
    end_time: endTime,
    spans_midnight: spansMidnight,
    bg_color: colors.bgColor,
    text_color: colors.textColor,
    border_color: colors.borderColor,
    sort_order: Number(formData.get("sort_order") ?? 0),
    is_active: formData.get("is_active") !== "false",
  };

  const service = createServiceClient();
  const { error } = id
    ? await service
        .from("hr_shift_templates")
        .update(payload)
        .eq("id", id)
        .eq("venue_id", venue.id)
    : await service.from("hr_shift_templates").insert(payload);

  if (error) {
    console.error("[hr] hr_shift_templates upsert failed:", error.message);
    return;
  }

  await writeAuditLog({
    actor_id: user.id,
    action: id ? "update" : "create",
    module_key: HR_MODULE_KEY,
    entity: "hr_shift_templates",
    entity_id: id ?? name,
    venue_id: venue.id,
    after: payload,
  });

  revalidatePath("/hr/settings", "layout");
  revalidatePath("/hr/schedules", "page");
}

export async function deleteShiftTemplate(id: string): Promise<void> {
  const { user, venue, permissions } = await getAuthContext();
  if (!canAdminLookups(permissions, venue.id)) return;
  if (!id) return;

  const service = createServiceClient();
  const { error } = await service
    .from("hr_shift_templates")
    .delete()
    .eq("id", id)
    .eq("venue_id", venue.id);

  if (error) {
    console.error("[hr] hr_shift_templates delete failed:", error.message);
    return;
  }

  await writeAuditLog({
    actor_id: user.id,
    action: "delete",
    module_key: HR_MODULE_KEY,
    entity: "hr_shift_templates",
    entity_id: id,
    venue_id: venue.id,
  });

  revalidatePath("/hr/settings", "layout");
  revalidatePath("/hr/schedules", "page");
}

export async function reorderShiftTemplates(
  orderedIds: string[],
): Promise<void> {
  const { venue, permissions } = await getAuthContext();
  if (!canAdminLookups(permissions, venue.id)) return;
  if (!orderedIds.length) return;

  const service = createServiceClient();
  await Promise.all(
    orderedIds.map((id, index) =>
      service
        .from("hr_shift_templates")
        .update({ sort_order: index + 1 })
        .eq("id", id)
        .eq("venue_id", venue.id),
    ),
  );

  revalidatePath("/hr/settings", "layout");
  revalidatePath("/hr/schedules", "page");
}

/** Seed the four default shifts when a venue has none yet. */
export async function ensureDefaultShiftTemplates(): Promise<void> {
  const { venue, permissions } = await getAuthContext();
  if (!canAdminLookups(permissions, venue.id)) return;

  const service = createServiceClient();
  const { data: existing } = await service
    .from("hr_shift_templates")
    .select("id")
    .eq("venue_id", venue.id)
    .limit(1);

  if (existing && existing.length > 0) return;

  const { error } = await service.from("hr_shift_templates").insert(
    DEFAULT_SHIFT_TEMPLATES.map((template) => ({
      venue_id: venue.id,
      name: template.name,
      abbreviation: template.abbreviation,
      start_time: template.startTime,
      end_time: template.endTime,
      spans_midnight: template.spansMidnight,
      bg_color: template.bgColor,
      text_color: template.textColor,
      border_color: template.borderColor,
      sort_order: template.sortOrder,
      is_active: true,
    })),
  );

  if (error) {
    console.error("[hr] ensureDefaultShiftTemplates:", error.message);
    return;
  }

  revalidatePath("/hr/settings", "layout");
  revalidatePath("/hr/schedules", "page");
}

export async function upsertPublicHoliday(formData: FormData): Promise<void> {
  const { user, venue, permissions } = await getAuthContext();
  if (!canAdminLookups(permissions, venue.id)) return;

  const id = (formData.get("id") as string | null) || null;
  const holidayDate = ((formData.get("holiday_date") as string) || "").trim();
  const name = ((formData.get("name") as string) || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayDate) || !name) return;

  const payload = {
    venue_id: venue.id,
    holiday_date: holidayDate,
    name,
    updated_at: new Date().toISOString(),
  };

  const service = createServiceClient();
  const { error } = id
    ? await service
        .from("hr_public_holidays")
        .update(payload)
        .eq("id", id)
        .eq("venue_id", venue.id)
    : await service.from("hr_public_holidays").upsert(payload, {
        onConflict: "venue_id,holiday_date",
      });

  if (error) {
    console.error("[hr] hr_public_holidays upsert failed:", error.message);
    return;
  }

  await writeAuditLog({
    actor_id: user.id,
    action: id ? "update" : "create",
    module_key: HR_MODULE_KEY,
    entity: "hr_public_holidays",
    entity_id: id ?? holidayDate,
    venue_id: venue.id,
    after: payload,
  });

  revalidatePath("/hr/settings", "layout");
  revalidatePath("/hr/schedules", "page");
  revalidatePath("/hr/attendance/leave", "layout");

  const year = Number(holidayDate.slice(0, 4));
  if (Number.isFinite(year)) {
    const { syncPhReplacementBalancesForYear } = await import(
      "@/lib/actions/hr-leave"
    );
    await syncPhReplacementBalancesForYear(year);
  }
}

export async function deletePublicHoliday(id: string): Promise<void> {
  const { user, venue, permissions } = await getAuthContext();
  if (!canAdminLookups(permissions, venue.id)) return;
  if (!id) return;

  const service = createServiceClient();
  const { data: existing } = await service
    .from("hr_public_holidays")
    .select("id, holiday_date")
    .eq("id", id)
    .eq("venue_id", venue.id)
    .maybeSingle();

  const { error } = await service
    .from("hr_public_holidays")
    .delete()
    .eq("id", id)
    .eq("venue_id", venue.id);

  if (error) {
    console.error("[hr] hr_public_holidays delete failed:", error.message);
    return;
  }

  await writeAuditLog({
    actor_id: user.id,
    action: "delete",
    module_key: HR_MODULE_KEY,
    entity: "hr_public_holidays",
    entity_id: id,
    venue_id: venue.id,
  });

  revalidatePath("/hr/settings", "layout");
  revalidatePath("/hr/schedules", "page");
  revalidatePath("/hr/attendance/leave", "layout");

  const holidayDate = String(existing?.holiday_date ?? "").slice(0, 10);
  const year = Number(holidayDate.slice(0, 4));
  if (Number.isFinite(year) && year > 0) {
    const { syncPhReplacementBalancesForYear } = await import(
      "@/lib/actions/hr-leave"
    );
    await syncPhReplacementBalancesForYear(year);
  }
}

/** Client-safe list of public holiday dates for a date range (schedules highlight). */
export async function listPublicHolidaysForRange(params: {
  fromDate: string;
  toDate: string;
}) {
  const { supabase, venue, permissions } = await getAuthContext();
  if (
    !canAccessSchedules(permissions, venue.id) &&
    !canAdminLookups(permissions, venue.id)
  ) {
    return { error: "No access.", holidays: [] as const };
  }

  const holidays = await listPublicHolidays(supabase, venue.id, {
    fromDate: params.fromDate,
    toDate: params.toDate,
  });

  return { holidays: holidays ?? [] };
}

const DEPARTMENT_KEYS = new Set(["kitchen", "bar", "floor", "office"]);

function isDepartmentKey(value: string): value is ScheduleDepartmentKey {
  return DEPARTMENT_KEYS.has(value);
}

function isWeekStart(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function loadWeekSectionsPayload(
  supabase: Awaited<ReturnType<typeof createClient>>,
  venueId: string,
  departmentKey: ScheduleDepartmentKey,
  weekStart: string,
): Promise<ScheduleWeekSection[]> {
  const [sections, assignments] = await Promise.all([
    listWeekSectionsRaw(supabase, venueId, departmentKey, weekStart),
    listWeekSectionAssignments(supabase, venueId, departmentKey, weekStart),
  ]);

  if (!sections) return [];

  const staffBySection = new Map<string, string[]>();
  for (const assignment of assignments ?? []) {
    const list = staffBySection.get(assignment.sectionId) ?? [];
    list.push(assignment.staffId);
    staffBySection.set(assignment.sectionId, list);
  }

  return sections.map((section) => ({
    id: section.id,
    name: section.name,
    sortOrder: section.sortOrder,
    staffIds: staffBySection.get(section.id) ?? [],
  }));
}

type WeekSectionSnapshot = {
  id: string;
  name: string;
  sortOrder: number;
};

type WeekAssignmentSnapshot = {
  sectionId: string;
  staffId: string;
  sortOrder: number;
};

/** Copy section names/order + staff placements from one week onto another. */
async function copyWeekSectionsSnapshot(params: {
  venueId: string;
  departmentKey: ScheduleDepartmentKey;
  fromWeekStart: string;
  toWeekStart: string;
  replace?: boolean;
}) {
  const {
    venueId,
    departmentKey,
    fromWeekStart,
    toWeekStart,
    replace = false,
  } = params;
  const service = createServiceClient();
  const now = new Date().toISOString();

  const [sourceSections, sourceAssignments] = await Promise.all([
    listWeekSectionsRaw(service, venueId, departmentKey, fromWeekStart),
    listWeekSectionAssignments(service, venueId, departmentKey, fromWeekStart),
  ]);

  // Null means the read failed; empty array is a valid "clear future weeks" snapshot.
  if (sourceSections === null) return false;

  if (replace) {
    const { error: deleteError } = await service
      .from("hr_schedule_week_sections")
      .delete()
      .eq("venue_id", venueId)
      .eq("department_key", departmentKey)
      .eq("week_start", toWeekStart);
    if (deleteError) {
      console.error("[hr] replace week sections:", deleteError.message);
      return false;
    }
  }

  if (sourceSections.length === 0) {
    return replace;
  }

  const { data: inserted, error } = await service
    .from("hr_schedule_week_sections")
    .insert(
      sourceSections.map((section: WeekSectionSnapshot) => ({
        venue_id: venueId,
        department_key: departmentKey,
        week_start: toWeekStart,
        name: section.name,
        sort_order: section.sortOrder,
        updated_at: now,
      })),
    )
    .select("id, name, sort_order");

  if (error || !inserted) {
    console.error("[hr] copy week sections:", error?.message);
    return false;
  }

  const oldIdByName = new Map(
    sourceSections.map((section) => [section.name, section.id] as const),
  );
  const newIdByOldId = new Map<string, string>();
  for (const row of inserted) {
    const oldId = oldIdByName.get(row.name as string);
    if (oldId) newIdByOldId.set(oldId, row.id as string);
  }

  const assignmentRows = ((sourceAssignments ?? []) as WeekAssignmentSnapshot[])
    .map((assignment) => {
      const sectionId = newIdByOldId.get(assignment.sectionId);
      if (!sectionId) return null;
      return {
        venue_id: venueId,
        department_key: departmentKey,
        week_start: toWeekStart,
        section_id: sectionId,
        staff_id: assignment.staffId,
        sort_order: assignment.sortOrder ?? 0,
        updated_at: now,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (assignmentRows.length > 0) {
    const { error: assignError } = await service
      .from("hr_schedule_section_assignments")
      .insert(assignmentRows);
    if (assignError) {
      console.error("[hr] copy week assignments:", assignError.message);
      return false;
    }
  }

  return true;
}

/**
 * Push the edited week's section board (order + staff) onto every already-seeded
 * upcoming week so changes stick forward until someone edits a later week.
 */
async function propagateWeekSectionsForward(params: {
  venueId: string;
  departmentKey: ScheduleDepartmentKey;
  sourceWeekStart: string;
}) {
  const { venueId, departmentKey, sourceWeekStart } = params;
  const service = createServiceClient();
  const futureWeeks = await listFutureWeekStartsWithSections(
    service,
    venueId,
    departmentKey,
    sourceWeekStart,
  );
  if (futureWeeks.length === 0) return;

  for (const toWeekStart of futureWeeks) {
    await copyWeekSectionsSnapshot({
      venueId,
      departmentKey,
      fromWeekStart: sourceWeekStart,
      toWeekStart,
      replace: true,
    });
  }
}

async function seedWeekFromPreviousOrDefaults(params: {
  venueId: string;
  departmentKey: ScheduleDepartmentKey;
  weekStart: string;
}) {
  const { venueId, departmentKey, weekStart } = params;
  const service = createServiceClient();

  const existing = await listWeekSectionsRaw(
    service,
    venueId,
    departmentKey,
    weekStart,
  );
  if (existing && existing.length > 0) return;

  const previousWeek = await findPreviousWeekStartWithSections(
    service,
    venueId,
    departmentKey,
    weekStart,
  );

  if (previousWeek) {
    const copied = await copyWeekSectionsSnapshot({
      venueId,
      departmentKey,
      fromWeekStart: previousWeek,
      toWeekStart: weekStart,
    });
    if (copied) return;
  }

  const now = new Date().toISOString();
  const defaults = DEFAULT_SCHEDULE_SECTIONS[departmentKey];
  const { error } = await service.from("hr_schedule_week_sections").insert(
    defaults.map((name, index) => ({
      venue_id: venueId,
      department_key: departmentKey,
      week_start: weekStart,
      name,
      sort_order: index + 1,
      updated_at: now,
    })),
  );
  if (error) {
    console.error("[hr] seed default week sections:", error.message);
  }
}

/** Load week sections; seeds from prior week or department defaults when empty. */
export async function listWeekSections(params: {
  departmentKey: string;
  weekStart: string;
}) {
  const { supabase, venue, permissions } = await getAuthContext();
  if (!canAccessSchedules(permissions, venue.id)) {
    return { error: "No access.", sections: [] as ScheduleWeekSection[] };
  }
  if (!isDepartmentKey(params.departmentKey) || !isWeekStart(params.weekStart)) {
    return {
      error: "Invalid week or department.",
      sections: [] as ScheduleWeekSection[],
    };
  }

  // Prefer a single read path when the week is already seeded.
  const existing = await loadWeekSectionsPayload(
    supabase,
    venue.id,
    params.departmentKey,
    params.weekStart,
  );
  if (existing.length > 0) {
    return { sections: existing };
  }

  await seedWeekFromPreviousOrDefaults({
    venueId: venue.id,
    departmentKey: params.departmentKey,
    weekStart: params.weekStart,
  });

  const sections = await loadWeekSectionsPayload(
    supabase,
    venue.id,
    params.departmentKey,
    params.weekStart,
  );
  return { sections };
}

/**
 * Single round-trip for schedule roster cells (+ optional section bands).
 * Loads the whole venue week via (venue_id, work_date) — much faster than a
 * large staff_id IN list — so every department tab can paint from one cache.
 */
export async function loadSchedulesWeekData(params: {
  staffIds?: string[];
  fromDate: string;
  toDate: string;
  departmentKey?: string | null;
  weekStart?: string | null;
  includeSections?: boolean;
}) {
  try {
    const { venue, permissions } = await getAuthContext();
    if (!canAccessSchedules(permissions, venue.id)) {
      return {
        error: "No access.",
        days: [] as Awaited<ReturnType<typeof listScheduleDaysByDateRange>>,
        sections: [] as ScheduleWeekSection[],
        weekComplete: false,
      };
    }

    const includeSections =
      Boolean(params.includeSections) &&
      Boolean(params.departmentKey) &&
      Boolean(params.weekStart) &&
      isDepartmentKey(params.departmentKey!) &&
      isWeekStart(params.weekStart!);

    // Prefer the venue+date index over filtering by every staff UUID.
    // Service client after permission check — week loads are RLS-heavy otherwise.
    const service = createServiceClient();
    const daysPromise = listScheduleDaysByDateRange(service, venue.id, {
      fromDate: params.fromDate,
      toDate: params.toDate,
    });

    if (!includeSections) {
      const days = await daysPromise;
      return { days, sections: [] as ScheduleWeekSection[], weekComplete: true };
    }

    const departmentKey = params.departmentKey as ScheduleDepartmentKey;
    const weekStart = params.weekStart as string;

    const existingPromise = loadWeekSectionsPayload(
      service,
      venue.id,
      departmentKey,
      weekStart,
    );

    const [days, existing] = await Promise.all([daysPromise, existingPromise]);
    if (existing.length > 0) {
      return { days, sections: existing, weekComplete: true };
    }

    await seedWeekFromPreviousOrDefaults({
      venueId: venue.id,
      departmentKey,
      weekStart,
    });

    const sections = await loadWeekSectionsPayload(
      service,
      venue.id,
      departmentKey,
      weekStart,
    );
    return { days, sections, weekComplete: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load schedule data.";
    console.error("[hr] loadSchedulesWeekData:", message);
    return {
      error: message,
      days: [] as Awaited<ReturnType<typeof listScheduleDaysByDateRange>>,
      sections: [] as ScheduleWeekSection[],
      weekComplete: false,
    };
  }
}

/** Fingerprint clock-in/out for the schedule roster grid. */
export async function loadSchedulesWeekAttendance(params: {
  staffIds: string[];
  empNos?: string[];
  fromDate: string;
  toDate: string;
}) {
  const { supabase, venue, permissions } = await getAuthContext();
  if (!canAccessSchedules(permissions, venue.id)) {
    return {
      error: "No access.",
      days: [] as Awaited<ReturnType<typeof listAttendanceDaysForStaff>>,
      punches: [] as Awaited<ReturnType<typeof listAttendancePunchesForStaff>>,
      coverage: { minWorkDate: null, maxWorkDate: null },
      weekTotals: { dayCount: 0, punchCount: 0 },
      timezone: DEFAULT_HR_ATTENDANCE_IMPORT_RULES.timezone,
      overnightCutoffTime: DEFAULT_HR_ATTENDANCE_IMPORT_RULES.overnightCutoffTime,
    };
  }

  const staffIds = [...new Set(params.staffIds.filter(Boolean))];
  const empNos = [...new Set((params.empNos ?? []).map((e) => e.trim()).filter(Boolean))];
  if (staffIds.length === 0 && empNos.length === 0) {
    return {
      days: [] as Awaited<ReturnType<typeof listAttendanceDaysForStaff>>,
      punches: [] as Awaited<ReturnType<typeof listAttendancePunchesForStaff>>,
      coverage: { minWorkDate: null, maxWorkDate: null },
      weekTotals: { dayCount: 0, punchCount: 0 },
      timezone: DEFAULT_HR_ATTENDANCE_IMPORT_RULES.timezone,
      overnightCutoffTime: DEFAULT_HR_ATTENDANCE_IMPORT_RULES.overnightCutoffTime,
    };
  }

  const importRules = await getHrVenueSetting(
    supabase,
    venue.id,
    HR_SETTINGS_KEYS.attendanceImportRules,
    DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
  );

  // Use date bounds only — full coverage pages every historical day (~10s).
  const [days, punches, coverage, weekTotals] = await Promise.all([
    listAttendanceDaysForStaff(supabase, venue.id, {
      staffIds,
      empNos,
      fromDate: params.fromDate,
      toDate: params.toDate,
    }),
    listAttendancePunchesForStaff(supabase, venue.id, {
      staffIds,
      empNos,
      fromDate: params.fromDate,
      toDate: params.toDate,
      timeZone: importRules.timezone,
    }),
    getAttendanceDateBounds(supabase, venue.id),
    countAttendanceForWeekRange(
      supabase,
      venue.id,
      params.fromDate,
      params.toDate,
    ),
  ]);

  return {
    days,
    punches,
    coverage,
    weekTotals,
    timezone: importRules.timezone,
    overnightCutoffTime: importRules.overnightCutoffTime,
  };
}

export async function renameWeekSection(params: {
  sectionId: string;
  name: string;
}) {
  const { supabase, venue, permissions } = await getAuthContext();
  if (!canEditSchedules(permissions, venue.id)) {
    return { error: "You do not have permission to edit sections." };
  }

  const name = params.name.trim();
  if (!params.sectionId || !name) {
    return { error: "Section name is required." };
  }

  const { data: existing, error: lookupError } = await supabase
    .from("hr_schedule_week_sections")
    .select("department_key, week_start")
    .eq("id", params.sectionId)
    .eq("venue_id", venue.id)
    .maybeSingle();

  if (lookupError || !existing) {
    return { error: "Section not found." };
  }

  const { error } = await supabase
    .from("hr_schedule_week_sections")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", params.sectionId)
    .eq("venue_id", venue.id);

  if (error) {
    console.error("[hr] renameWeekSection:", error.message);
    return {
      error:
        error.code === "23505"
          ? "A section with that name already exists this week."
          : "Could not rename section.",
    };
  }

  if (isDepartmentKey(existing.department_key as string)) {
    await propagateWeekSectionsForward({
      venueId: venue.id,
      departmentKey: existing.department_key as ScheduleDepartmentKey,
      sourceWeekStart: existing.week_start as string,
    });
  }

  revalidatePath("/hr/schedules", "page");
  return { ok: true as const };
}

export async function addWeekSection(params: {
  departmentKey: string;
  weekStart: string;
  name: string;
}) {
  const { supabase, venue, permissions } = await getAuthContext();
  if (!canEditSchedules(permissions, venue.id)) {
    return { error: "You do not have permission to edit sections." };
  }
  if (!isDepartmentKey(params.departmentKey) || !isWeekStart(params.weekStart)) {
    return { error: "Invalid week or department." };
  }

  const name = params.name.trim();
  if (!name) return { error: "Section name is required." };

  const existing = await listWeekSectionsRaw(
    supabase,
    venue.id,
    params.departmentKey,
    params.weekStart,
  );
  const sortOrder = (existing?.length ?? 0) + 1;

  const { data, error } = await supabase
    .from("hr_schedule_week_sections")
    .insert({
      venue_id: venue.id,
      department_key: params.departmentKey,
      week_start: params.weekStart,
      name,
      sort_order: sortOrder,
      updated_at: new Date().toISOString(),
    })
    .select("id, name, sort_order")
    .maybeSingle();

  if (error || !data) {
    console.error("[hr] addWeekSection:", error?.message);
    return {
      error:
        error?.code === "23505"
          ? "A section with that name already exists this week."
          : "Could not add section.",
    };
  }

  await propagateWeekSectionsForward({
    venueId: venue.id,
    departmentKey: params.departmentKey,
    sourceWeekStart: params.weekStart,
  });

  revalidatePath("/hr/schedules", "page");
  return {
    ok: true as const,
    section: {
      id: data.id as string,
      name: data.name as string,
      sortOrder: data.sort_order as number,
      staffIds: [] as string[],
    } satisfies ScheduleWeekSection,
  };
}

export async function deleteWeekSection(params: { sectionId: string }) {
  const { supabase, venue, permissions } = await getAuthContext();
  if (!canEditSchedules(permissions, venue.id)) {
    return { error: "You do not have permission to edit sections." };
  }
  if (!params.sectionId) return { error: "Missing section." };

  const { data: existing, error: lookupError } = await supabase
    .from("hr_schedule_week_sections")
    .select("department_key, week_start")
    .eq("id", params.sectionId)
    .eq("venue_id", venue.id)
    .maybeSingle();

  if (lookupError || !existing) {
    return { error: "Section not found." };
  }

  const { error } = await supabase
    .from("hr_schedule_week_sections")
    .delete()
    .eq("id", params.sectionId)
    .eq("venue_id", venue.id);

  if (error) {
    console.error("[hr] deleteWeekSection:", error.message);
    return { error: "Could not delete section." };
  }

  if (isDepartmentKey(existing.department_key as string)) {
    await propagateWeekSectionsForward({
      venueId: venue.id,
      departmentKey: existing.department_key as ScheduleDepartmentKey,
      sourceWeekStart: existing.week_start as string,
    });
  }

  revalidatePath("/hr/schedules", "page");
  return { ok: true as const };
}

export async function reorderWeekSections(params: {
  departmentKey: string;
  weekStart: string;
  orderedIds: string[];
}) {
  const { supabase, venue, permissions } = await getAuthContext();
  if (!canEditSchedules(permissions, venue.id)) {
    return { error: "You do not have permission to edit sections." };
  }
  if (
    !isDepartmentKey(params.departmentKey) ||
    !isWeekStart(params.weekStart) ||
    params.orderedIds.length === 0
  ) {
    return { error: "Invalid reorder." };
  }

  const now = new Date().toISOString();
  const results = await Promise.all(
    params.orderedIds.map((id, index) =>
      supabase
        .from("hr_schedule_week_sections")
        .update({ sort_order: index + 1, updated_at: now })
        .eq("id", id)
        .eq("venue_id", venue.id)
        .eq("department_key", params.departmentKey)
        .eq("week_start", params.weekStart),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    console.error("[hr] reorderWeekSections:", failed.error.message);
    return { error: "Could not reorder sections." };
  }

  await propagateWeekSectionsForward({
    venueId: venue.id,
    departmentKey: params.departmentKey,
    sourceWeekStart: params.weekStart,
  });

  revalidatePath("/hr/schedules", "page");
  return { ok: true as const };
}

export async function moveStaffToSection(params: {
  departmentKey: string;
  weekStart: string;
  staffId: string;
  sectionId: string | null;
  /** Full staff order for the destination section after this placement. */
  orderedStaffIds?: string[];
}) {
  const { supabase, venue, permissions } = await getAuthContext();
  if (!canEditSchedules(permissions, venue.id)) {
    return { error: "You do not have permission to edit sections." };
  }
  if (
    !isDepartmentKey(params.departmentKey) ||
    !isWeekStart(params.weekStart) ||
    !params.staffId
  ) {
    return { error: "Invalid move." };
  }

  const { departmentKey, weekStart, staffId, sectionId } = params;
  const now = new Date().toISOString();

  if (sectionId === null) {
    const { error } = await supabase
      .from("hr_schedule_section_assignments")
      .delete()
      .eq("venue_id", venue.id)
      .eq("department_key", departmentKey)
      .eq("week_start", weekStart)
      .eq("staff_id", staffId);

    if (error) {
      console.error("[hr] unassign section staff:", error.message);
      return { error: "Could not move staff." };
    }

    await propagateWeekSectionsForward({
      venueId: venue.id,
      departmentKey,
      sourceWeekStart: weekStart,
    });

    revalidatePath("/hr/schedules", "page");
    return { ok: true as const };
  }

  const { data: section, error: sectionError } = await supabase
    .from("hr_schedule_week_sections")
    .select("id")
    .eq("id", sectionId)
    .eq("venue_id", venue.id)
    .eq("department_key", departmentKey)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (sectionError || !section) {
    return { error: "Section not found for this week." };
  }

  const orderedStaffIds = params.orderedStaffIds?.length
    ? [...new Set(params.orderedStaffIds)]
    : null;

  if (orderedStaffIds && !orderedStaffIds.includes(staffId)) {
    return { error: "Invalid staff order." };
  }

  // Load current order when appending (no explicit order provided).
  let finalOrder = orderedStaffIds;
  if (!finalOrder) {
    const current = await listWeekSectionAssignments(
      supabase,
      venue.id,
      departmentKey,
      weekStart,
    );
    const without = (current ?? [])
      .filter((row) => row.sectionId === sectionId && row.staffId !== staffId)
      .map((row) => row.staffId);
    finalOrder = [...without, staffId];
  }

  const { error } = await supabase.from("hr_schedule_section_assignments").upsert(
    {
      venue_id: venue.id,
      department_key: departmentKey,
      week_start: weekStart,
      section_id: sectionId,
      staff_id: staffId,
      sort_order: finalOrder.indexOf(staffId) + 1,
      updated_at: now,
    },
    { onConflict: "venue_id,department_key,week_start,staff_id" },
  );

  if (error) {
    console.error("[hr] moveStaffToSection:", error.message);
    return { error: "Could not move staff." };
  }

  const reorderResults = await Promise.all(
    finalOrder.map((id, index) =>
      supabase
        .from("hr_schedule_section_assignments")
        .update({ sort_order: index + 1, updated_at: now })
        .eq("venue_id", venue.id)
        .eq("department_key", departmentKey)
        .eq("week_start", weekStart)
        .eq("section_id", sectionId)
        .eq("staff_id", id),
    ),
  );
  const reorderFailed = reorderResults.find((result) => result.error);
  if (reorderFailed?.error) {
    console.error("[hr] reorder section staff:", reorderFailed.error.message);
    return { error: "Could not reorder staff." };
  }

  await propagateWeekSectionsForward({
    venueId: venue.id,
    departmentKey,
    sourceWeekStart: weekStart,
  });

  revalidatePath("/hr/schedules", "page");
  return { ok: true as const };
}

/** Reorder staff already in a section (does not change section assignment). */
export async function reorderSectionStaff(params: {
  departmentKey: string;
  weekStart: string;
  sectionId: string;
  orderedStaffIds: string[];
}) {
  const { supabase, venue, permissions } = await getAuthContext();
  if (!canEditSchedules(permissions, venue.id)) {
    return { error: "You do not have permission to edit sections." };
  }
  if (
    !isDepartmentKey(params.departmentKey) ||
    !isWeekStart(params.weekStart) ||
    !params.sectionId ||
    params.orderedStaffIds.length === 0
  ) {
    return { error: "Invalid reorder." };
  }

  const now = new Date().toISOString();
  const orderedIds = [...new Set(params.orderedStaffIds)];
  const results = await Promise.all(
    orderedIds.map((staffId, index) =>
      supabase
        .from("hr_schedule_section_assignments")
        .update({ sort_order: index + 1, updated_at: now })
        .eq("venue_id", venue.id)
        .eq("department_key", params.departmentKey)
        .eq("week_start", params.weekStart)
        .eq("section_id", params.sectionId)
        .eq("staff_id", staffId),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    console.error("[hr] reorderSectionStaff:", failed.error.message);
    return { error: "Could not reorder staff." };
  }

  await propagateWeekSectionsForward({
    venueId: venue.id,
    departmentKey: params.departmentKey,
    sourceWeekStart: params.weekStart,
  });

  revalidatePath("/hr/schedules", "page");
  return { ok: true as const };
}
