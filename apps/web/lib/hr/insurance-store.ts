import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { daysUntil, formatAed } from "@/lib/hr/derived";
import {
  listAllStaff,
  listDepartments,
  listEmploymentStatuses,
  listPositions,
} from "@/lib/hr/store";
import type {
  Department,
  HrInsuranceRequestEmailSettings,
  InsuranceCategoryPositionDefault,
  InsuranceCategoryWithDefaults,
  InsuranceEmployeeRow,
  InsuranceProvider,
  InsuranceStatus,
  Position,
  StaffWithLookups,
} from "@/lib/hr/types";
import {
  DEFAULT_HR_INSURANCE_REQUEST_EMAIL_SETTINGS,
} from "@/lib/hr/types";
import {
  normalizeEmailStaffDocumentKeys,
} from "@/lib/hr/email-staff-documents";

function isoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function money(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

type PositionDefaultDb = {
  id: string;
  category_id: string;
  department_id: string;
  position_id: string | null;
  department?: Department | Department[] | null;
  position?: Position | Position[] | null;
};

type CategoryDb = {
  id: string;
  name: string;
  default_medical_value: number | string | null;
  sort_order: number | null;
  provider_id: string | null;
  archived_at: string | null;
  position_defaults?: PositionDefaultDb[] | null;
};

type ProviderDb = {
  id: string;
  name: string;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  lead_days: number | null;
  sort_order: number | null;
  archived_at: string | null;
  categories?: CategoryDb[] | null;
};

function oneRel<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapPositionDefault(
  row: PositionDefaultDb,
): InsuranceCategoryPositionDefault {
  return {
    id: String(row.id),
    category_id: String(row.category_id),
    department_id: String(row.department_id),
    position_id: row.position_id ? String(row.position_id) : null,
    department: oneRel(row.department),
    position: oneRel(row.position),
  };
}

function mapCategory(row: CategoryDb): InsuranceCategoryWithDefaults {
  return {
    id: String(row.id),
    name: String(row.name ?? "").trim(),
    default_medical_value: money(row.default_medical_value),
    sort_order: Number(row.sort_order) || 0,
    provider_id: row.provider_id ? String(row.provider_id) : null,
    archived_at: row.archived_at ? String(row.archived_at) : null,
    position_defaults: (row.position_defaults ?? []).map(mapPositionDefault),
  };
}

export function normalizeInsuranceProvider(row: ProviderDb): InsuranceProvider {
  const categories = (row.categories ?? [])
    .map(mapCategory)
    .sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
    );
  return {
    id: String(row.id),
    name: String(row.name ?? "").trim(),
    contact_person: String(row.contact_person ?? "").trim(),
    contact_email: String(row.contact_email ?? "").trim(),
    contact_phone: String(row.contact_phone ?? "").trim(),
    lead_days: Math.max(0, Number(row.lead_days) || 30),
    sort_order: Number(row.sort_order) || 0,
    archived_at: row.archived_at ? String(row.archived_at) : null,
    categories,
  };
}

const PROVIDER_SELECT = `
  id, name, contact_person, contact_email, contact_phone,
  lead_days, sort_order, archived_at,
  categories:insurance_categories (
    id, name, default_medical_value, sort_order, provider_id, archived_at,
    position_defaults:insurance_category_position_defaults (
      id, category_id, department_id, position_id,
      department:departments (id, venue_id, name, sort_order),
      position:positions (id, venue_id, department_id, name, sort_order)
    )
  )
`;

