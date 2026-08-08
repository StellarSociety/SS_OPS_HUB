"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { resolveSignedInUserDisplayName } from "@/lib/auth/resolve-signed-in-user-name";
import { recordOutboundStaffEmail } from "@/lib/email/record-staff-email";
import { sendAppEmail } from "@/lib/email/transport";
import { formatAed, formatDateOnly } from "@/lib/hr/derived";
import {
  inspectStaffEmailAttachments,
  loadStaffEmailAttachments,
  type StaffEmailAttachmentStatus,
} from "@/lib/hr/email-staff-attachments";
import { parseEmailStaffDocumentKeysFromForm } from "@/lib/hr/email-staff-documents";
import { buildHrTemplateEmailHtml } from "@/lib/hr/email-logo";
import { canAdminLookups, canEditAssets, canEditStaff } from "@/lib/hr/permissions";
import { getHrVenueSetting } from "@/lib/hr/store";
import {
  loadOrSeedStaffVisaHistory,
  loadStaffVisaDocumentIndex,
  loadStaffVisaHistory,
  loadVisaProProviders,
  mergeVisaRequestEmailSettings,
  annotateVisaRecordsWithDocuments,
  pickLatestStaffVisaRecord,
  saveStaffVisaHistory,
  saveVisaProProviders,
  sumPenalties,
  syncStaffVisaFromLatestRecord,
} from "@/lib/hr/visa-store";
import {
  stabilizeVisaPenaltyIds,
  syncStaffVisaRunPendingDeductions,
} from "@/lib/hr/payroll/visa-run-pending-deductions";
import { repairLinkedWorkDriveDocExpiryName } from "@/lib/hr/workdrive/staff-upload";
import {
  DEFAULT_HR_VISA_REQUEST_EMAIL_SETTINGS,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  normalizeVisaStatusLabel,
  VISA_STATUS_OPTIONS,
  type HrVisaRequestEmailSettings,
  type StaffVisaRecord,
  type VisaPenalty,
  type VisaProProvider,
  type VisaRequestType,
} from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

function requireManagePermission(
  permissions: Parameters<typeof canEditAssets>[0],
  venueId: string,
): string | null {
  if (
    canEditAssets(permissions, venueId) ||
    canAdminLookups(permissions, venueId)
  ) {
    return null;
  }
  return "No permission to manage visa.";
}

function requireSendPermission(
  permissions: Parameters<typeof canEditStaff>[0],
  venueId: string,
): string | null {
  if (
    canEditStaff(permissions, venueId) ||
    canEditAssets(permissions, venueId) ||
    canAdminLookups(permissions, venueId)
  ) {
    return null;
  }
  return "No permission to send this email.";
}

function revalidateVisaPaths() {
  revalidatePath("/hr/assets/visa", "layout");
  revalidatePath("/hr/settings", "layout");
}

const providerUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  contactPerson: z.string().trim().max(200).optional(),
  contactEmail: z.string().trim().max(200).optional(),
  contactPhone: z.string().trim().max(40).optional(),
  leadDays: z.coerce.number().int().min(0).max(365).optional(),
});

export async function upsertVisaProProvider(
  input: z.infer<typeof providerUpsertSchema>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireManagePermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const parsed = providerUpsertSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const data = parsed.data;
  const email = (data.contactEmail ?? "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid provider email address." };
  }

  const service = createServiceClient();
  const providers = await loadVisaProProviders(service, auth.venue.id);
  let providerId = data.id ?? null;

  if (providerId) {
    const idx = providers.findIndex((p) => p.id === providerId);
    if (idx < 0) return { ok: false, error: "Provider not found." };
    providers[idx] = {
      ...providers[idx],
      name: data.name,
      contact_person: (data.contactPerson ?? "").trim(),
      contact_email: email,
      contact_phone: (data.contactPhone ?? "").trim(),
      lead_days: data.leadDays ?? providers[idx].lead_days ?? 30,
    };
  } else {
    providerId = crypto.randomUUID();
    const maxOrder = providers.reduce(
      (max, p) => Math.max(max, p.sort_order || 0),
      0,
    );
    const created: VisaProProvider = {
      id: providerId,
      name: data.name,
      contact_person: (data.contactPerson ?? "").trim(),
      contact_email: email,
      contact_phone: (data.contactPhone ?? "").trim(),
      lead_days: data.leadDays ?? 30,
      sort_order: maxOrder + 1,
      archived_at: null,
    };
    providers.push(created);
  }

  const saved = await saveVisaProProviders(service, auth.venue.id, providers);
  if (!saved.ok) return saved;

  await writeAuditLog({
    actor_id: auth.user.id,
    action: data.id ? "visa_pro_provider.updated" : "visa_pro_provider.created",
    module_key: HR_MODULE_KEY,
    entity: "hr_venue_settings",
    entity_id: providerId,
    venue_id: auth.venue.id,
    after: { name: data.name },
  });

  revalidateVisaPaths();
  return { ok: true, id: providerId };
}

