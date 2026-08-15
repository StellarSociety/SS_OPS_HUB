import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { daysUntil, formatAed } from "@/lib/hr/derived";
import { splitGrossAtVatRate } from "@/lib/hr/certification-costs";
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
  InsuranceExpenseMonth,
  InsuranceProvider,
  InsuranceStatus,
  Position,
  StaffInsuranceRecord,
  StaffWithLookups,
} from "@/lib/hr/types";
import {
  DEFAULT_HR_INSURANCE_REQUEST_EMAIL_SETTINGS,
  HR_SETTINGS_KEYS,
  staffInsuranceHistorySettingKey,
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
  recordsMissingCard: InsuranceEmployeeRow["recordsMissingCard"] = [],
  document: InsuranceEmployeeRow["document"] = null,
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
    document,
    recordsMissingCard,
  };
}

type InsuranceDocumentMeta = NonNullable<InsuranceEmployeeRow["document"]>;

type MedicalInsuranceDocIndex = {
  /** Staff ids that have at least one insurance card on WorkDrive. */
  staffWithAny: Set<string>;
  /** Linked reference ids (file_slot_id) per staff. */
  slotsByStaff: Map<string, Set<string>>;
  /** Latest insurance card metadata per linked reference (file_slot_id) per staff. */
  docsBySlotByStaff: Map<string, Map<string, InsuranceDocumentMeta>>;
  /** Latest insurance card metadata per staff (for table preview). */
  latestByStaff: Map<string, InsuranceDocumentMeta>;
};

function insuranceDocMetaFromRow(row: {
  id?: unknown;
  workdrive_file_id?: unknown;
  file_name?: unknown;
  permalink?: unknown;
  path?: unknown;
  subfolder_id?: unknown;
  employee_folder_id?: unknown;
  file_slot_id?: unknown;
  uploaded_at?: unknown;
  missing_at?: unknown;
  missing_reason?: unknown;
}): InsuranceDocumentMeta | null {
  const fileId = String(row.workdrive_file_id ?? "").trim();
  const id = String(row.id ?? "").trim();
  if (!fileId || !id) return null;
  const fileName = String(row.file_name ?? "").trim() || "Insurance card";
  const uploadedAt = String(row.uploaded_at ?? "").trim() || new Date().toISOString();
  const subfolder = String(row.subfolder_id ?? "").trim();
  const employeeFolder = String(row.employee_folder_id ?? "").trim();
  const missingAt = String(row.missing_at ?? "").trim();
  const reasonRaw = String(row.missing_reason ?? "").trim();
  const missingReason =
    reasonRaw === "deleted_on_workdrive" || reasonRaw === "trashed_on_workdrive"
      ? reasonRaw
      : null;
  return {
    id,
    workdriveFileId: fileId,
    fileName,
    permalink: row.permalink ? String(row.permalink) : null,
    path: row.path ? String(row.path) : null,
    folderId: subfolder || employeeFolder || null,
    fileSlotId: row.file_slot_id ? String(row.file_slot_id).trim() || null : null,
    uploadedAt,
    isMissing: Boolean(missingAt),
    missingReason,
  };
}

export async function listMedicalInsuranceDocs(
  supabase: SupabaseClient,
  venueId: string,
  staffIds: string[],
): Promise<MedicalInsuranceDocIndex> {
  const staffWithAny = new Set<string>();
  const slotsByStaff = new Map<string, Set<string>>();
  const docsBySlotByStaff = new Map<string, Map<string, InsuranceDocumentMeta>>();
  const latestByStaff = new Map<string, InsuranceDocumentMeta>();
  if (staffIds.length === 0) {
    return { staffWithAny, slotsByStaff, docsBySlotByStaff, latestByStaff };
  }
  const { data, error } = await supabase
    .from("hr_staff_workdrive_documents")
    .select(
      "id, staff_id, file_slot_id, workdrive_file_id, file_name, permalink, path, subfolder_id, employee_folder_id, uploaded_at, missing_at, missing_reason",
    )
    .eq("venue_id", venueId)
    .in("staff_id", staffIds)
    .eq("doc_kind", "medical_insurance")
    .order("uploaded_at", { ascending: false });
  if (error) {
    console.error("[hr] listMedicalInsuranceDocs:", error.message);
    return { staffWithAny, slotsByStaff, docsBySlotByStaff, latestByStaff };
  }
  for (const row of data ?? []) {
    const staffId = String(row.staff_id ?? "").trim();
    if (!staffId) continue;
    staffWithAny.add(staffId);
    const meta = insuranceDocMetaFromRow(row);
    if (meta && !latestByStaff.has(staffId)) {
      latestByStaff.set(staffId, meta);
    }
    const slot = String(row.file_slot_id ?? "").trim();
    if (!slot || slot === "default") continue;
    let set = slotsByStaff.get(staffId);
    if (!set) {
      set = new Set();
      slotsByStaff.set(staffId, set);
    }
    set.add(slot);
    if (meta) {
      let bySlot = docsBySlotByStaff.get(staffId);
      if (!bySlot) {
        bySlot = new Map();
        docsBySlotByStaff.set(staffId, bySlot);
      }
      if (!bySlot.has(slot)) {
        bySlot.set(slot, meta);
      }
    }
  }
  return { staffWithAny, slotsByStaff, docsBySlotByStaff, latestByStaff };
}

