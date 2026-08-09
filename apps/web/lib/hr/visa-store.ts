import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { daysUntil, formatAed } from "@/lib/hr/derived";
import { splitGrossAtVatRate } from "@/lib/hr/certification-costs";
import { normalizeEmailStaffDocumentKeys } from "@/lib/hr/email-staff-documents";
import {
  listAllStaff,
  listDepartments,
  listEmploymentStatuses,
  listPositions,
  listWorkingStatuses,
} from "@/lib/hr/store";
import type {
  HrVisaRequestEmailSettings,
  StaffVisaRecord,
  StaffWithLookups,
  VisaComplianceStatus,
  VisaEmployeeRow,
  VisaExpenseMonth,
  VisaPenalty,
  VisaProProvider,
} from "@/lib/hr/types";
import {
  DEFAULT_HR_VISA_REQUEST_EMAIL_SETTINGS,
  HR_SETTINGS_KEYS,
  normalizeVisaStatusLabel,
  staffVisaHistorySettingKey,
  VISA_EXPENSE_CATEGORY,
  VISA_EXPENSE_CATEGORY_ORDER,
} from "@/lib/hr/types";

function isoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function money(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function moneyOrNull(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizePenalty(
  raw: Partial<VisaPenalty> | null | undefined,
): VisaPenalty | null {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id ?? "").trim() || crypto.randomUUID();
  return {
    id,
    description: String(raw.description ?? "").trim(),
    amount: money(raw.amount),
    companyCovered: Boolean(raw.companyCovered),
  };
}

export function normalizeVisaRecord(
  raw: Partial<StaffVisaRecord> | null | undefined,
): StaffVisaRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id ?? "").trim();
  if (!id) return null;
  const penalties = Array.isArray(raw.penalties)
    ? raw.penalties
        .map((p) => normalizePenalty(p as Partial<VisaPenalty>))
        .filter((p): p is VisaPenalty => p != null)
    : [];
  return {
    id,
    visaNumber: String(raw.visaNumber ?? "").trim(),
    issueDate: isoDate(raw.issueDate),
    expiryDate: isoDate(raw.expiryDate),
    valueSpend: moneyOrNull(raw.valueSpend),
    cancelationSpend: moneyOrNull(raw.cancelationSpend),
    penalties,
    visaStatus: normalizeVisaStatusLabel(String(raw.visaStatus ?? "")) ?? "",
    disputeReference: String(raw.disputeReference ?? "").trim(),
    disputeComments: String(raw.disputeComments ?? "").trim(),
    cancelDate: isoDate(raw.cancelDate),
    comments: String(raw.comments ?? "").trim(),
    createdAt: String(raw.createdAt ?? "").trim() || new Date().toISOString(),
    createdBy: raw.createdBy ? String(raw.createdBy).trim() : null,
  };
}