export async function setVisaProProviderArchived(input: {
  id: string;
  archived: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireManagePermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const schema = z.object({
    id: z.string().uuid(),
    archived: z.boolean(),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const service = createServiceClient();
  const providers = await loadVisaProProviders(service, auth.venue.id);
  const idx = providers.findIndex((p) => p.id === parsed.data.id);
  if (idx < 0) return { ok: false, error: "Provider not found." };

  providers[idx] = {
    ...providers[idx],
    archived_at: parsed.data.archived ? new Date().toISOString() : null,
  };

  const saved = await saveVisaProProviders(service, auth.venue.id, providers);
  if (!saved.ok) return saved;

  await writeAuditLog({
    actor_id: auth.user.id,
    action: parsed.data.archived
      ? "visa_pro_provider.archived"
      : "visa_pro_provider.restored",
    module_key: HR_MODULE_KEY,
    entity: "hr_venue_settings",
    entity_id: parsed.data.id,
    venue_id: auth.venue.id,
  });

  revalidateVisaPaths();
  return { ok: true };
}

export async function reorderVisaProProvidersAction(
  orderedIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireManagePermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const schema = z.array(z.string().uuid()).min(1);
  const parsed = schema.safeParse(orderedIds);
  if (!parsed.success) return { ok: false, error: "Invalid order." };

  const service = createServiceClient();
  const providers = await loadVisaProProviders(service, auth.venue.id);
  const byId = new Map(providers.map((p) => [p.id, p]));
  const next: VisaProProvider[] = [];
  for (const id of parsed.data) {
    const row = byId.get(id);
    if (row) next.push(row);
  }
  for (const row of providers) {
    if (!parsed.data.includes(row.id)) next.push(row);
  }

  const saved = await saveVisaProProviders(service, auth.venue.id, next);
  if (!saved.ok) return saved;

  revalidateVisaPaths();
  return { ok: true };
}

const penaltySchema = z.object({
  id: z.string().uuid().optional(),
  description: z.string().trim().max(500),
  amount: z.coerce.number().min(0).max(999_999_999),
  companyCovered: z.boolean(),
});

const staffVisaRecordSchema = z.object({
  staffId: z.string().uuid(),
  visaNumber: z.string().trim().max(120).optional(),
  issueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  expiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  valueSpend: z.coerce.number().min(0).max(999_999_999).nullable(),
  cancelationSpend: z.coerce.number().min(0).max(999_999_999).nullable().optional(),
  penalties: z.array(penaltySchema).optional(),
  visaStatus: z.string().trim().max(80),
  disputeReference: z.string().trim().max(200).optional(),
  disputeComments: z.string().trim().max(2000).optional(),
  cancelDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  comments: z.string().trim().max(2000).optional(),
});

export async function listStaffVisaRecords(input: {
  staffId: string;
}): Promise<
  | { ok: true; records: StaffVisaRecord[]; latestId: string | null }
  | { ok: false; error: string }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  if (
    !canEditStaff(auth.permissions, auth.venue.id) &&
    !canEditAssets(auth.permissions, auth.venue.id) &&
    !canAdminLookups(auth.permissions, auth.venue.id)
  ) {
    return { ok: false, error: "No permission to view staff visa." };
  }

  const staffId = String(input.staffId ?? "").trim();
  if (!z.string().uuid().safeParse(staffId).success) {
    return { ok: false, error: "Invalid staff." };
  }

  const service = createServiceClient();
  const { data: staff, error } = await service
    .from("staff")
    .select(
      "id, home_venue_id, visa_status, visa_expiry, visa_expenses, visa_penalties_paid",
    )
    .eq("id", staffId)
    .eq("home_venue_id", auth.venue.id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!staff) return { ok: false, error: "Staff not found." };

  const records = await loadOrSeedStaffVisaHistory(
    service,
    auth.venue.id,
    staff,
  );
  const docs = await loadStaffVisaDocumentIndex(
    service,
    auth.venue.id,
    staffId,
  );
  const annotated = annotateVisaRecordsWithDocuments(records, {
    residenceSlots: docs.residenceSlots,
    nocSlots: docs.nocSlots,
    hasLegacyResidence: docs.hasLegacyResidence,
    hasLegacyNoc: docs.hasLegacyNoc,
    residenceDocsBySlot: docs.residenceDocsBySlot,
    nocDocsBySlot: docs.nocDocsBySlot,
    legacyResidenceDocument: docs.legacyResidenceDocument,
    legacyNocDocument: docs.legacyNocDocument,
  });

  const repaired = await Promise.all(
    annotated.map(async (record) => {
      let next = record;
      if (record.document) {
        const document = await repairLinkedWorkDriveDocExpiryName({
          venueId: auth.venue.id,
          doc: record.document,
          expiryDate: record.expiryDate ?? record.cancelDate,
        });
        if (document !== record.document) {
          next = { ...next, document };
        }
      }
      if (record.nocDocument) {
        const nocDocument = await repairLinkedWorkDriveDocExpiryName({
          venueId: auth.venue.id,
          doc: record.nocDocument,
          expiryDate: record.expiryDate ?? record.cancelDate,
        });
        if (nocDocument !== record.nocDocument) {
          next = { ...next, nocDocument };
        }
      }
      return next;
    }),
  );

  const latest = pickLatestStaffVisaRecord(repaired);
  return { ok: true, records: repaired, latestId: latest?.id ?? null };
}

function mapPenalties(
  raw: z.infer<typeof penaltySchema>[] | undefined,
): VisaPenalty[] {
  return (raw ?? []).map((p) => ({
    id: p.id?.trim() || crypto.randomUUID(),
    description: p.description.trim(),
    amount: p.amount,
    companyCovered: p.companyCovered,
  }));
}

async function syncVisaPayrollCharges(opts: {
  service: ReturnType<typeof createServiceClient>;
  venueId: string;
  staffId: string;
  userId: string;
  records: StaffVisaRecord[];
}): Promise<StaffVisaRecord[]> {
  const { records, changed } = stabilizeVisaPenaltyIds(opts.records);
  if (changed) {
    const saved = await saveStaffVisaHistory(
      opts.service,
      opts.venueId,
      opts.staffId,
      records,
    );
    if (!saved.ok) {
      console.error("[visa] stabilize penalty ids:", saved.error);
    }
  }
  try {
    await syncStaffVisaRunPendingDeductions({
      service: opts.service,
      venueId: opts.venueId,
      staffId: opts.staffId,
      userId: opts.userId,
      records,
    });
  } catch (error) {
    console.error(
      "[visa] sync payroll deductions:",
      error instanceof Error ? error.message : error,
    );
  }
  return records;
}

export async function addStaffVisaRecord(
  input: z.infer<typeof staffVisaRecordSchema>,
): Promise<
  | { ok: true; record: StaffVisaRecord }
  | { ok: false; error: string }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  if (
    !canEditStaff(auth.permissions, auth.venue.id) &&
    !canEditAssets(auth.permissions, auth.venue.id)
  ) {
    return { ok: false, error: "No permission to update staff visa." };
  }

  const parsed = staffVisaRecordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const status = normalizeVisaStatusLabel(parsed.data.visaStatus) ?? "";
  if (
    status &&
    !(VISA_STATUS_OPTIONS as readonly string[]).includes(status)
  ) {
    return { ok: false, error: "Invalid visa status." };
  }

  const service = createServiceClient();
  const { data: staff, error: staffError } = await service
    .from("staff")
    .select("id, home_venue_id")
    .eq("id", parsed.data.staffId)
    .eq("home_venue_id", auth.venue.id)
    .maybeSingle();
  if (staffError) return { ok: false, error: staffError.message };
  if (!staff) return { ok: false, error: "Staff not found." };

  const existing = await loadStaffVisaHistory(
    service,
    auth.venue.id,
    parsed.data.staffId,
  );

  const record: StaffVisaRecord = {
    id: crypto.randomUUID(),
    visaNumber: parsed.data.visaNumber?.trim() || "",
    issueDate: parsed.data.issueDate,
    expiryDate: parsed.data.expiryDate,
    valueSpend: parsed.data.valueSpend,
    cancelationSpend: parsed.data.cancelationSpend ?? null,
    penalties: mapPenalties(parsed.data.penalties),
    visaStatus: status,
    disputeReference: parsed.data.disputeReference?.trim() || "",
    disputeComments: parsed.data.disputeComments?.trim() || "",
    cancelDate: parsed.data.cancelDate ?? null,
    comments: parsed.data.comments?.trim() || "",
    createdAt: new Date().toISOString(),
    createdBy: auth.user.id,
  };

  const next = [...existing, record];
  const saved = await saveStaffVisaHistory(
    service,
    auth.venue.id,
    parsed.data.staffId,
    next,
  );
  if (!saved.ok) return saved;

  const syncedRecords = await syncVisaPayrollCharges({
    service,
    venueId: auth.venue.id,
    staffId: parsed.data.staffId,
    userId: auth.user.id,
    records: next,
  });

  const synced = await syncStaffVisaFromLatestRecord(
    service,
    auth.venue.id,
    parsed.data.staffId,
    syncedRecords,
  );
  if (!synced.ok) return synced;

  const savedRecord =
    syncedRecords.find((row) => row.id === record.id) ?? record;

  await writeAuditLog({
    actor_id: auth.user.id,
    action: "staff.visa.record.added",
    module_key: HR_MODULE_KEY,
    entity: "staff",
    entity_id: parsed.data.staffId,
    venue_id: auth.venue.id,
    after: {
      ...savedRecord,
      penaltiesPaid: sumPenalties(savedRecord.penalties),
    },
  });

  revalidateVisaPaths();
  revalidatePath("/hr/staff", "layout");
  revalidatePath("/hr/payroll", "layout");
  return { ok: true, record: savedRecord };
}

export async function deleteStaffVisaRecord(input: {
  staffId: string;
  recordId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  if (
    !canEditStaff(auth.permissions, auth.venue.id) &&
    !canEditAssets(auth.permissions, auth.venue.id)
  ) {
    return { ok: false, error: "No permission to update staff visa." };
  }

  const staffId = String(input.staffId ?? "").trim();
  const recordId = String(input.recordId ?? "").trim();
  if (
    !z.string().uuid().safeParse(staffId).success ||
    !z.string().uuid().safeParse(recordId).success
  ) {
    return { ok: false, error: "Invalid input." };
  }

  const service = createServiceClient();
  const { data: staff, error: staffError } = await service
    .from("staff")
    .select("id")
    .eq("id", staffId)
    .eq("home_venue_id", auth.venue.id)
    .maybeSingle();
  if (staffError) return { ok: false, error: staffError.message };
  if (!staff) return { ok: false, error: "Staff not found." };

  const existing = await loadStaffVisaHistory(service, auth.venue.id, staffId);
  const next = existing.filter((row) => row.id !== recordId);
  if (next.length === existing.length) {
    return { ok: false, error: "Record not found." };
  }

  const saved = await saveStaffVisaHistory(
    service,
    auth.venue.id,
    staffId,
    next,
  );
  if (!saved.ok) return saved;

  await syncVisaPayrollCharges({
    service,
    venueId: auth.venue.id,
    staffId,
    userId: auth.user.id,
    records: next,
  });

  const synced = await syncStaffVisaFromLatestRecord(
    service,
    auth.venue.id,
    staffId,
    next,
  );
  if (!synced.ok) return synced;

  await writeAuditLog({
    actor_id: auth.user.id,
    action: "staff.visa.record.deleted",
    module_key: HR_MODULE_KEY,
    entity: "staff",
    entity_id: staffId,
    venue_id: auth.venue.id,
    after: { recordId },
  });

  revalidateVisaPaths();
  revalidatePath("/hr/staff", "layout");
  revalidatePath("/hr/payroll", "layout");
  return { ok: true };
}

export async function updateStaffVisaRecord(
  input: z.infer<typeof staffVisaRecordSchema> & { recordId: string },
): Promise<
  | { ok: true; record: StaffVisaRecord }
  | { ok: false; error: string }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  if (
    !canEditStaff(auth.permissions, auth.venue.id) &&
    !canEditAssets(auth.permissions, auth.venue.id)
  ) {
    return { ok: false, error: "No permission to update staff visa." };
  }

  const recordId = String(input.recordId ?? "").trim();
  if (!z.string().uuid().safeParse(recordId).success) {
    return { ok: false, error: "Invalid record." };
  }

  const parsed = staffVisaRecordSchema.safeParse({
    staffId: input.staffId,
    visaNumber: input.visaNumber,
    issueDate: input.issueDate,
    expiryDate: input.expiryDate,
    valueSpend: input.valueSpend,
    cancelationSpend: input.cancelationSpend,
    penalties: input.penalties,
    visaStatus: input.visaStatus,
    disputeReference: input.disputeReference,
    disputeComments: input.disputeComments,
    cancelDate: input.cancelDate,
    comments: input.comments,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const status = normalizeVisaStatusLabel(parsed.data.visaStatus) ?? "";
  if (
    status &&
    !(VISA_STATUS_OPTIONS as readonly string[]).includes(status)
  ) {
    return { ok: false, error: "Invalid visa status." };
  }

  const service = createServiceClient();
  const { data: staff, error: staffError } = await service
    .from("staff")
    .select("id, home_venue_id")
    .eq("id", parsed.data.staffId)
    .eq("home_venue_id", auth.venue.id)
    .maybeSingle();
  if (staffError) return { ok: false, error: staffError.message };
  if (!staff) return { ok: false, error: "Staff not found." };

  const existing = await loadStaffVisaHistory(
    service,
    auth.venue.id,
    parsed.data.staffId,
  );
  const index = existing.findIndex((row) => row.id === recordId);
  if (index < 0) return { ok: false, error: "Record not found." };

  const previous = existing[index]!;
  const record: StaffVisaRecord = {
    ...previous,
    visaNumber: parsed.data.visaNumber?.trim() || "",
    issueDate: parsed.data.issueDate,
    expiryDate: parsed.data.expiryDate,
    valueSpend: parsed.data.valueSpend,
    cancelationSpend:
      parsed.data.cancelationSpend !== undefined
        ? parsed.data.cancelationSpend
        : previous.cancelationSpend,
    penalties: mapPenalties(parsed.data.penalties),
    visaStatus: status,
    disputeReference: parsed.data.disputeReference?.trim() || "",
    disputeComments: parsed.data.disputeComments?.trim() || "",
    cancelDate: parsed.data.cancelDate ?? null,
    comments: parsed.data.comments?.trim() || "",
  };

  const next = existing.map((row, i) => (i === index ? record : row));
  const saved = await saveStaffVisaHistory(
    service,
    auth.venue.id,
    parsed.data.staffId,
    next,
  );
  if (!saved.ok) return saved;

  const syncedRecords = await syncVisaPayrollCharges({
    service,
    venueId: auth.venue.id,
    staffId: parsed.data.staffId,
    userId: auth.user.id,
    records: next,
  });

  const synced = await syncStaffVisaFromLatestRecord(
    service,
    auth.venue.id,
    parsed.data.staffId,
    syncedRecords,
  );
  if (!synced.ok) return synced;

  const savedRecord =
    syncedRecords.find((row) => row.id === recordId) ?? record;

  await writeAuditLog({
    actor_id: auth.user.id,
    action: "staff.visa.record.updated",
    module_key: HR_MODULE_KEY,
    entity: "staff",
    entity_id: parsed.data.staffId,
    venue_id: auth.venue.id,
    before: previous,
    after: {
      ...savedRecord,
      penaltiesPaid: sumPenalties(savedRecord.penalties),
    },
  });

  revalidateVisaPaths();
  revalidatePath("/hr/staff", "layout");
  revalidatePath("/hr/payroll", "layout");
  return { ok: true, record: savedRecord };
}

const applyVisaCancelationSchema = z.object({
  staffId: z.string().uuid(),
  cancelDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cancelationSpend: z.coerce.number().min(0).max(999_999_999),
});

/** Apply cancelation date + charge on the latest visa record (status → Visa Canceled). */
export async function applyVisaCancelation(
  input: z.infer<typeof applyVisaCancelationSchema>,
): Promise<
  | { ok: true; record: StaffVisaRecord }
  | { ok: false; error: string }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  if (
    !canEditStaff(auth.permissions, auth.venue.id) &&
    !canEditAssets(auth.permissions, auth.venue.id)
  ) {
    return { ok: false, error: "No permission to update staff visa." };
  }

  const parsed = applyVisaCancelationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const service = createServiceClient();
  const { data: staff, error: staffError } = await service
    .from("staff")
    .select(
      "id, home_venue_id, visa_status, visa_expiry, visa_expenses, visa_penalties_paid",
    )
    .eq("id", parsed.data.staffId)
    .eq("home_venue_id", auth.venue.id)
    .maybeSingle();
  if (staffError) return { ok: false, error: staffError.message };
  if (!staff) return { ok: false, error: "Staff not found." };

  const existing = await loadOrSeedStaffVisaHistory(
    service,
    auth.venue.id,
    staff,
  );
  const latest = pickLatestStaffVisaRecord(existing);
  if (!latest) {
    return {
      ok: false,
      error: "No visa record found. Add a visa reference first.",
    };
  }

  const record: StaffVisaRecord = {
    ...latest,
    cancelDate: parsed.data.cancelDate,
    cancelationSpend: parsed.data.cancelationSpend,
    visaStatus: "Visa Canceled",
  };

  const next = existing.map((row) => (row.id === latest.id ? record : row));
  const saved = await saveStaffVisaHistory(
    service,
    auth.venue.id,
    parsed.data.staffId,
    next,
  );
  if (!saved.ok) return saved;

  const synced = await syncStaffVisaFromLatestRecord(
    service,
    auth.venue.id,
    parsed.data.staffId,
    next,
  );
  if (!synced.ok) return synced;

  await writeAuditLog({
    actor_id: auth.user.id,
    action: "staff.visa.cancelation.applied",
    module_key: HR_MODULE_KEY,
    entity: "staff",
    entity_id: parsed.data.staffId,
    venue_id: auth.venue.id,
    before: latest,
    after: {
      cancelDate: record.cancelDate,
      cancelationSpend: record.cancelationSpend,
      visaStatus: record.visaStatus,
    },
  });

  revalidateVisaPaths();
  revalidatePath("/hr/staff", "layout");
  revalidatePath("/hr/assets/visa/expenses", "page");
  return { ok: true, record };
}

function displayOrDash(value: unknown): string {
  const text = String(value ?? "").trim();
  return text || "—";
}

function displayDateOrDash(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  return formatDateOnly(raw.slice(0, 10));
}

function nationalityNameFromStaff(staff: Record<string, unknown>): string {
  const nationality = staff.nationality as
    | { name?: string | null }
    | { name?: string | null }[]
    | null
    | undefined;
  if (Array.isArray(nationality)) {
    return String(nationality[0]?.name ?? "").trim();
  }
  return String(nationality?.name ?? "").trim();
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

export type VisaRequestEmailUnit = {
  staffId: string;
  requestType: VisaRequestType;
  providerId?: string | null;
  to?: string;
  subject?: string;
  body?: string;
};

export type VisaRequestEmailPreview = {
  staffId: string;
  empNo: string;
  fullName: string;
  requestType: VisaRequestType;
  providerId: string | null;
  providerName: string;
  to: string;
  subject: string;
  body: string;
  /** WorkDrive docs configured for this request type. */
  attachments: StaffEmailAttachmentStatus[];
  /** When true, send fails if any configured attachment is missing. */
  requireAttachments: boolean;
};

function visaRequestTemplateBundle(
  settings: HrVisaRequestEmailSettings,
  requestType: VisaRequestType,
): {
  label: string;
  subject: string;
  message: string;
  attachKeys: HrVisaRequestEmailSettings["issueAttachDocuments"];
  requireAttachments: boolean;
} {
  if (requestType === "renew") {
    return {
      label: "renewal",
      subject: settings.renewSubject,
      message: settings.renewMessage,
      attachKeys: settings.renewAttachDocuments,
      requireAttachments: settings.renewRequireAttachments,
    };
  }
  if (requestType === "cancel") {
    return {
      label: "cancelation",
      subject: settings.cancelSubject,
      message: settings.cancelMessage,
      attachKeys: settings.cancelAttachDocuments,
      requireAttachments: settings.cancelRequireAttachments,
    };
  }
  return {
    label: "issue",
    subject: settings.issueSubject,
    message: settings.issueMessage,
    attachKeys: settings.issueAttachDocuments,
    requireAttachments: settings.issueRequireAttachments,
  };
}

export async function previewVisaRequestEmails(input: {
  units: VisaRequestEmailUnit[];
}): Promise<
  | {
      ok: true;
      previews: VisaRequestEmailPreview[];
      settings: HrVisaRequestEmailSettings;
    }
  | { ok: false; error: string }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireSendPermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const settings = mergeVisaRequestEmailSettings(
    await getHrVenueSetting(
      auth.supabase,
      auth.venue.id,
      HR_SETTINGS_KEYS.visaRequestEmail,
      {},
    ),
  );

  const staffIds = input.units.map((u) => u.staffId);
  if (staffIds.length === 0) {
    return { ok: false, error: "Select at least one employee." };
  }

  const service = createServiceClient();
  const providers = await loadVisaProProviders(service, auth.venue.id);
  const { data: staffRows, error } = await service
    .from("staff")
    .select(
      "id, emp_no, full_name, visa_status, visa_expiry, visa_expenses, passport_no, passport_expiry, eid_no, eid_expiry, home_venue_id, nationality:nationalities(id, name)",
    )
    .in("id", staffIds)
    .eq("home_venue_id", auth.venue.id);
  if (error) return { ok: false, error: error.message };

  const byId = new Map((staffRows ?? []).map((s) => [String(s.id), s]));
  const userName = await resolveSignedInUserDisplayName(
    auth.supabase,
    auth.user.id,
  );
  const previews: VisaRequestEmailPreview[] = [];

  for (const unit of input.units) {
    const staff = byId.get(unit.staffId);
    if (!staff) continue;

    const history = await loadStaffVisaHistory(
      service,
      auth.venue.id,
      unit.staffId,
    );
    const latest = pickLatestStaffVisaRecord(history);

    let provider =
      (unit.providerId
        ? providers.find((p) => !p.archived_at && p.id === unit.providerId)
        : null) ??
      providers.find((p) => !p.archived_at && p.contact_email.trim()) ??
      providers.find((p) => !p.archived_at) ??
      null;

    const template = visaRequestTemplateBundle(settings, unit.requestType);
    const requestTypeLabel = template.label;
    const templateSubject = template.subject;
    const templateMessage = template.message;
    const attachKeys = template.attachKeys;
    const requireAttachments = template.requireAttachments;

    const attachments = await inspectStaffEmailAttachments(
      service,
      auth.venue.id,
      unit.staffId,
      attachKeys,
    );

    const vars: Record<string, string> = {
      PROVIDER_CONTACT:
        provider?.contact_person?.trim() || provider?.name || "PRO Provider",
      PROVIDER_COMPANY: provider?.name ?? "",
      EMPLOYEE_NAME: String(staff.full_name ?? ""),
      EMP_NO: String(staff.emp_no ?? ""),
      VISA_NUMBER: latest?.visaNumber?.trim() || "—",
      VISA_STATUS:
        latest?.visaStatus?.trim() ||
        String(staff.visa_status ?? "").trim() ||
        "—",
      ISSUE_DATE: latest?.issueDate
        ? formatDateOnly(latest.issueDate)
        : "—",
      EXPIRY_DATE: latest?.expiryDate
        ? formatDateOnly(latest.expiryDate)
        : staff.visa_expiry
          ? formatDateOnly(String(staff.visa_expiry).slice(0, 10))
          : "—",
      CANCEL_DATE: latest?.cancelDate
        ? formatDateOnly(latest.cancelDate)
        : "—",
      CANCELATION_GROSS:
        latest?.cancelationSpend != null
          ? formatAed(latest.cancelationSpend)
          : "—",
      PASSPORT_NO: displayOrDash(staff.passport_no),
      PASSPORT_ORIGIN: displayOrDash(
        nationalityNameFromStaff(staff as Record<string, unknown>),
      ),
      PASSPORT_EXPIRY: displayDateOrDash(staff.passport_expiry),
      EID_NO: displayOrDash(staff.eid_no),
      EID_EXPIRY: displayDateOrDash(staff.eid_expiry),
      REQUEST_TYPE: requestTypeLabel,
      VENUE_NAME: auth.venue.name ?? "",
      USER_NAME: userName,
      VALUE_SPEND:
        latest?.valueSpend != null
          ? formatAed(latest.valueSpend)
          : staff.visa_expenses == null
            ? "—"
            : formatAed(Number(staff.visa_expenses)),
    };

    previews.push({
      staffId: unit.staffId,
      empNo: String(staff.emp_no ?? ""),
      fullName: String(staff.full_name ?? ""),
      requestType: unit.requestType,
      providerId: provider?.id ?? null,
      providerName: provider?.name ?? "",
      to: unit.to?.trim() || provider?.contact_email?.trim() || "",
      subject: unit.subject?.trim() || applyTemplate(templateSubject, vars),
      body: unit.body?.trim() || applyTemplate(templateMessage, vars),
      attachments,
      requireAttachments,
    });
  }

  return { ok: true, previews, settings };
}

export async function sendVisaRequestEmails(input: {
  units: VisaRequestEmailUnit[];
}): Promise<{ ok: true; sent: number } | { ok: false; error: string }> {
  const preview = await previewVisaRequestEmails(input);
  if (!preview.ok) return preview;

  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireSendPermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  if (!preview.settings.enabled) {
    return { ok: false, error: "Visa request emails are disabled." };
  }

  const supabase = createServiceClient();
  let sent = 0;

  for (const unit of preview.previews) {
    if (!unit.to) {
      return {
        ok: false,
        error: `No PRO provider email for ${unit.fullName}.`,
      };
    }

    const template = visaRequestTemplateBundle(
      preview.settings,
      unit.requestType,
    );
    const attachKeys = template.attachKeys;
    const requireAttachments = template.requireAttachments;

    const staffDocs = await loadStaffEmailAttachments({
      supabase,
      venueId: auth.venue.id,
      staffId: unit.staffId,
      empNo: unit.empNo,
      keys: attachKeys,
      requireAll: requireAttachments,
    });
    if (!staffDocs.ok) {
      return {
        ok: false,
        error: `${unit.fullName}: ${staffDocs.error}`,
      };
    }

    const { html, inlineAttachments } = await buildHrTemplateEmailHtml({
      body: unit.body,
      venue: {
        id: auth.venue.id,
        name: auth.venue.name,
        slug: auth.venue.slug ?? "",
        logo_url: auth.venue.logo_url,
      },
    });

    const attachments = [...inlineAttachments, ...staffDocs.attachments];

    let sendResult: Awaited<ReturnType<typeof sendAppEmail>>;
    try {
      sendResult = await sendAppEmail(
        {
          to: unit.to,
          subject: unit.subject,
          html,
          attachments: attachments.length > 0 ? attachments : undefined,
          fromOverride: preview.settings.fromEmail || undefined,
        },
        { venueId: auth.venue.id, supabase },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to send email.";
      return { ok: false, error: `${unit.fullName}: ${message}` };
    }

    // Issue/renew requests move the employee to Visa Applied Pending.
    // Cancelation emails keep Visa Canceled (already set when applying).
    if (unit.requestType !== "cancel") {
      await supabase
        .from("staff")
        .update({ visa_status: "Visa Applied Pending" })
        .eq("id", unit.staffId)
        .eq("home_venue_id", auth.venue.id);

      const history = await loadStaffVisaHistory(
        supabase,
        auth.venue.id,
        unit.staffId,
      );
      const latest = pickLatestStaffVisaRecord(history);
      if (latest) {
        const next = history.map((row) =>
          row.id === latest.id
            ? { ...row, visaStatus: "Visa Applied Pending" }
            : row,
        );
        await saveStaffVisaHistory(supabase, auth.venue.id, unit.staffId, next);
      }
    }

    const auditId = await writeAuditLog({
      actor_id: auth.user.id,
      action: "visa_request_email.sent",
      module_key: HR_MODULE_KEY,
      entity: "staff",
      entity_id: unit.staffId,
      venue_id: auth.venue.id,
      after: {
        to: unit.to,
        requestType: unit.requestType,
        providerName: unit.providerName,
      },
    });

    if (sendResult.messageId && auditId) {
      await recordOutboundStaffEmail({
        supabase,
        venueId: auth.venue.id,
        staffId: unit.staffId,
        rfcMessageId: sendResult.messageId,
        subject: unit.subject,
        fromEmail: preview.settings.fromEmail || null,
        toEmail: unit.to,
        bodyHtml: html,
        bodyText: unit.body,
        sourceKind: "audit",
        sourceId: auditId,
      });
    }

    sent += 1;
  }

  revalidateVisaPaths();
  revalidatePath("/hr/staff", "layout");
  return { ok: true, sent };
}

export type VisaRequestEmailSendRecord = {
  id: string;
  sentAt: string;
  staffId: string;
  employeeName: string;
  empNo: string;
  to: string | null;
  providerName: string | null;
  requestType: string | null;
  sentBy: string | null;
};

export async function listVisaRequestEmailSends(): Promise<
  | { ok: true; sends: VisaRequestEmailSendRecord[] }
  | { ok: false; error: string }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireSendPermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const service = createServiceClient();
  const { data, error } = await service
    .from("audit_log")
    .select("id, actor_id, entity_id, after, created_at")
    .eq("venue_id", auth.venue.id)
    .eq("entity", "staff")
    .eq("action", "visa_request_email.sent")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return { ok: false, error: error.message };

  const rows = data ?? [];
  const staffIds = [
    ...new Set(
      rows
        .map((row) => (row.entity_id ? String(row.entity_id).trim() : ""))
        .filter(Boolean),
    ),
  ];
  const actorIds = [
    ...new Set(
      rows
        .map((row) => (row.actor_id ? String(row.actor_id).trim() : ""))
        .filter(Boolean),
    ),
  ];

  const staffNames = new Map<string, { fullName: string; empNo: string }>();
  if (staffIds.length > 0) {
    const { data: staffRows } = await service
      .from("staff")
      .select("id, full_name, emp_no")
      .in("id", staffIds)
      .eq("home_venue_id", auth.venue.id);
    for (const staff of staffRows ?? []) {
      staffNames.set(String(staff.id), {
        fullName: String(staff.full_name ?? "").trim() || "Employee",
        empNo: String(staff.emp_no ?? "").trim(),
      });
    }
  }

  const actorNames = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles } = await service
      .from("profiles")
      .select("id, full_name, email")
      .in("id", actorIds);
    for (const profile of profiles ?? []) {
      const name =
        String(profile.full_name ?? "").trim() ||
        String(profile.email ?? "").trim();
      if (name) actorNames.set(String(profile.id), name);
    }
  }

  const sends: VisaRequestEmailSendRecord[] = rows.map((row) => {
    const after =
      row.after && typeof row.after === "object" && !Array.isArray(row.after)
        ? (row.after as Record<string, unknown>)
        : {};
    const staffId = row.entity_id ? String(row.entity_id) : "";
    const staff = staffNames.get(staffId);
    const actorId = row.actor_id ? String(row.actor_id) : "";
    const requestType = String(after.requestType ?? "").trim() || null;
    return {
      id: String(row.id),
      sentAt: String(row.created_at),
      staffId,
      employeeName: staff?.fullName ?? "Employee",
      empNo: staff?.empNo ?? "",
      to: String(after.to ?? "").trim() || null,
      providerName: String(after.providerName ?? "").trim() || null,
      requestType,
      sentBy: actorId ? (actorNames.get(actorId) ?? null) : null,
    };
  });

  return { ok: true, sends };
}