export function annotateInsuranceRecordsWithDocuments(
  records: StaffInsuranceRecord[],
  linkedRecordIds: Set<string> | undefined,
  hasLegacyDocument: boolean,
  docsBySlot?: Map<string, InsuranceDocumentMeta>,
  legacyDocument?: InsuranceDocumentMeta | null,
): StaffInsuranceRecord[] {
  const latest = pickLatestStaffInsuranceRecord(records);
  return records.map((record) => {
    const linked = linkedRecordIds?.has(record.id) ?? false;
    const legacyForLatest =
      hasLegacyDocument &&
      !linkedRecordIds?.size &&
      latest?.id === record.id;
    const hasDocument = linked || legacyForLatest;
    const document = linked
      ? (docsBySlot?.get(record.id) ?? null)
      : legacyForLatest
        ? (legacyDocument ?? null)
        : null;
    return {
      ...record,
      hasDocument,
      document,
    };
  });
}

function recordsMissingInsuranceCard(
  records: StaffInsuranceRecord[],
): InsuranceEmployeeRow["recordsMissingCard"] {
  return records
    .filter(
      (record) =>
        !record.hasDocument &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          record.id,
        ),
    )
    .map((record) => ({
      id: record.id,
      reference: record.reference,
      category: record.category,
    }));
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
  const staffIds = venueStaff.map((s) => s.id);
  const [docs, historyRowsResult] = await Promise.all([
    listMedicalInsuranceDocs(supabase, venueId, staffIds),
    supabase
      .from("hr_venue_settings")
      .select("key, value")
      .eq("venue_id", venueId)
      .like("key", `${HR_SETTINGS_KEYS.staffInsuranceHistoryPrefix}%`),
  ]);
  if (historyRowsResult.error) {
    console.error(
      "[hr] loadInsuranceEmployeesPage history:",
      historyRowsResult.error.message,
    );
  }

  const historyByStaff = new Map<string, StaffInsuranceRecord[]>();
  for (const row of historyRowsResult.data ?? []) {
    const key = String(row.key ?? "");
    if (!key.startsWith(HR_SETTINGS_KEYS.staffInsuranceHistoryPrefix)) continue;
    const staffId = key.slice(
      HR_SETTINGS_KEYS.staffInsuranceHistoryPrefix.length,
    );
    const raw = (row.value ?? {}) as { records?: unknown };
    const records = Array.isArray(raw.records)
      ? raw.records
          .map((item) =>
            normalizeInsuranceRecord(item as Partial<StaffInsuranceRecord>),
          )
          .filter((item): item is StaffInsuranceRecord => item != null)
      : [];
    historyByStaff.set(staffId, sortStaffInsuranceRecords(records));
  }

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

  const rows = venueStaff.map((s) => {
    const rawHistory = historyByStaff.get(s.id) ?? [];
    const seeded =
      rawHistory.length > 0
        ? rawHistory
        : (() => {
            const category = s.insurance_category?.trim() || "";
            const issueDate = isoDate(s.medical_insurance_issue_date);
            const expiryDate = isoDate(s.medical_insurance_expiry_date);
            const value =
              s.medical_insurance_value == null
                ? null
                : money(s.medical_insurance_value);
            if (!category && !issueDate && !expiryDate && value == null) {
              return [] as StaffInsuranceRecord[];
            }
            return [
              {
                id: `seed:${s.id}`,
                reference: "",
                category,
                value,
                issueDate,
                expiryDate,
                createdAt: new Date(0).toISOString(),
                createdBy: null,
              },
            ] satisfies StaffInsuranceRecord[];
          })();
    const annotated = annotateInsuranceRecordsWithDocuments(
      seeded,
      docs.slotsByStaff.get(s.id),
      docs.staffWithAny.has(s.id),
      docs.docsBySlotByStaff.get(s.id),
      docs.latestByStaff.get(s.id) ?? null,
    );
    const missing = recordsMissingInsuranceCard(annotated);
    const hasDocument = docs.staffWithAny.has(s.id);
    const document = docs.latestByStaff.get(s.id) ?? null;
    return buildInsuranceEmployeeRow(
      s,
      providers,
      hasDocument,
      missing,
      document,
    );
  });

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

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatExpenseMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return new Date(y, m - 1, 1).toLocaleString("en-AE", {
    month: "long",
    year: "numeric",
  });
}

