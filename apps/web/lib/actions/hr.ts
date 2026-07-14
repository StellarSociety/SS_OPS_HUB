"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { resolveActiveVenue } from "@/lib/venue/active-venue";
import { scopedHrefForVenue } from "@/lib/venue/scope-routing";
import { parseDate, parseNumber, parseStaffCsv, type ImportStaffRow } from "@/lib/hr/import";
import {
  canAccessStaff,
  canAdminLookups,
  canAdminStaff,
  canEditOwnStaff,
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
  listScheduleDayLabels,
  listStaffScheduleDays,
  resolveLookupId,
  resolvePositionId,
} from "@/lib/hr/store";
import {
  DEFAULT_HR_EXPIRY_SETTINGS,
  DEFAULT_HR_SALARY_DEFAULTS,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
} from "@/lib/hr/types";
import { DEFAULT_SCHEDULE_DAY_LABELS, deriveScheduleLabelColors } from "@/lib/hr/schedules";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const venue = await resolveActiveVenue(supabase);
  if (!venue) redirect("/select-venue");

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  return { supabase, user, venue, permissions: permissions ?? [] };
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
      "company_accommodation",
      "insurance_category",
    ] as const;
    const DATE_FIELDS = [
      "dob",
      "passport_expiry",
      "eid_expiry",
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

  const updates = stripSensitiveStaffWrites(
    formDataToStaffPayload(formData),
    permissions,
    venue.id,
  );
  const service = createServiceClient();
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

  const { data: created, error } = await service
    .from("staff")
    .insert(payload)
    .select("id")
    .single();

  if (error) return { error: error.message };

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

function formDataToStaffPayload(formData: FormData) {
  const str = (key: string) => {
    const v = formData.get(key);
    return v && String(v).trim() ? String(v).trim() : null;
  };

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
    joining_date: parseDate(str("joining_date") ?? undefined),
    termination_date: parseDate(str("termination_date") ?? undefined),
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
  if (!canAccessStaff(permissions, venue.id)) {
    return { error: "No access.", days: [] as const };
  }

  const days = await listStaffScheduleDays(supabase, venue.id, params);
  return { days };
}

export async function upsertScheduleDay(params: {
  staffId: string;
  workDate: string;
  labelCode: string | null;
}) {
  const { supabase, user, venue, permissions } = await getAuthContext();
  if (!canEditStaff(permissions, venue.id)) {
    return { error: "You do not have permission to edit schedules." };
  }

  const { staffId, workDate, labelCode } = params;
  if (!staffId || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return { error: "Invalid schedule cell." };
  }

  const { data: staffRow, error: staffError } = await supabase
    .from("staff")
    .select("id, emp_no, home_venue_id, department_id")
    .eq("id", staffId)
    .eq("home_venue_id", venue.id)
    .maybeSingle();

  if (staffError || !staffRow) {
    console.error("[hr] schedule staff lookup:", staffError?.message);
    return { error: "Staff member not found for this venue." };
  }

  const empNo = (staffRow.emp_no as string)?.trim();
  if (!empNo) {
    return { error: "Staff member is missing Employee ID (emp_no)." };
  }

  if (labelCode === null) {
    const { error } = await supabase
      .from("hr_schedule_days")
      .delete()
      .eq("venue_id", venue.id)
      .eq("staff_id", staffId)
      .eq("work_date", workDate);

    if (error) {
      console.error("[hr] clear schedule day:", error.message);
      return {
        error:
          "Could not clear this day. Apply the hr_schedule_days migration if needed.",
      };
    }

    revalidatePath("/hr/schedules", "page");
    return { ok: true as const };
  }

  const code = labelCode.trim().toUpperCase();
  const labels = await listScheduleDayLabels(supabase);
  const known =
    labels?.some((label) => label.code === code) ||
    (!labels &&
      DEFAULT_SCHEDULE_DAY_LABELS.some((label) => label.code === code));

  if (!known) {
    return { error: "Unknown schedule label." };
  }

  const { error } = await supabase.from("hr_schedule_days").upsert(
    {
      venue_id: venue.id,
      staff_id: staffId,
      emp_no: empNo,
      work_date: workDate,
      label_code: code,
      department_id: staffRow.department_id ?? null,
      source: "manual",
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "staff_id,work_date" },
  );

  if (error) {
    console.error("[hr] upsert schedule day:", error.message);
    return {
      error:
        "Could not save this day. Apply the hr_schedule_days migration if needed.",
    };
  }

  revalidatePath("/hr/schedules", "page");
  return { ok: true as const, labelCode: code, empNo };
}

/** Persist mixed draft changes (set label or clear) for many cells. */
export async function saveScheduleDayChanges(params: {
  changes: {
    staffId: string;
    workDate: string;
    labelCode: string | null;
  }[];
}) {
  const { supabase, user, venue, permissions } = await getAuthContext();
  if (!canEditStaff(permissions, venue.id)) {
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
  const { data: staffRows, error: staffError } = await supabase
    .from("staff")
    .select("id, emp_no, department_id")
    .eq("home_venue_id", venue.id)
    .in("id", staffIds);

  if (staffError || !staffRows?.length) {
    console.error("[hr] save schedule staff lookup:", staffError?.message);
    return { error: "Could not resolve selected staff." };
  }

  const staffById = new Map(
    staffRows.map((row) => [row.id as string, row] as const),
  );

  const labels = await listScheduleDayLabels(supabase);
  const knownCodes = new Set(
    (labels ?? DEFAULT_SCHEDULE_DAY_LABELS).map((label) => label.code),
  );

  const toClear = changes.filter((change) => change.labelCode === null);
  const toUpsert = changes.filter((change) => change.labelCode !== null);

  if (toClear.length > 0) {
    const results = await Promise.all(
      toClear.map((change) =>
        supabase
          .from("hr_schedule_days")
          .delete()
          .eq("venue_id", venue.id)
          .eq("staff_id", change.staffId)
          .eq("work_date", change.workDate),
      ),
    );
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      console.error("[hr] save clear schedule:", failed.error.message);
      return { error: "Could not clear one or more days." };
    }
  }

  if (toUpsert.length > 0) {
    const rows = [];
    for (const change of toUpsert) {
      const code = change.labelCode!.trim().toUpperCase();
      if (!knownCodes.has(code)) {
        return { error: `Unknown schedule label: ${code}` };
      }
      const staffRow = staffById.get(change.staffId);
      const empNo = (staffRow?.emp_no as string | undefined)?.trim();
      if (!staffRow || !empNo) {
        return { error: "One or more staff members are missing Employee ID." };
      }
      rows.push({
        venue_id: venue.id,
        staff_id: change.staffId,
        emp_no: empNo,
        work_date: change.workDate,
        label_code: code,
        department_id: staffRow.department_id ?? null,
        source: "manual" as const,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      });
    }

    const { error } = await supabase
      .from("hr_schedule_days")
      .upsert(rows, { onConflict: "staff_id,work_date" });

    if (error) {
      console.error("[hr] save upsert schedule:", error.message);
      return { error: "Could not save roster labels." };
    }
  }

  revalidatePath("/hr/schedules", "page");
  return { ok: true as const, count: changes.length };
}

/** @deprecated Prefer saveScheduleDayChanges for mixed drafts. */
export async function upsertScheduleDaysBatch(params: {
  cells: { staffId: string; workDate: string }[];
  labelCode: string | null;
}) {
  return saveScheduleDayChanges({
    changes: params.cells.map((cell) => ({
      ...cell,
      labelCode: params.labelCode,
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