export async function getVisaRequestEmailSettings(): Promise<HrVisaRequestEmailSettings> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return DEFAULT_HR_VISA_REQUEST_EMAIL_SETTINGS;

  const stored = await getHrVenueSetting<
    Partial<HrVisaRequestEmailSettings> & {
      subject?: string;
      message?: string;
    }
  >(
    auth.supabase,
    auth.venue.id,
    HR_SETTINGS_KEYS.visaRequestEmail,
    {},
  );
  return mergeVisaRequestEmailSettings(stored);
}

function flagTrue(raw: FormDataEntryValue | null): boolean {
  const v = String(raw ?? "").toLowerCase();
  return v === "true" || v === "on" || v === "1";
}

export async function saveVisaRequestEmailSettings(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  if (
    !canEditStaff(auth.permissions, auth.venue.id) &&
    !canEditAssets(auth.permissions, auth.venue.id) &&
    !canAdminLookups(auth.permissions, auth.venue.id)
  ) {
    return { ok: false, error: "No permission to save these settings." };
  }

  const next = mergeVisaRequestEmailSettings({
    enabled: flagTrue(formData.get("enabled")),
    fromEmail: String(formData.get("from_email") ?? ""),
    issueSubject: String(formData.get("issue_subject") ?? ""),
    issueMessage: String(formData.get("issue_message") ?? ""),
    renewSubject: String(formData.get("renew_subject") ?? ""),
    renewMessage: String(formData.get("renew_message") ?? ""),
    cancelSubject: String(formData.get("cancel_subject") ?? ""),
    cancelMessage: String(formData.get("cancel_message") ?? ""),
    issueAttachDocuments: parseEmailStaffDocumentKeysFromForm(
      formData,
      "issue_attach_documents",
      DEFAULT_HR_VISA_REQUEST_EMAIL_SETTINGS.issueAttachDocuments,
    ),
    renewAttachDocuments: parseEmailStaffDocumentKeysFromForm(
      formData,
      "renew_attach_documents",
      DEFAULT_HR_VISA_REQUEST_EMAIL_SETTINGS.renewAttachDocuments,
    ),
    cancelAttachDocuments: parseEmailStaffDocumentKeysFromForm(
      formData,
      "cancel_attach_documents",
      DEFAULT_HR_VISA_REQUEST_EMAIL_SETTINGS.cancelAttachDocuments,
    ),
    issueRequireAttachments: flagTrue(
      formData.get("issue_attach_documents_require"),
    ),
    renewRequireAttachments: flagTrue(
      formData.get("renew_attach_documents_require"),
    ),
    cancelRequireAttachments: flagTrue(
      formData.get("cancel_attach_documents_require"),
    ),
  });

  try {
    const service = createServiceClient();
    const { error } = await service.from("hr_venue_settings").upsert(
      {
        venue_id: auth.venue.id,
        key: HR_SETTINGS_KEYS.visaRequestEmail,
        value: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "venue_id,key" },
    );
    if (error) return { ok: false, error: error.message };

    await writeAuditLog({
      actor_id: auth.user.id,
      action: "update",
      module_key: HR_MODULE_KEY,
      entity: "hr_venue_settings",
      entity_id: HR_SETTINGS_KEYS.visaRequestEmail,
      venue_id: auth.venue.id,
      after: { enabled: next.enabled },
    });

    revalidatePath("/hr/settings/emails", "layout");
    revalidatePath("/hr/settings/emails/other/visa-request", "page");
    revalidateVisaPaths();
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Could not save email settings.",
    };
  }
}