function categoryKeyFromName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  return trimmed || "__uncategorized__";
}

/**
 * Aggregate insurance costs by issue-date month and category.
 * Uses per-staff issuance history when present; otherwise falls back to
 * the current staff insurance columns.
 */
export async function loadInsuranceExpensesPage(
  supabase: SupabaseClient,
  venueId: string,
): Promise<{ months: InsuranceExpenseMonth[] }> {
  const staff = await listAllStaff(supabase);
  const venueStaff = staff.filter((s) => s.home_venue_id === venueId);
  const staffById = new Map(venueStaff.map((s) => [s.id, s]));

  const { data: historyRows, error: historyError } = await supabase
    .from("hr_venue_settings")
    .select("key, value")
    .eq("venue_id", venueId)
    .like("key", `${HR_SETTINGS_KEYS.staffInsuranceHistoryPrefix}%`);
  if (historyError) {
    console.error("[hr] loadInsuranceExpensesPage history:", historyError.message);
  }

  const historyByStaff = new Map<string, StaffInsuranceRecord[]>();
  for (const row of historyRows ?? []) {
    const key = String(row.key ?? "");
    if (!key.startsWith(HR_SETTINGS_KEYS.staffInsuranceHistoryPrefix)) continue;
    const staffId = key.slice(
      HR_SETTINGS_KEYS.staffInsuranceHistoryPrefix.length,
    );
    if (!staffById.has(staffId)) continue;
    const raw = (row.value ?? {}) as { records?: unknown };
    const records = Array.isArray(raw.records)
      ? raw.records
          .map((item) => normalizeInsuranceRecord(item as Partial<StaffInsuranceRecord>))
          .filter((item): item is StaffInsuranceRecord => item != null)
      : [];
    historyByStaff.set(staffId, records);
  }

  type Acc = {
    categoryKey: string;
    name: string;
    label: string;
    count: number;
    net: number;
    vat: number;
    gross: number;
    staff: {
      staffId: string;
      empNo: string;
      fullName: string;
      issuedAt: string;
      photoUrl: string | null;
      reference: string;
      value: number;
      departmentName: string | null;
      positionName: string | null;
      employmentStatusName: string | null;
      workingStatusName: string | null;
      nationalityName: string | null;
      dob: string | null;
      joiningDate: string | null;
      terminationDate: string | null;
    }[];
  };

  const byMonth = new Map<string, Map<string, Acc>>();

  function addIssuance(params: {
    staff: StaffWithLookups;
    category: string;
    value: number | null;
    issueDate: string;
    reference?: string;
  }) {
    const grossValue = money(params.value);
    if (grossValue <= 0 && !params.category.trim()) return;

    const costs = splitGrossAtVatRate(grossValue);
    const monthKey = params.issueDate.slice(0, 7);
    const categoryName = params.category.trim() || "Uncategorized";
    const categoryKey = categoryKeyFromName(categoryName);

    let monthMap = byMonth.get(monthKey);
    if (!monthMap) {
      monthMap = new Map();
      byMonth.set(monthKey, monthMap);
    }

    const staffEntry = {
      staffId: params.staff.id,
      empNo: params.staff.emp_no,
      fullName: params.staff.full_name,
      issuedAt: params.issueDate,
      photoUrl: params.staff.photo_url ?? null,
      reference: params.reference?.trim() || "",
      value: costs.gross,
      departmentName: params.staff.department?.name ?? null,
      positionName: params.staff.position?.name ?? null,
      employmentStatusName: params.staff.employment_status?.name ?? null,
      workingStatusName: params.staff.working_status?.name ?? null,
      nationalityName: params.staff.nationality?.name ?? null,
      dob: params.staff.dob ?? null,
      joiningDate: params.staff.joining_date ?? null,
      terminationDate: params.staff.termination_date ?? null,
    };

    const existing = monthMap.get(categoryKey);
    if (existing) {
      existing.count += 1;
      existing.net = roundMoney(existing.net + costs.net);
      existing.vat = roundMoney(existing.vat + costs.vat);
      existing.gross = roundMoney(existing.gross + costs.gross);
      existing.staff.push(staffEntry);
    } else {
      monthMap.set(categoryKey, {
        categoryKey,
        name: categoryName,
        label: categoryName,
        count: 1,
        net: costs.net,
        vat: costs.vat,
        gross: costs.gross,
        staff: [staffEntry],
      });
    }
  }

  for (const s of venueStaff) {
    const history = historyByStaff.get(s.id) ?? [];
    if (history.length > 0) {
      for (const record of history) {
        if (!record.issueDate) continue;
        addIssuance({
          staff: s,
          category: record.category,
          value: record.value,
          issueDate: record.issueDate,
          reference: record.reference,
        });
      }
      continue;
    }

    const issueDate = isoDate(s.medical_insurance_issue_date);
    if (!issueDate) continue;
    addIssuance({
      staff: s,
      category: s.insurance_category?.trim() || "",
      value:
        s.medical_insurance_value == null
          ? null
          : money(s.medical_insurance_value),
      issueDate,
    });
  }

  const months: InsuranceExpenseMonth[] = [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([monthKey, linesMap]) => {
      const lines = [...linesMap.values()]
        .map((row) => {
          const staff = [...row.staff].sort((a, b) =>
            a.issuedAt < b.issuedAt
              ? 1
              : a.issuedAt > b.issuedAt
                ? -1
                : a.fullName.localeCompare(b.fullName),
          );
          const latestIssuedAt = staff[0]?.issuedAt ?? `${monthKey}-01`;
          return {
            categoryKey: row.categoryKey,
            name: row.name,
            label: row.label,
            count: row.count,
            net: row.net,
            vat: row.vat,
            gross: row.gross,
            staff,
            latestIssuedAt,
          };
        })
        .sort((a, b) => {
          if (a.latestIssuedAt !== b.latestIssuedAt) {
            return a.latestIssuedAt < b.latestIssuedAt ? 1 : -1;
          }
          return a.name.localeCompare(b.name);
        })
        .map(({ latestIssuedAt: _latest, ...line }) => line);

      return {
        monthKey,
        label: formatExpenseMonthLabel(monthKey),
        lines,
        totalNet: roundMoney(lines.reduce((sum, l) => sum + l.net, 0)),
        totalVat: roundMoney(lines.reduce((sum, l) => sum + l.vat, 0)),
        totalGross: roundMoney(lines.reduce((sum, l) => sum + l.gross, 0)),
        totalCount: lines.reduce((sum, l) => sum + l.count, 0),
      };
    });

  return { months };
}