export function sortStaffVisaRecords(
  records: StaffVisaRecord[],
): StaffVisaRecord[] {
  return [...records].sort((a, b) => {
    const aIssue = a.issueDate ?? "";
    const bIssue = b.issueDate ?? "";
    if (aIssue !== bIssue) return bIssue.localeCompare(aIssue);
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function pickLatestStaffVisaRecord(
  records: StaffVisaRecord[],
): StaffVisaRecord | null {
  return sortStaffVisaRecords(records)[0] ?? null;
}

export function sumPenalties(penalties: VisaPenalty[]): number {
  return roundMoney(penalties.reduce((sum, p) => sum + money(p.amount), 0));
}

export function sumCompanyCoveredPenalties(penalties: VisaPenalty[]): number {
  return roundMoney(
    penalties
      .filter((p) => p.companyCovered)
      .reduce((sum, p) => sum + money(p.amount), 0),
  );
}

/** Penalties charged to the employee (payroll deduction), not company-covered. */
export function sumEmployeeAbsorbedPenalties(penalties: VisaPenalty[]): number {
  return roundMoney(
    penalties
      .filter((p) => !p.companyCovered)
      .reduce((sum, p) => sum + money(p.amount), 0),
  );
}

function normalizeProvider(
  raw: Partial<VisaProProvider> | null | undefined,
  index = 0,
): VisaProProvider | null {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id ?? "").trim();
  const name = String(raw.name ?? "").trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    contact_person: String(raw.contact_person ?? "").trim(),
    contact_email: String(raw.contact_email ?? "").trim(),
    contact_phone: String(raw.contact_phone ?? "").trim(),
    lead_days: Math.max(0, Number(raw.lead_days) || 30),
    sort_order: Number(raw.sort_order) || index + 1,
    archived_at: raw.archived_at ? String(raw.archived_at) : null,
  };
}

type ProvidersStore = { providers: VisaProProvider[] };

export async function loadVisaProProviders(
  supabase: SupabaseClient,
  venueId: string,
): Promise<VisaProProvider[]> {
  const { data, error } = await supabase
    .from("hr_venue_settings")
    .select("value")
    .eq("venue_id", venueId)
    .eq("key", HR_SETTINGS_KEYS.visaProProviders)
    .maybeSingle();
  if (error) {
    console.error("[hr] loadVisaProProviders:", error.message);
    return [];
  }
  const raw = (data?.value ?? {}) as Partial<ProvidersStore> | VisaProProvider[];
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.providers)
      ? raw.providers
      : [];
  return list
    .map((row, i) => normalizeProvider(row, i))
    .filter((row): row is VisaProProvider => row != null)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

export async function saveVisaProProviders(
  supabase: SupabaseClient,
  venueId: string,
  providers: VisaProProvider[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const value: ProvidersStore = {
    providers: providers
      .map((row, i) => normalizeProvider(row, i))
      .filter((row): row is VisaProProvider => row != null)
      .map((row, i) => ({ ...row, sort_order: i + 1 })),
  };
  const { error } = await supabase.from("hr_venue_settings").upsert(
    {
      venue_id: venueId,
      key: HR_SETTINGS_KEYS.visaProProviders,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "venue_id,key" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function loadVisaDetailsPage(
  supabase: SupabaseClient,
  venueId: string,
) {
  const providers = await loadVisaProProviders(supabase, venueId);
  return { providers };
}

function deriveComplianceStatus(
  record: {
    visaStatus: string | null;
    expiryDate: string | null;
    cancelDate: string | null;
    issueDate: string | null;
    visaNumber: string | null;
  },
  leadDays: number,
): {
  status: VisaComplianceStatus;
  daysUntilExpiry: number | null;
} {
  const statusLabel = (record.visaStatus ?? "").trim().toLowerCase();
  if (statusLabel.includes("cancel")) {
    return { status: "canceled", daysUntilExpiry: null };
  }
  if (statusLabel.includes("dispute")) {
    return { status: "dispute", daysUntilExpiry: daysUntil(record.expiryDate) };
  }
  if (statusLabel.includes("pending")) {
    return { status: "pending", daysUntilExpiry: daysUntil(record.expiryDate) };
  }

  const expiryDate = isoDate(record.expiryDate);
  const until = expiryDate != null ? daysUntil(expiryDate) : null;
  if (expiryDate != null && until != null) {
    if (until < 0) return { status: "expired", daysUntilExpiry: until };
    if (until <= leadDays) return { status: "expiring", daysUntilExpiry: until };
    return { status: "valid", daysUntilExpiry: until };
  }

  if (record.issueDate || record.visaNumber || record.visaStatus) {
    return { status: "missing", daysUntilExpiry: null };
  }
  return { status: "missing", daysUntilExpiry: null };
}

export function buildVisaEmployeeRow(
  staff: StaffWithLookups,
  providers: VisaProProvider[],
  latest: StaffVisaRecord | null,
  docs: { hasResidence: boolean; hasNoc: boolean },
  opts?: {
    /** Map of penalty id → remaining payroll deduction amount (null = not queued). */
    employeePenaltyRemainingById?: Map<string, number | null>;
  },
): VisaEmployeeRow {
  const activeProviders = providers.filter((p) => !p.archived_at);
  const defaultProvider = activeProviders[0] ?? null;
  const leadDays = defaultProvider?.lead_days ?? 30;

  const visaNumber =
    latest?.visaNumber?.trim() ||
    null;
  const issueDate = isoDate(latest?.issueDate) ?? null;
  const expiryDate =
    isoDate(latest?.expiryDate) ?? isoDate(staff.visa_expiry);
  const cancelDate = isoDate(latest?.cancelDate);
  const visaStatus =
    normalizeVisaStatusLabel(latest?.visaStatus) ||
    normalizeVisaStatusLabel(staff.visa_status);
  const valueSpend =
    latest?.valueSpend != null
      ? money(latest.valueSpend)
      : staff.visa_expenses == null
        ? null
        : money(staff.visa_expenses);
  const cancelationSpend =
    latest?.cancelationSpend != null ? money(latest.cancelationSpend) : null;
  const penalties = latest?.penalties ?? [];
  const penaltiesCompanyAbsorbed = sumCompanyCoveredPenalties(penalties);
  const penaltiesEmployeeAbsorbed = sumEmployeeAbsorbedPenalties(penalties);

  let penaltiesEmployeePayrollApplied: boolean | null = null;
  if (penaltiesEmployeeAbsorbed > 0) {
    const employeePenalties = penalties.filter(
      (p) => !p.companyCovered && money(p.amount) > 0,
    );
    const remainingById = opts?.employeePenaltyRemainingById;
    if (!remainingById || employeePenalties.length === 0) {
      penaltiesEmployeePayrollApplied = false;
    } else {
      penaltiesEmployeePayrollApplied = employeePenalties.every((p) => {
        const id = String(p.id ?? "").trim();
        if (!id || !remainingById.has(id)) return false;
        const remaining = remainingById.get(id);
        return remaining != null && remaining <= 0.005;
      });
    }
  }

  const derived = deriveComplianceStatus(
    {
      visaStatus,
      expiryDate,
      cancelDate,
      issueDate,
      visaNumber,
    },
    leadDays,
  );

  const isCanceled = derived.status === "canceled";
  const displayDate = isCanceled ? cancelDate : expiryDate;

  return {
    staff,
    visaNumber,
    issueDate,
    expiryDate,
    cancelDate,
    valueSpend,
    cancelationSpend,
    penaltiesCompanyAbsorbed,
    penaltiesEmployeeAbsorbed,
    penaltiesEmployeePayrollApplied,
    visaStatus,
    displayDate,
    isCanceled,
    status: derived.status,
    daysUntilExpiry: derived.daysUntilExpiry,
    leadDays,
    providerId: defaultProvider?.id ?? null,
    providerName: defaultProvider?.name ?? null,
    providerEmail: defaultProvider?.contact_email ?? null,
    hasNocDocument: docs.hasNoc,
    hasResidenceDocument: docs.hasResidence,
    latestRecordId: latest?.id ?? null,
  };
}

type VisaDocumentMeta = NonNullable<StaffVisaRecord["document"]>;

function visaDocMetaFromRow(
  row: {
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
    doc_kind?: unknown;
  },
  fallbackName: string,
): VisaDocumentMeta | null {
  const fileId = String(row.workdrive_file_id ?? "").trim();
  const id = String(row.id ?? "").trim();
  if (!fileId || !id) return null;
  const fileName = String(row.file_name ?? "").trim() || fallbackName;
  const uploadedAt =
    String(row.uploaded_at ?? "").trim() || new Date().toISOString();
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

async function listVisaDocs(
  supabase: SupabaseClient,
  venueId: string,
  staffIds: string[],
): Promise<{
  residence: Set<string>;
  noc: Set<string>;
  residenceSlotsByStaff: Map<string, Set<string>>;
  nocSlotsByStaff: Map<string, Set<string>>;
  residenceDocsBySlotByStaff: Map<string, Map<string, VisaDocumentMeta>>;
  nocDocsBySlotByStaff: Map<string, Map<string, VisaDocumentMeta>>;
  latestResidenceByStaff: Map<string, VisaDocumentMeta>;
  latestNocByStaff: Map<string, VisaDocumentMeta>;
}> {
  const residence = new Set<string>();
  const noc = new Set<string>();
  const residenceSlotsByStaff = new Map<string, Set<string>>();
  const nocSlotsByStaff = new Map<string, Set<string>>();
  const residenceDocsBySlotByStaff = new Map<
    string,
    Map<string, VisaDocumentMeta>
  >();
  const nocDocsBySlotByStaff = new Map<string, Map<string, VisaDocumentMeta>>();
  const latestResidenceByStaff = new Map<string, VisaDocumentMeta>();
  const latestNocByStaff = new Map<string, VisaDocumentMeta>();
  if (staffIds.length === 0) {
    return {
      residence,
      noc,
      residenceSlotsByStaff,
      nocSlotsByStaff,
      residenceDocsBySlotByStaff,
      nocDocsBySlotByStaff,
      latestResidenceByStaff,
      latestNocByStaff,
    };
  }

  const { data, error } = await supabase
    .from("hr_staff_workdrive_documents")
    .select(
      "id, staff_id, doc_kind, file_slot_id, workdrive_file_id, file_name, permalink, path, subfolder_id, employee_folder_id, uploaded_at, missing_at, missing_reason",
    )
    .eq("venue_id", venueId)
    .in("staff_id", staffIds)
    .in("doc_kind", ["eresidence_card", "visa_noc"])
    .order("uploaded_at", { ascending: false });
  if (error) {
    console.error("[hr] listVisaDocs:", error.message);
    return {
      residence,
      noc,
      residenceSlotsByStaff,
      nocSlotsByStaff,
      residenceDocsBySlotByStaff,
      nocDocsBySlotByStaff,
      latestResidenceByStaff,
      latestNocByStaff,
    };
  }
  for (const row of data ?? []) {
    const staffId = row.staff_id ? String(row.staff_id) : "";
    if (!staffId) continue;
    const slot = String(row.file_slot_id ?? "").trim();

    if (row.doc_kind === "eresidence_card") {
      residence.add(staffId);
      const meta = visaDocMetaFromRow(row, "Residency card");
      if (meta && !latestResidenceByStaff.has(staffId)) {
        latestResidenceByStaff.set(staffId, meta);
      }
      if (slot && slot !== "default") {
        let set = residenceSlotsByStaff.get(staffId);
        if (!set) {
          set = new Set();
          residenceSlotsByStaff.set(staffId, set);
        }
        set.add(slot);
        if (meta) {
          let bySlot = residenceDocsBySlotByStaff.get(staffId);
          if (!bySlot) {
            bySlot = new Map();
            residenceDocsBySlotByStaff.set(staffId, bySlot);
          }
          if (!bySlot.has(slot)) bySlot.set(slot, meta);
        }
      }
    }
    if (row.doc_kind === "visa_noc") {
      noc.add(staffId);
      const meta = visaDocMetaFromRow(row, "Visa NOC");
      if (meta && !latestNocByStaff.has(staffId)) {
        latestNocByStaff.set(staffId, meta);
      }
      if (slot && slot !== "default") {
        let set = nocSlotsByStaff.get(staffId);
        if (!set) {
          set = new Set();
          nocSlotsByStaff.set(staffId, set);
        }
        set.add(slot);
        if (meta) {
          let bySlot = nocDocsBySlotByStaff.get(staffId);
          if (!bySlot) {
            bySlot = new Map();
            nocDocsBySlotByStaff.set(staffId, bySlot);
          }
          if (!bySlot.has(slot)) bySlot.set(slot, meta);
        }
      }
    }
  }
  return {
    residence,
    noc,
    residenceSlotsByStaff,
    nocSlotsByStaff,
    residenceDocsBySlotByStaff,
    nocDocsBySlotByStaff,
    latestResidenceByStaff,
    latestNocByStaff,
  };
}

export function annotateVisaRecordsWithDocuments(
  records: StaffVisaRecord[],
  opts: {
    residenceSlots?: Set<string>;
    nocSlots?: Set<string>;
    hasLegacyResidence?: boolean;
    hasLegacyNoc?: boolean;
    residenceDocsBySlot?: Map<string, VisaDocumentMeta>;
    nocDocsBySlot?: Map<string, VisaDocumentMeta>;
    legacyResidenceDocument?: VisaDocumentMeta | null;
    legacyNocDocument?: VisaDocumentMeta | null;
  },
): StaffVisaRecord[] {
  const latest = pickLatestStaffVisaRecord(records);
  const residenceSlots = opts.residenceSlots;
  const nocSlots = opts.nocSlots;
  return records.map((record) => {
    const residenceLinked = residenceSlots?.has(record.id) ?? false;
    const nocLinked = nocSlots?.has(record.id) ?? false;
    const legacyResidence =
      Boolean(opts.hasLegacyResidence) &&
      !residenceSlots?.size &&
      latest?.id === record.id;
    const legacyNoc =
      Boolean(opts.hasLegacyNoc) &&
      !nocSlots?.size &&
      latest?.id === record.id;
    return {
      ...record,
      hasDocument: residenceLinked || legacyResidence,
      hasNocDocument: nocLinked || legacyNoc,
      document: residenceLinked
        ? (opts.residenceDocsBySlot?.get(record.id) ?? null)
        : legacyResidence
          ? (opts.legacyResidenceDocument ?? null)
          : null,
      nocDocument: nocLinked
        ? (opts.nocDocsBySlot?.get(record.id) ?? null)
        : legacyNoc
          ? (opts.legacyNocDocument ?? null)
          : null,
    };
  });
}

/** Load residency/NOC WorkDrive index for one staff (dialog annotation). */
export async function loadStaffVisaDocumentIndex(
  supabase: SupabaseClient,
  venueId: string,
  staffId: string,
): Promise<{
  residenceSlots: Set<string>;
  nocSlots: Set<string>;
  hasLegacyResidence: boolean;
  hasLegacyNoc: boolean;
  residenceDocsBySlot: Map<string, VisaDocumentMeta>;
  nocDocsBySlot: Map<string, VisaDocumentMeta>;
  legacyResidenceDocument: VisaDocumentMeta | null;
  legacyNocDocument: VisaDocumentMeta | null;
}> {
  const docs = await listVisaDocs(supabase, venueId, [staffId]);
  return {
    residenceSlots: docs.residenceSlotsByStaff.get(staffId) ?? new Set(),
    nocSlots: docs.nocSlotsByStaff.get(staffId) ?? new Set(),
    hasLegacyResidence: docs.residence.has(staffId),
    hasLegacyNoc: docs.noc.has(staffId),
    residenceDocsBySlot:
      docs.residenceDocsBySlotByStaff.get(staffId) ?? new Map(),
    nocDocsBySlot: docs.nocDocsBySlotByStaff.get(staffId) ?? new Map(),
    legacyResidenceDocument: docs.latestResidenceByStaff.get(staffId) ?? null,
    legacyNocDocument: docs.latestNocByStaff.get(staffId) ?? null,
  };
}

type StaffVisaHistoryStore = { records: StaffVisaRecord[] };

export async function loadStaffVisaHistory(
  supabase: SupabaseClient,
  venueId: string,
  staffId: string,
): Promise<StaffVisaRecord[]> {
  const key = staffVisaHistorySettingKey(staffId);
  const { data, error } = await supabase
    .from("hr_venue_settings")
    .select("value")
    .eq("venue_id", venueId)
    .eq("key", key)
    .maybeSingle();
  if (error) {
    console.error("[hr] loadStaffVisaHistory:", error.message);
    return [];
  }
  const raw = (data?.value ?? {}) as Partial<StaffVisaHistoryStore>;
  const records = Array.isArray(raw.records)
    ? raw.records
        .map((row) => normalizeVisaRecord(row))
        .filter((row): row is StaffVisaRecord => row != null)
    : [];
  return sortStaffVisaRecords(records);
}

export async function saveStaffVisaHistory(
  supabase: SupabaseClient,
  venueId: string,
  staffId: string,
  records: StaffVisaRecord[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = staffVisaHistorySettingKey(staffId);
  const value: StaffVisaHistoryStore = {
    records: sortStaffVisaRecords(records),
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

/** Mirror the latest issuance onto staff columns used across HR. */
export async function syncStaffVisaFromLatestRecord(
  supabase: SupabaseClient,
  venueId: string,
  staffId: string,
  records: StaffVisaRecord[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const latest = pickLatestStaffVisaRecord(records);
  const penaltiesPaid = latest ? sumPenalties(latest.penalties) : null;
  const { error } = await supabase
    .from("staff")
    .update({
      visa_status: normalizeVisaStatusLabel(latest?.visaStatus),
      visa_expiry: latest?.expiryDate ?? null,
      visa_expenses: latest?.valueSpend ?? null,
      visa_penalties_paid: penaltiesPaid,
    })
    .eq("id", staffId)
    .eq("home_venue_id", venueId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function loadOrSeedStaffVisaHistory(
  supabase: SupabaseClient,
  venueId: string,
  staff: {
    id: string;
    visa_status?: string | null;
    visa_expiry?: string | null;
    visa_expenses?: number | null;
    visa_penalties_paid?: number | null;
  },
): Promise<StaffVisaRecord[]> {
  const existing = await loadStaffVisaHistory(supabase, venueId, staff.id);
  if (existing.length > 0) return existing;

  const visaStatus = normalizeVisaStatusLabel(staff.visa_status) ?? "";
  const expiryDate = isoDate(staff.visa_expiry);
  const valueSpend =
    staff.visa_expenses == null ? null : money(staff.visa_expenses);
  if (!visaStatus && !expiryDate && valueSpend == null) {
    return [];
  }

  const seeded: StaffVisaRecord = {
    id: crypto.randomUUID(),
    visaNumber: "",
    issueDate: null,
    expiryDate,
    valueSpend,
    cancelationSpend: null,
    penalties: [],
    visaStatus,
    disputeReference: "",
    disputeComments: "",
    cancelDate: null,
    comments: "",
    createdAt: new Date().toISOString(),
    createdBy: null,
  };
  const saved = await saveStaffVisaHistory(supabase, venueId, staff.id, [
    seeded,
  ]);
  if (!saved.ok) {
    console.error("[hr] seedStaffVisaHistory:", saved.error);
    return [seeded];
  }
  return [seeded];
}

export async function loadVisaEmployeesPage(
  supabase: SupabaseClient,
  venueId: string,
) {
  const [providers, staff, departments, positions, statuses, workingStatuses] =
    await Promise.all([
      loadVisaProProviders(supabase, venueId),
      listAllStaff(supabase),
      listDepartments(supabase, venueId),
      listPositions(supabase, venueId),
      listEmploymentStatuses(supabase),
      listWorkingStatuses(supabase),
    ]);

  const venueStaff = staff.filter((s) => s.home_venue_id === venueId);
  const docs = await listVisaDocs(
    supabase,
    venueId,
    venueStaff.map((s) => s.id),
  );

  const { data: historyRows, error: historyError } = await supabase
    .from("hr_venue_settings")
    .select("key, value")
    .eq("venue_id", venueId)
    .like("key", `${HR_SETTINGS_KEYS.staffVisaHistoryPrefix}%`);
  if (historyError) {
    console.error("[hr] loadVisaEmployeesPage history:", historyError.message);
  }

  const latestByStaff = new Map<string, StaffVisaRecord | null>();
  for (const row of historyRows ?? []) {
    const key = String(row.key ?? "");
    if (!key.startsWith(HR_SETTINGS_KEYS.staffVisaHistoryPrefix)) continue;
    const staffId = key.slice(HR_SETTINGS_KEYS.staffVisaHistoryPrefix.length);
    const raw = (row.value ?? {}) as { records?: unknown };
    const records = Array.isArray(raw.records)
      ? raw.records
          .map((item) =>
            normalizeVisaRecord(item as Partial<StaffVisaRecord>),
          )
          .filter((item): item is StaffVisaRecord => item != null)
      : [];
    latestByStaff.set(staffId, pickLatestStaffVisaRecord(records));
  }

  /** penaltyId → remaining amount (0 = fully deducted). */
  const employeePenaltyRemainingById = new Map<string, number | null>();
  const { data: pendingDeductionRows, error: pendingError } = await supabase
    .from("hr_pending_payroll_deductions")
    .select("source_id, remaining_amount, status, amount, original_amount")
    .eq("venue_id", venueId)
    .eq("source", "visa_runs")
    .neq("status", "cancelled");
  if (pendingError) {
    if (!/does not exist|schema cache/i.test(pendingError.message)) {
      console.error(
        "[hr] loadVisaEmployeesPage pending deductions:",
        pendingError.message,
      );
    }
  } else {
    for (const row of pendingDeductionRows ?? []) {
      const sourceId = String(row.source_id ?? "").trim();
      if (!sourceId) continue;
      const status = String(row.status ?? "");
      const remaining = money(
        row.remaining_amount ??
          (status === "pending" ? row.amount : 0),
      );
      employeePenaltyRemainingById.set(sourceId, remaining);
    }
  }

  const rows = venueStaff.map((s) =>
    buildVisaEmployeeRow(s, providers, latestByStaff.get(s.id) ?? null, {
      hasResidence: docs.residence.has(s.id),
      hasNoc: docs.noc.has(s.id),
    }, {
      employeePenaltyRemainingById,
    }),
  );

  return {
    rows,
    providers: providers.filter((p) => !p.archived_at),
    departments,
    positions,
    statuses,
    workingStatuses,
  };
}

function formatExpenseMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return new Date(y, m - 1, 1).toLocaleString("en-AE", {
    month: "long",
    year: "numeric",
  });
}

/**
 * Aggregate visa costs by month into fixed TYPE categories:
 * Visa Processing (value spend by issue date), Visa Penalties (company-covered
 * by issue date), Visa Cancelations (cancelation charge by cancel date).
 */
export async function loadVisaExpensesPage(
  supabase: SupabaseClient,
  venueId: string,
): Promise<{ months: VisaExpenseMonth[] }> {
  const staff = await listAllStaff(supabase);
  const venueStaff = staff.filter((s) => s.home_venue_id === venueId);
  const staffById = new Map(venueStaff.map((s) => [s.id, s]));

  const { data: historyRows, error: historyError } = await supabase
    .from("hr_venue_settings")
    .select("key, value")
    .eq("venue_id", venueId)
    .like("key", `${HR_SETTINGS_KEYS.staffVisaHistoryPrefix}%`);
  if (historyError) {
    console.error("[hr] loadVisaExpensesPage history:", historyError.message);
  }

  const historyByStaff = new Map<string, StaffVisaRecord[]>();
  for (const row of historyRows ?? []) {
    const key = String(row.key ?? "");
    if (!key.startsWith(HR_SETTINGS_KEYS.staffVisaHistoryPrefix)) continue;
    const staffId = key.slice(HR_SETTINGS_KEYS.staffVisaHistoryPrefix.length);
    if (!staffById.has(staffId)) continue;
    const raw = (row.value ?? {}) as { records?: unknown };
    const records = Array.isArray(raw.records)
      ? raw.records
          .map((item) =>
            normalizeVisaRecord(item as Partial<StaffVisaRecord>),
          )
          .filter((item): item is StaffVisaRecord => item != null)
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

  function addExpense(params: {
    staff: StaffWithLookups;
    category: (typeof VISA_EXPENSE_CATEGORY)[keyof typeof VISA_EXPENSE_CATEGORY];
    value: number;
    eventDate: string;
    reference?: string;
  }) {
    const grossValue = money(params.value);
    if (grossValue <= 0) return;

    const costs = splitGrossAtVatRate(grossValue);
    const monthKey = params.eventDate.slice(0, 7);
    const categoryName = params.category;
    const categoryKey = categoryName.toLowerCase();

    let monthMap = byMonth.get(monthKey);
    if (!monthMap) {
      monthMap = new Map();
      byMonth.set(monthKey, monthMap);
    }

    const staffEntry = {
      staffId: params.staff.id,
      empNo: params.staff.emp_no,
      fullName: params.staff.full_name,
      issuedAt: params.eventDate,
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

  function resolveIssueDate(
    record: StaffVisaRecord,
    s: StaffWithLookups,
  ): string | null {
    // Prefer recorded issue date; otherwise derive from expiry (−2y UAE
    // residency term), staff joining date, or record createdAt so imported
    // gross costs still appear on the expenses report.
    const fromExpiry = (() => {
      const raw = record.expiryDate?.trim();
      if (!raw || !/^\d{4}-\d{2}-\d{2}/.test(raw)) return null;
      const d = new Date(`${raw.slice(0, 10)}T12:00:00Z`);
      if (Number.isNaN(d.getTime())) return null;
      d.setUTCFullYear(d.getUTCFullYear() - 2);
      return d.toISOString().slice(0, 10);
    })();
    const fromJoin = isoDate(s.joining_date);
    const fromCreated = isoDate(record.createdAt);
    return record.issueDate?.trim() || fromExpiry || fromJoin || fromCreated;
  }

  for (const s of venueStaff) {
    const history = historyByStaff.get(s.id) ?? [];
    if (history.length > 0) {
      for (const record of history) {
        const issueDate = resolveIssueDate(record, s);
        const processing = money(record.valueSpend);
        const companyPenalties = sumCompanyCoveredPenalties(record.penalties);

        if (issueDate) {
          if (processing > 0) {
            addExpense({
              staff: s,
              category: VISA_EXPENSE_CATEGORY.processing,
              value: processing,
              eventDate: issueDate,
              reference: record.visaNumber,
            });
          }
          if (companyPenalties > 0) {
            addExpense({
              staff: s,
              category: VISA_EXPENSE_CATEGORY.penalties,
              value: companyPenalties,
              eventDate: issueDate,
              reference: record.visaNumber,
            });
          }
        }

        const cancelSpend = money(record.cancelationSpend);
        const cancelDate = record.cancelDate?.trim();
        if (cancelSpend > 0 && cancelDate) {
          addExpense({
            staff: s,
            category: VISA_EXPENSE_CATEGORY.cancelations,
            value: cancelSpend,
            eventDate: cancelDate,
            reference: record.visaNumber,
          });
        }
      }
      continue;
    }

    // Fallback: no history — roll up staff column costs when a date exists.
    const staffValue = money(s.visa_expenses);
    const staffPenalties = money(s.visa_penalties_paid);
    const issueDate = isoDate(s.joining_date);
    if (!issueDate) continue;
    if (staffValue > 0) {
      addExpense({
        staff: s,
        category: VISA_EXPENSE_CATEGORY.processing,
        value: staffValue,
        eventDate: issueDate,
      });
    }
    if (staffPenalties > 0) {
      addExpense({
        staff: s,
        category: VISA_EXPENSE_CATEGORY.penalties,
        value: staffPenalties,
        eventDate: issueDate,
      });
    }
  }

  function categorySortRank(name: string): number {
    const idx = VISA_EXPENSE_CATEGORY_ORDER.indexOf(
      name as (typeof VISA_EXPENSE_CATEGORY_ORDER)[number],
    );
    return idx === -1 ? VISA_EXPENSE_CATEGORY_ORDER.length : idx;
  }

  const months: VisaExpenseMonth[] = [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([monthKey, linesMap]) => {
      const lines = [...linesMap.values()]
        .map((row) => {
          const staffRows = [...row.staff].sort((a, b) =>
            a.issuedAt < b.issuedAt
              ? 1
              : a.issuedAt > b.issuedAt
                ? -1
                : a.fullName.localeCompare(b.fullName),
          );
          return {
            categoryKey: row.categoryKey,
            name: row.name,
            label: row.label,
            count: row.count,
            net: row.net,
            vat: row.vat,
            gross: row.gross,
            staff: staffRows,
          };
        })
        .sort((a, b) => {
          const rank = categorySortRank(a.name) - categorySortRank(b.name);
          if (rank !== 0) return rank;
          return a.name.localeCompare(b.name);
        });

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

export function formatVisaValueLabel(value: number | null): string {
  if (value == null) return "—";
  return formatAed(value);
}

export function mergeVisaRequestEmailSettings(
  partial:
    | (Partial<HrVisaRequestEmailSettings> & {
        subject?: string;
        message?: string;
      })
    | null
    | undefined,
): HrVisaRequestEmailSettings {
  const base = DEFAULT_HR_VISA_REQUEST_EMAIL_SETTINGS;
  const legacySubject = String(partial?.subject ?? "").trim();
  const legacyMessage = String(partial?.message ?? "").trim();

  return {
    enabled: partial?.enabled ?? base.enabled,
    fromEmail: String(partial?.fromEmail ?? base.fromEmail).trim(),
    issueSubject:
      String(partial?.issueSubject ?? "").trim() ||
      legacySubject ||
      base.issueSubject,
    issueMessage:
      String(partial?.issueMessage ?? "").trim() ||
      legacyMessage ||
      base.issueMessage,
    renewSubject:
      String(partial?.renewSubject ?? "").trim() ||
      legacySubject ||
      base.renewSubject,
    renewMessage:
      String(partial?.renewMessage ?? "").trim() ||
      legacyMessage ||
      base.renewMessage,
    cancelSubject:
      String(partial?.cancelSubject ?? "").trim() || base.cancelSubject,
    cancelMessage:
      String(partial?.cancelMessage ?? "").trim() || base.cancelMessage,
    issueAttachDocuments: normalizeEmailStaffDocumentKeys(
      partial?.issueAttachDocuments,
      base.issueAttachDocuments,
    ),
    renewAttachDocuments: normalizeEmailStaffDocumentKeys(
      partial?.renewAttachDocuments,
      base.renewAttachDocuments,
    ),
    cancelAttachDocuments: normalizeEmailStaffDocumentKeys(
      partial?.cancelAttachDocuments,
      base.cancelAttachDocuments,
    ),
    issueRequireAttachments:
      typeof partial?.issueRequireAttachments === "boolean"
        ? partial.issueRequireAttachments
        : base.issueRequireAttachments,
    renewRequireAttachments:
      typeof partial?.renewRequireAttachments === "boolean"
        ? partial.renewRequireAttachments
        : base.renewRequireAttachments,
    cancelRequireAttachments:
      typeof partial?.cancelRequireAttachments === "boolean"
        ? partial.cancelRequireAttachments
        : base.cancelRequireAttachments,
  };
}