export type VisaPenaltyPayrollApplication = {
  runId: string;
  payrollMonth: string | null;
  amount: number;
  runStatus: string | null;
};

export type VisaEmployeePenaltyDeductionLine = {
  penaltyId: string;
  description: string;
  visaNumber: string;
  amount: number;
  status: "pending" | "applied" | "cleared" | "cancelled" | "unqueued";
  originalAmount: number;
  remainingAmount: number;
  deductedAmount: number;
  applications: VisaPenaltyPayrollApplication[];
};

function roundDeductionMoney(value: number): number {
  return Math.round(Math.abs(value) * 100) / 100;
}

/** Employee-absorbed visa penalties and which payrolls have deducted them. */
export async function listStaffVisaEmployeePenaltyDeductions(input: {
  staffId: string;
}): Promise<
  | {
      ok: true;
      lines: VisaEmployeePenaltyDeductionLine[];
      totalEmployeeAbsorbed: number;
      totalDeducted: number;
      totalRemaining: number;
    }
  | { ok: false; error: string }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  if (
    !canEditStaff(auth.permissions, auth.venue.id) &&
    !canEditAssets(auth.permissions, auth.venue.id) &&
    !canAdminLookups(auth.permissions, auth.venue.id)
  ) {
    return { ok: false, error: "No permission to view visa deductions." };
  }

  const staffId = String(input.staffId ?? "").trim();
  if (!z.string().uuid().safeParse(staffId).success) {
    return { ok: false, error: "Invalid staff." };
  }

  const service = createServiceClient();
  const { data: staff, error: staffError } = await service
    .from("staff")
    .select("id")
    .eq("id", staffId)
    .eq("home_venue_id", auth.venue.id)
    .maybeSingle();
  if (staffError) return { ok: false, error: staffError.message };
  if (!staff) return { ok: false, error: "Staff not found." };

  const records = await loadStaffVisaHistory(service, auth.venue.id, staffId);

  type PendingRow = {
    id: string;
    source_id: string | null;
    amount: number;
    original_amount: number;
    remaining_amount: number;
    status: string;
    reason: string;
    applied_run_id: string | null;
  };

  const { data: pendingRows, error: pendingError } = await service
    .from("hr_pending_payroll_deductions")
    .select(
      "id, source_id, amount, original_amount, remaining_amount, status, reason, applied_run_id",
    )
    .eq("venue_id", auth.venue.id)
    .eq("staff_id", staffId)
    .eq("source", "visa_runs")
    .neq("status", "cancelled");

  if (pendingError && !/does not exist|schema cache/i.test(pendingError.message)) {
    return { ok: false, error: pendingError.message };
  }

  const pendingBySource = new Map<string, PendingRow>();
  for (const row of pendingRows ?? []) {
    const sourceId = row.source_id ? String(row.source_id) : "";
    if (!sourceId) continue;
    pendingBySource.set(sourceId, {
      id: String(row.id),
      source_id: sourceId,
      amount: Number(row.amount ?? 0),
      original_amount: Number(row.original_amount ?? row.amount ?? 0),
      remaining_amount: Number(
        row.remaining_amount ??
          (String(row.status) === "pending" ? row.amount : 0),
      ),
      status: String(row.status ?? "pending"),
      reason: String(row.reason ?? ""),
      applied_run_id: row.applied_run_id
        ? String(row.applied_run_id)
        : null,
    });
  }

  const pendingIds = [...pendingBySource.values()].map((p) => p.id);
  const applicationsByPending = new Map<
    string,
    VisaPenaltyPayrollApplication[]
  >();

  if (pendingIds.length > 0) {
    const { data: apps, error: appsError } = await service
      .from("hr_payroll_deduction_applications")
      .select("pending_deduction_id, run_id, amount, created_at")
      .eq("venue_id", auth.venue.id)
      .in("pending_deduction_id", pendingIds)
      .order("created_at", { ascending: true });

    if (!appsError && (apps?.length ?? 0) > 0) {
      const runIds = [...new Set((apps ?? []).map((a) => String(a.run_id)))];
      const { data: runs } = await service
        .from("hr_payroll_runs")
        .select("id, status, payroll_month")
        .in("id", runIds);
      const runById = new Map(
        (runs ?? []).map((run) => [
          String(run.id),
          {
            status: String(run.status ?? ""),
            payroll_month: run.payroll_month
              ? String(run.payroll_month).slice(0, 10)
              : null,
          },
        ]),
      );

      for (const app of apps ?? []) {
        const pendingId = String(app.pending_deduction_id);
        const runId = String(app.run_id);
        const run = runById.get(runId);
        const list = applicationsByPending.get(pendingId) ?? [];
        list.push({
          runId,
          payrollMonth: run?.payroll_month ?? null,
          amount: roundDeductionMoney(Number(app.amount ?? 0)),
          runStatus: run?.status ?? null,
        });
        applicationsByPending.set(pendingId, list);
      }
    }
  }

  // Legacy applied_run_id fallback when applications table has no rows.
  const legacyRunIds = [
    ...new Set(
      [...pendingBySource.values()]
        .filter(
          (p) =>
            p.applied_run_id &&
            (p.status === "applied" || p.status === "cleared") &&
            !(applicationsByPending.get(p.id)?.length),
        )
        .map((p) => p.applied_run_id as string),
    ),
  ];
  const legacyRunById = new Map<
    string,
    { status: string; payroll_month: string | null }
  >();
  if (legacyRunIds.length > 0) {
    const { data: runs } = await service
      .from("hr_payroll_runs")
      .select("id, status, payroll_month")
      .in("id", legacyRunIds);
    for (const run of runs ?? []) {
      legacyRunById.set(String(run.id), {
        status: String(run.status ?? ""),
        payroll_month: run.payroll_month
          ? String(run.payroll_month).slice(0, 10)
          : null,
      });
    }
  }

  const lines: VisaEmployeePenaltyDeductionLine[] = [];
  for (const record of records) {
    for (const penalty of record.penalties) {
      if (penalty.companyCovered) continue;
      const amount = roundDeductionMoney(Number(penalty.amount ?? 0));
      if (!(amount > 0)) continue;
      const penaltyId = String(penalty.id ?? "").trim();
      const pending = penaltyId ? pendingBySource.get(penaltyId) : undefined;
      let applications =
        (pending ? applicationsByPending.get(pending.id) : null) ?? [];
      if (
        applications.length === 0 &&
        pending?.applied_run_id &&
        (pending.status === "applied" || pending.status === "cleared")
      ) {
        const run = legacyRunById.get(pending.applied_run_id);
        const deducted = roundDeductionMoney(
          Number(pending.original_amount) - Number(pending.remaining_amount),
        );
        applications = [
          {
            runId: pending.applied_run_id,
            payrollMonth: run?.payroll_month ?? null,
            amount: deducted > 0 ? deducted : amount,
            runStatus: run?.status ?? null,
          },
        ];
      }

      const originalAmount = pending
        ? roundDeductionMoney(Number(pending.original_amount))
        : amount;
      const remainingAmount = pending
        ? roundDeductionMoney(Number(pending.remaining_amount))
        : amount;
      const deductedAmount = roundDeductionMoney(
        Math.max(0, originalAmount - remainingAmount),
      );
      const status = pending
        ? (pending.status as VisaEmployeePenaltyDeductionLine["status"])
        : "unqueued";

      lines.push({
        penaltyId: penaltyId || crypto.randomUUID(),
        description: penalty.description.trim() || "Visa penalty / fine",
        visaNumber: record.visaNumber.trim(),
        amount,
        status,
        originalAmount,
        remainingAmount,
        deductedAmount,
        applications,
      });
    }
  }

  const totalEmployeeAbsorbed = roundDeductionMoney(
    lines.reduce((sum, line) => sum + line.amount, 0),
  );
  const totalDeducted = roundDeductionMoney(
    lines.reduce((sum, line) => sum + line.deductedAmount, 0),
  );
  const totalRemaining = roundDeductionMoney(
    lines.reduce((sum, line) => sum + line.remainingAmount, 0),
  );

  return {
    ok: true,
    lines,
    totalEmployeeAbsorbed,
    totalDeducted,
    totalRemaining,
  };
}
