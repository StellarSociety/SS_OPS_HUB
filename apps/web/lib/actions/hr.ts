"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { ACTIVE_VENUE_COOKIE } from "@/lib/constants";
import { parseDate, parseNumber, parseStaffCsv } from "@/lib/hr/import";
import {
  canAccessStaff,
  canAdminLookups,
  canAdminStaff,
  canEditOwnStaff,
  canEditStaff,
  canViewStaff,
} from "@/lib/hr/permissions";
import {
  listDepartments,
  listEmploymentStatuses,
  listNationalities,
  listPositions,
  resolveLookupId,
  resolvePositionId,
} from "@/lib/hr/store";
import {
  DEFAULT_HR_EXPIRY_SETTINGS,
  DEFAULT_HR_SALARY_DEFAULTS,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
} from "@/lib/hr/types";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const venueSlug = cookieStore.get(ACTIVE_VENUE_COOKIE)?.value;
  if (!venueSlug) redirect("/select-venue");

  const { data: venue } = await supabase
    .from("venues")
    .select("*")
    .eq("slug", venueSlug)
    .single();
  if (!venue) redirect("/select-venue");

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  return { supabase, user, venue, permissions: permissions ?? [] };
}

export async function importStaffFromCsv(csvText: string) {
  const { supabase, user, venue, permissions } = await getAuthContext();

  if (!canEditStaff(permissions, venue.id)) {
    return { error: "You do not have permission to import staff." };
  }

  if (venue.is_global) {
    return {
      error: "Import venue staff at a specific venue, not Global.",
    };
  }

  const rows = parseStaffCsv(csvText);
  if (rows.length === 0) {
    return { error: "No data rows found in CSV." };
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

    const payload = {
      home_venue_id: venue.id,
      emp_no: empNo,
      department_id: departmentId,
      position_id: positionId,
      employment_status_id: statusId,
      nationality_id: nationalityId,
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      contact_phone: row.contact_phone || null,
      personal_email: row.personal_email || null,
      work_email: row.work_email || null,
      gender: row.gender || null,
      civil_status: row.civil_status || null,
      dob: parseDate(row.dob),
      passport_no: row.passport_no || null,
      passport_expiry: parseDate(row.passport_expiry),
      eid_no: row.eid_no || null,
      eid_expiry: parseDate(row.eid_expiry),
      iban: row.iban || null,
      swift_code: row.swift_code || null,
      bank_name: row.bank_name || null,
      joining_date: parseDate(row.joining_date),
      termination_date: parseDate(row.termination_date),
      unpaid_leave_days_total: parseNumber(row.unpaid_leave_days_total),
      vacations_entitle: parseNumber(row.vacations_entitle),
      vacations_balance: parseNumber(row.vacations_balance),
      wage_package: parseNumber(row.wage_package),
      company_accommodation: row.company_accommodation || null,
      basic_salary_60: parseNumber(row.basic_salary_60),
      accom_all_25: parseNumber(row.accom_all_25),
      transp_all_15: parseNumber(row.transp_all_15),
      fly_home_ticket_per_year: parseNumber(row.fly_home_ticket_per_year),
      provisional_leave: parseNumber(row.provisional_leave),
      provisional_eosb: parseNumber(row.provisional_eosb),
      visa_expenses: parseNumber(row.visa_expenses),
      visa_penalties_paid: parseNumber(row.visa_penalties_paid),
      ohc_date: parseDate(row.ohc_date),
      pic_date: parseDate(row.pic_date),
      basic_food_safety_date: parseDate(row.basic_food_safety_date),
      fire_safety_date: parseDate(row.fire_safety_date),
      first_aid_date: parseDate(row.first_aid_date),
      insurance_category: row.insurance_category || null,
      medical_insurance_value: parseNumber(row.medical_insurance_value),
      medical_insurance_issue_date: parseDate(row.medical_insurance_issue_date),
      medical_insurance_expiry_date: parseDate(
        row.medical_insurance_expiry_date,
      ),
      created_by: user.id,
    };

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
        .insert(payload)
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

  const updates = formDataToStaffPayload(formData);
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
  redirect("/hr/staff");
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