export async function loadInsuranceProviders(
  supabase: SupabaseClient,
): Promise<InsuranceProvider[]> {
  const { data, error } = await supabase
    .from("insurance_providers")
    .select(PROVIDER_SELECT)
    .order("sort_order")
    .order("name");
  if (error) {
    console.error("[hr] loadInsuranceProviders:", error.message);
    throw error;
  }
  return ((data ?? []) as ProviderDb[])
    .map(normalizeInsuranceProvider)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

export async function loadInsuranceDetailsPage(supabase: SupabaseClient) {
  const providers = await loadInsuranceProviders(supabase);
  return { providers };
}

/** Distinct department/position pairs currently assigned per insurance category. */
export async function loadInsuranceCategoryPositionHints(
  supabase: SupabaseClient,
  venueId: string,
): Promise<
  {
    categoryName: string;
    departmentId: string;
    positionId: string;
  }[]
> {
  const staff = await listAllStaff(supabase);
  const seen = new Set<string>();
  const hints: {
    categoryName: string;
    departmentId: string;
    positionId: string;
  }[] = [];

  for (const s of staff) {
    if (s.home_venue_id !== venueId) continue;
    const categoryName = s.insurance_category?.trim() ?? "";
    const departmentId = s.department_id?.trim() ?? "";
    const positionId = s.position_id?.trim() ?? "";
    if (!categoryName || !departmentId || !positionId) continue;
    const key = `${categoryName.toLowerCase()}|${departmentId}|${positionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hints.push({ categoryName, departmentId, positionId });
  }

  return hints;
}

function findSuggestedCategory(
  providers: InsuranceProvider[],
  staff: StaffWithLookups,
): {
  categoryId: string;
  categoryName: string;
  value: number;
  providerId: string;
} | null {
  const departmentId = staff.department_id;
  const positionId = staff.position_id;
  if (!departmentId) return null;

  type Match = {
    categoryId: string;
    categoryName: string;
    value: number;
    providerId: string;
    specificity: number;
  };

  let best: Match | null = null;

  for (const provider of providers) {
    if (provider.archived_at) continue;
    for (const category of provider.categories) {
      if (category.archived_at) continue;
      for (const ent of category.position_defaults) {
        if (ent.department_id !== departmentId) continue;
        if (ent.position_id && ent.position_id !== positionId) continue;
        const specificity = ent.position_id ? 2 : 1;
        if (!best || specificity > best.specificity) {
          best = {
            categoryId: category.id,
            categoryName: category.name,
            value: category.default_medical_value,
            providerId: provider.id,
            specificity,
          };
        }
      }
    }
  }

  return best
    ? {
        categoryId: best.categoryId,
        categoryName: best.categoryName,
        value: best.value,
        providerId: best.providerId,
      }
    : null;
}

export function buildInsuranceEmployeeRow(
  staff: StaffWithLookups,
  providers: InsuranceProvider[],
  hasDocument = false,
): InsuranceEmployeeRow {
  const categoryName = staff.insurance_category?.trim() || null;
  const issueDate = isoDate(staff.medical_insurance_issue_date);
  const expiryDate = isoDate(staff.medical_insurance_expiry_date);
  const value =
    staff.medical_insurance_value == null
      ? null
      : money(staff.medical_insurance_value);

  let matchedCategory: InsuranceCategoryWithDefaults | null = null;
  let matchedProvider: InsuranceProvider | null = null;

  if (categoryName) {
    for (const provider of providers) {
      const cat = provider.categories.find(
        (c) => c.name.toLowerCase() === categoryName.toLowerCase(),
      );
      if (cat) {
        matchedCategory = cat;
        matchedProvider = provider;
        break;
      }
    }
  }

  const leadDays = matchedProvider?.lead_days ?? 30;
  const until = expiryDate != null ? daysUntil(expiryDate) : null;

  let status: InsuranceStatus = "missing";
  if (expiryDate != null && until != null) {
    if (until < 0) status = "expired";
    else if (until <= leadDays) status = "expiring";
    else status = "valid";
  } else if (issueDate || categoryName || value != null) {
    // Partial data without expiry still tracks as missing until expiry is set.
    status = "missing";
  }

  const suggested = findSuggestedCategory(providers, staff);

  return {
    staff,
    category: categoryName,
    categoryId: matchedCategory?.id ?? null,
    value,
    issueDate,
    expiryDate,
    status,
    daysUntilExpiry: until,
    leadDays,
    providerId: matchedProvider?.id ?? null,
    providerName: matchedProvider?.name ?? null,
    providerEmail: matchedProvider?.contact_email ?? null,
    suggestedCategoryId: suggested?.categoryId ?? null,
    suggestedCategoryName: suggested?.categoryName ?? null,
    suggestedValue: suggested?.value ?? null,
    hasDocument,
  };
}

async function listMedicalInsuranceDocs(
  supabase: SupabaseClient,
  venueId: string,
  staffIds: string[],
): Promise<Set<string>> {
  const hasDoc = new Set<string>();
  if (staffIds.length === 0) return hasDoc;
  const { data, error } = await supabase
    .from("hr_staff_workdrive_documents")
    .select("staff_id")
    .eq("venue_id", venueId)
    .in("staff_id", staffIds)
    .eq("doc_kind", "medical_insurance");
  if (error) {
    console.error("[hr] listMedicalInsuranceDocs:", error.message);
    return hasDoc;
  }
  for (const row of data ?? []) {
    if (row.staff_id) hasDoc.add(String(row.staff_id));
  }
  return hasDoc;
}

export async function loadInsuranceEmployeesPage(
  supabase: SupabaseClient,
  venueId: string,
) {
  const [providers, staff, departments, positions, statuses, orphanCats] =
    await Promise.all([
      loadInsuranceProviders(supabase),
      listAllStaff(supabase),
      listDepartments(supabase, venueId),
      listPositions(supabase, venueId),
      listEmploymentStatuses(supabase),
      supabase
        .from("insurance_categories")
        .select(
          "id, name, default_medical_value, sort_order, provider_id, archived_at",
        )
        .is("provider_id", null)
        .is("archived_at", null)
        .order("sort_order"),
    ]);

  if (orphanCats.error) {
    console.error(
      "[hr] loadInsuranceEmployeesPage orphans:",
      orphanCats.error.message,
    );
  }

  const venueStaff = staff.filter((s) => s.home_venue_id === venueId);
  const docs = await listMedicalInsuranceDocs(
    supabase,
    venueId,
    venueStaff.map((s) => s.id),
  );

  const activeProviders = providers.filter((p) => !p.archived_at);
  const linkedCategories = activeProviders.flatMap((p) =>
    p.categories.filter((c) => !c.archived_at),
  );
  const orphanCategories: InsuranceCategoryWithDefaults[] = (
    orphanCats.data ?? []
  ).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? "").trim(),
    default_medical_value: money(row.default_medical_value),
    sort_order: Number(row.sort_order) || 0,
    provider_id: null,
    archived_at: null,
    position_defaults: [],
  }));

  const categoryByName = new Map<string, InsuranceCategoryWithDefaults>();
  for (const cat of [...linkedCategories, ...orphanCategories]) {
    const key = cat.name.toLowerCase();
    if (!categoryByName.has(key)) categoryByName.set(key, cat);
  }
  const categories = [...categoryByName.values()].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  );

  const rows = venueStaff.map((s) =>
    buildInsuranceEmployeeRow(s, providers, docs.has(s.id)),
  );

  return {
    rows,
    providers: activeProviders,
    categories,
    departments,
    positions,
    statuses,
  };
}

export function formatInsuranceValueLabel(value: number | null): string {
  if (value == null) return "—";
  return formatAed(value);
}

export function mergeInsuranceRequestEmailSettings(
  partial:
    | (Partial<HrInsuranceRequestEmailSettings> & {
        /** Legacy single-template fields. */
        subject?: string;
        message?: string;
      })
    | null
    | undefined,
): HrInsuranceRequestEmailSettings {
  const base = DEFAULT_HR_INSURANCE_REQUEST_EMAIL_SETTINGS;
  const legacySubject = String(partial?.subject ?? "").trim();
  const legacyMessage = String(partial?.message ?? "").trim();

  const issueSubject =
    String(partial?.issueSubject ?? "").trim() ||
    legacySubject ||
    base.issueSubject;
  const issueMessage =
    String(partial?.issueMessage ?? "").trim() ||
    legacyMessage ||
    base.issueMessage;
  const renewSubject =
    String(partial?.renewSubject ?? "").trim() ||
    legacySubject ||
    base.renewSubject;
  const renewMessage =
    String(partial?.renewMessage ?? "").trim() ||
    legacyMessage ||
    base.renewMessage;

  return {
    enabled: partial?.enabled ?? base.enabled,
    fromEmail: String(partial?.fromEmail ?? base.fromEmail).trim(),
    issueSubject,
    issueMessage,
    renewSubject,
    renewMessage,
    issueAttachDocuments: normalizeEmailStaffDocumentKeys(
      partial?.issueAttachDocuments,
      base.issueAttachDocuments,
    ),
    renewAttachDocuments: normalizeEmailStaffDocumentKeys(
      partial?.renewAttachDocuments,
      base.renewAttachDocuments,
    ),
    issueRequireAttachments:
      typeof partial?.issueRequireAttachments === "boolean"
        ? partial.issueRequireAttachments
        : base.issueRequireAttachments,
    renewRequireAttachments:
      typeof partial?.renewRequireAttachments === "boolean"
        ? partial.renewRequireAttachments
        : base.renewRequireAttachments,
  };
}