type StaffInsuranceHistoryStore = {
  records: StaffInsuranceRecord[];
};

function moneyOrNull(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function normalizeInsuranceRecord(
  raw: Partial<StaffInsuranceRecord> | null | undefined,
): StaffInsuranceRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    reference: String(raw.reference ?? "").trim(),
    category: String(raw.category ?? "").trim(),
    value: moneyOrNull(raw.value),
    issueDate: isoDate(raw.issueDate),
    expiryDate: isoDate(raw.expiryDate),
    createdAt:
      String(raw.createdAt ?? "").trim() || new Date().toISOString(),
    createdBy: raw.createdBy ? String(raw.createdBy).trim() : null,
  };
}

/** Newest first: issue date, then createdAt. */
export function sortStaffInsuranceRecords(
  records: StaffInsuranceRecord[],
): StaffInsuranceRecord[] {
  return [...records].sort((a, b) => {
    const aIssue = a.issueDate ?? "";
    const bIssue = b.issueDate ?? "";
    if (aIssue !== bIssue) return bIssue.localeCompare(aIssue);
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function pickLatestStaffInsuranceRecord(
  records: StaffInsuranceRecord[],
): StaffInsuranceRecord | null {
  const sorted = sortStaffInsuranceRecords(records);
  return sorted[0] ?? null;
}

export async function loadStaffInsuranceHistory(
  supabase: SupabaseClient,
  venueId: string,
  staffId: string,
): Promise<StaffInsuranceRecord[]> {
  const key = staffInsuranceHistorySettingKey(staffId);
  const { data, error } = await supabase
    .from("hr_venue_settings")
    .select("value")
    .eq("venue_id", venueId)
    .eq("key", key)
    .maybeSingle();
  if (error) {
    console.error("[hr] loadStaffInsuranceHistory:", error.message);
    return [];
  }
  const raw = (data?.value ?? {}) as Partial<StaffInsuranceHistoryStore>;
  const records = Array.isArray(raw.records)
    ? raw.records
        .map((row) => normalizeInsuranceRecord(row))
        .filter((row): row is StaffInsuranceRecord => row != null)
    : [];
  return sortStaffInsuranceRecords(records);
}

export async function saveStaffInsuranceHistory(
  supabase: SupabaseClient,
  venueId: string,
  staffId: string,
  records: StaffInsuranceRecord[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = staffInsuranceHistorySettingKey(staffId);
  const value: StaffInsuranceHistoryStore = {
    records: sortStaffInsuranceRecords(records),
  };
  const { error } = await supabase.from("hr_venue_settings").upsert(
    {
      venue_id: venueId,
      key,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "venue_id,key" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Mirror the latest issuance onto staff columns used by the employees table. */
export async function syncStaffInsuranceFromLatestRecord(
  supabase: SupabaseClient,
  venueId: string,
  staffId: string,
  records: StaffInsuranceRecord[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const latest = pickLatestStaffInsuranceRecord(records);
  const { error } = await supabase
    .from("staff")
    .update({
      insurance_category: latest?.category?.trim() || null,
      medical_insurance_value: latest?.value ?? null,
      medical_insurance_issue_date: latest?.issueDate ?? null,
      medical_insurance_expiry_date: latest?.expiryDate ?? null,
    })
    .eq("id", staffId)
    .eq("home_venue_id", venueId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Load history; if empty, seed one row from current staff insurance columns
 * so existing data appears as the first reference.
 */
export async function loadOrSeedStaffInsuranceHistory(
  supabase: SupabaseClient,
  venueId: string,
  staff: {
    id: string;
    insurance_category?: string | null;
    medical_insurance_value?: number | null;
    medical_insurance_issue_date?: string | null;
    medical_insurance_expiry_date?: string | null;
  },
): Promise<StaffInsuranceRecord[]> {
  const existing = await loadStaffInsuranceHistory(
    supabase,
    venueId,
    staff.id,
  );
  if (existing.length > 0) return existing;

  const category = staff.insurance_category?.trim() || "";
  const value =
    staff.medical_insurance_value == null
      ? null
      : money(staff.medical_insurance_value);
  const issueDate = isoDate(staff.medical_insurance_issue_date);
  const expiryDate = isoDate(staff.medical_insurance_expiry_date);
  if (!category && value == null && !issueDate && !expiryDate) {
    return [];
  }

  const seeded: StaffInsuranceRecord = {
    id: crypto.randomUUID(),
    reference: "",
    category,
    value,
    issueDate,
    expiryDate,
    createdAt: new Date().toISOString(),
    createdBy: null,
  };
  const saved = await saveStaffInsuranceHistory(supabase, venueId, staff.id, [
    seeded,
  ]);
  if (!saved.ok) {
    console.error("[hr] seedStaffInsuranceHistory:", saved.error);
    return [seeded];
  }
  return [seeded];
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
    requiresAcknowledgementIssue: partial?.requiresAcknowledgementIssue === true,
    requiresAcknowledgementRenew: partial?.requiresAcknowledgementRenew === true,
  };
}
