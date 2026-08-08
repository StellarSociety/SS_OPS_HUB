"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { resolveSignedInUserDisplayName } from "@/lib/auth/resolve-signed-in-user-name";
import {
  buildCertificationProviderEmailUnits,
  buildCertificationRequestEmailVars,
  composeCertificationRequestEmailContent,
  deliverCertificationRequestEmail,
  inspectStaffIdentityAttachments,
  mergeCertificationRequestEmailSettings,
  type CertificationRequestStaff,
  type IdentityAttachmentStatus,
} from "@/lib/hr/process-certification-request-emails";
import { canAdminLookups, canEditAssets, canEditStaff } from "@/lib/hr/permissions";
import { loadCertificationTypesNormalized } from "@/lib/hr/certifications-store";
import { splitGrossAtVatRate } from "@/lib/hr/certification-costs";
import { parseEmailStaffDocumentKeysFromForm } from "@/lib/hr/email-staff-documents";
import { getHrVenueSetting } from "@/lib/hr/store";
import {
  DEFAULT_HR_CERTIFICATION_REQUEST_EMAIL_SETTINGS,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  type CertificationStaffField,
  type CertificationType,
  type HrCertificationRequestEmailSettings,
} from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

const CERT_STAFF_FIELDS = new Set<CertificationStaffField>([
  "ohc_date",
  "pic_date",
  "basic_food_safety_date",
  "fire_safety_date",
  "first_aid_date",
]);

const STAFF_SELECT =
  "id, emp_no, full_name, personal_email, work_email, home_venue_id, passport_no, passport_expiry, eid_no, eid_expiry, nationality:nationalities(id, name)";

function mapStaffForCertificationEmail(
  row: Record<string, unknown>,
): CertificationRequestStaff {
  const nationality = row.nationality as
    | { name?: string | null }
    | { name?: string | null }[]
    | null
    | undefined;
  const nationalityName = Array.isArray(nationality)
    ? nationality[0]?.name
    : nationality?.name;
  return {
    id: String(row.id),
    emp_no: String(row.emp_no ?? ""),
    full_name: String(row.full_name ?? ""),
    passport_no: (row.passport_no as string | null) ?? null,
    passport_expiry: (row.passport_expiry as string | null) ?? null,
    eid_no: (row.eid_no as string | null) ?? null,
    eid_expiry: (row.eid_expiry as string | null) ?? null,
    passport_origin: nationalityName?.trim() || null,
  };
}

function flagTrue(raw: FormDataEntryValue | null): boolean {
  const v = String(raw ?? "").toLowerCase();
  return v === "true" || v === "on" || v === "1";
}

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
  return "No permission to manage certifications.";
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

function revalidateCertPaths() {
  revalidatePath("/hr/assets/certifications", "layout");
  revalidatePath("/hr/settings", "layout");
}

const upsertSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  label: z.string().trim().max(80).optional(),
  renewalMonths: z.coerce.number().int().min(1).max(120),
  leadDays: z.coerce.number().int().min(0).max(365).optional(),
  providerCompany: z.string().trim().max(200).optional(),
  contactPerson: z.string().trim().max(200).optional(),
  contactEmail: z.string().trim().max(200).optional(),
  contactPhone: z.string().trim().max(40).optional(),
  costValue: z.coerce.number().min(0).max(999_999_999).optional(),
  costNet: z.coerce.number().min(0).max(999_999_999).optional(),
  costVat: z.coerce.number().min(0).max(999_999_999).optional(),
});

export async function updateCertificationTypeDetails(input: {
  id: string;
  name: string;
  label?: string;
  renewalMonths: number;
  leadDays?: number;
  providerCompany?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  costValue?: number;
  costNet?: number;
  costVat?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireManagePermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const email = (parsed.data.contactEmail ?? "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid provider email address." };
  }

  const service = createServiceClient();
  const gross = parsed.data.costValue ?? 0;
  const split = splitGrossAtVatRate(gross);
  const payload = {
    name: parsed.data.name,
    label: (parsed.data.label ?? "").trim(),
    renewal_months: parsed.data.renewalMonths,
    lead_days: parsed.data.leadDays ?? 30,
    provider_company: (parsed.data.providerCompany ?? "").trim(),
    contact_person: (parsed.data.contactPerson ?? "").trim(),
    contact_email: email,
    contact_phone: (parsed.data.contactPhone ?? "").trim(),
    cost_value: split.gross,
    cost_net: split.net,
    cost_vat: split.vat,
  };

  const { error } = await service
    .from("certification_types")
    .update(payload)
    .eq("id", parsed.data.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  await writeAuditLog({
    actor_id: auth.user.id,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "certification_types",
    entity_id: parsed.data.id,
    venue_id: auth.venue.id,
    after: payload,
  });

  revalidateCertPaths();
  return { ok: true };
}

export async function setCertificationTypeArchived(input: {
  id: string;
  archived: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireManagePermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const id = String(input.id ?? "").trim();
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid certification." };
  }

  const archivedAt = input.archived ? new Date().toISOString() : null;
  const service = createServiceClient();
  const { error } = await service
    .from("certification_types")
    .update({ archived_at: archivedAt })
    .eq("id", id);

  if (error) {
    return { ok: false, error: error.message };
  }

  await writeAuditLog({
    actor_id: auth.user.id,
    action: input.archived ? "archive" : "unarchive",
    module_key: HR_MODULE_KEY,
    entity: "certification_types",
    entity_id: id,
    venue_id: auth.venue.id,
    after: { archived_at: archivedAt },
  });

  revalidateCertPaths();
  return { ok: true };
}

export async function reorderCertificationTypesAction(
  orderedIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireManagePermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const ids = orderedIds.filter((id) => z.string().uuid().safeParse(id).success);
  if (ids.length === 0) {
    return { ok: false, error: "Nothing to reorder." };
  }

  const service = createServiceClient();
  const results = await Promise.all(
    ids.map((id, index) =>
      service
        .from("certification_types")
        .update({ sort_order: index + 1 })
        .eq("id", id),
    ),
  );
  const firstError = results.find((r) => r.error)?.error;
  if (firstError) {
    return { ok: false, error: firstError.message };
  }

  await writeAuditLog({
    actor_id: auth.user.id,
    action: "reorder",
    module_key: HR_MODULE_KEY,
    entity: "certification_types",
    venue_id: auth.venue.id,
    after: { orderedIds: ids },
  });

  revalidateCertPaths();
  return { ok: true };
}

export async function getCertificationRequestEmailSettings(): Promise<HrCertificationRequestEmailSettings> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return DEFAULT_HR_CERTIFICATION_REQUEST_EMAIL_SETTINGS;

  const stored = await getHrVenueSetting<
    Partial<HrCertificationRequestEmailSettings>
  >(
    auth.supabase,
    auth.venue.id,
    HR_SETTINGS_KEYS.certificationRequestEmail,
    {},
  );
  return mergeCertificationRequestEmailSettings(stored);
}

export async function saveCertificationRequestEmailSettings(
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

  const next = mergeCertificationRequestEmailSettings({
    enabled: flagTrue(formData.get("enabled")),
    fromEmail: String(formData.get("from_email") ?? ""),
    subject: String(formData.get("subject") ?? ""),
    message: String(formData.get("message") ?? ""),
    attachDocuments: parseEmailStaffDocumentKeysFromForm(
      formData,
      "attach_documents",
      DEFAULT_HR_CERTIFICATION_REQUEST_EMAIL_SETTINGS.attachDocuments,
    ),
    requireAttachments: flagTrue(formData.get("attach_documents_require")),
  });

  try {
    const service = createServiceClient();
    const { error } = await service.from("hr_venue_settings").upsert(
      {
        venue_id: auth.venue.id,
        key: HR_SETTINGS_KEYS.certificationRequestEmail,
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
      entity_id: HR_SETTINGS_KEYS.certificationRequestEmail,
      venue_id: auth.venue.id,
      after: { enabled: next.enabled },
    });

    revalidatePath("/hr/settings/emails", "layout");
    revalidatePath("/hr/settings/emails/other/certification-request", "page");
    revalidateCertPaths();
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Could not save email settings.",
    };
  }
}

export async function refreshCertificationIdentityAttachments(
  staffId: string,
): Promise<
  | { ok: true; attachments: IdentityAttachmentStatus[] }
  | { ok: false; error: string }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireSendPermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const id = String(staffId ?? "").trim();
  if (!id) return { ok: false, error: "Missing staff id." };

  const service = createServiceClient();
  const stored = await getHrVenueSetting(
    auth.supabase,
    auth.venue.id,
    HR_SETTINGS_KEYS.certificationRequestEmail,
    {},
  );
  const settings = mergeCertificationRequestEmailSettings(stored);
  const attachments = await inspectStaffIdentityAttachments(
    service,
    auth.venue.id,
    id,
    settings.attachDocuments,
  );
  return { ok: true, attachments };
}

export type CertificationRequestEmailPreview = {
  id: string;
  staffId: string;
  empNo: string;
  employeeName: string;
  to: string;
  providerCompany: string;
  providerContact: string;
  subject: string;
  body: string;
  certificationNames: string[];
  attachments: IdentityAttachmentStatus[];
};

export type CertificationRequestEmailSelection = {
  staffId: string;
  certificationIds: string[];
};

function normalizeEmailSelections(
  selections: CertificationRequestEmailSelection[] | undefined,
): Map<string, string[]> {
  const byStaff = new Map<string, string[]>();
  for (const row of selections ?? []) {
    const staffId = String(row?.staffId ?? "").trim();
    if (!staffId) continue;
    const ids = [
      ...new Set(
        (row.certificationIds ?? [])
          .map(String)
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ];
    if (ids.length === 0) continue;
    byStaff.set(staffId, ids);
  }
  return byStaff;
}

export async function previewCertificationRequestEmails(input: {
  selections: CertificationRequestEmailSelection[];
}): Promise<
  | {
      ok: true;
      previews: CertificationRequestEmailPreview[];
      settingsEnabled: boolean;
      requireAttachments: boolean;
    }
  | { ok: false; error: string }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireSendPermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const selectionByStaff = normalizeEmailSelections(input.selections);
  const staffIds = [...selectionByStaff.keys()];
  if (staffIds.length === 0) {
    return {
      ok: false,
      error:
        "Select at least one certification for each employee you want to include.",
    };
  }

  const service = createServiceClient();
  const [types, staffResult, stored, userName] = await Promise.all([
    loadCertificationTypesNormalized(service),
    service
      .from("staff")
      .select(STAFF_SELECT)
      .in("id", staffIds)
      .eq("home_venue_id", auth.venue.id),
    getHrVenueSetting<Partial<HrCertificationRequestEmailSettings>>(
      auth.supabase,
      auth.venue.id,
      HR_SETTINGS_KEYS.certificationRequestEmail,
      {},
    ),
    resolveSignedInUserDisplayName(auth.supabase, auth.user.id),
  ]);

  if (staffResult.error) {
    return { ok: false, error: staffResult.error.message };
  }

  const settings = mergeCertificationRequestEmailSettings(stored);
  const typesById = new Map(types.map((t) => [t.id, t]));

  const previews: CertificationRequestEmailPreview[] = [];
  for (const row of staffResult.data ?? []) {
    const staff = mapStaffForCertificationEmail(
      row as Record<string, unknown>,
    );
    const certIds = selectionByStaff.get(staff.id) ?? [];
    const selectedCerts = certIds
      .map((id) => typesById.get(id))
      .filter((t): t is CertificationType => t != null);
    if (selectedCerts.length === 0) continue;

    const unitsResult = buildCertificationProviderEmailUnits(
      staff,
      selectedCerts,
    );
    if (!unitsResult.ok) {
      return { ok: false, error: `${staff.full_name}: ${unitsResult.error}` };
    }

    const attachments = await inspectStaffIdentityAttachments(
      service,
      auth.venue.id,
      staff.id,
      settings.attachDocuments,
    );

    for (const unit of unitsResult.units) {
      const vars = buildCertificationRequestEmailVars({
        staff,
        venueName: auth.venue.name,
        userName,
        certifications: unit.certifications,
        providerCompany: unit.providerCompany,
        providerContact: unit.providerContact,
      });
      const composed = composeCertificationRequestEmailContent({
        settings,
        vars,
        providerEmail: unit.providerEmail,
      });
      previews.push({
        id: unit.id,
        staffId: staff.id,
        empNo: staff.emp_no,
        employeeName: staff.full_name,
        to: composed.to ?? "",
        providerCompany: unit.providerCompany,
        providerContact: unit.providerContact,
        subject: composed.subject,
        body: composed.body,
        certificationNames: unit.certifications.map(
          (c) => c.name.trim() || c.label.trim(),
        ),
        attachments,
      });
    }
  }

  if (previews.length === 0) {
    return { ok: false, error: "No matching employees found for this venue." };
  }

  return { ok: true, previews, settingsEnabled: settings.enabled, requireAttachments: settings.requireAttachments };
}

export async function sendCertificationRequestEmails(input: {
  selections: CertificationRequestEmailSelection[];
  /** Draft overrides keyed by preview unit id (`staffId::providerEmail`). */
  draftsByUnitId?: Record<
    string,
    { to?: string; subject?: string; body?: string }
  >;
}): Promise<
  | { ok: true; sent: number; failed: { unitId: string; error: string }[] }
  | { ok: false; error: string }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireSendPermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const selectionByStaff = normalizeEmailSelections(input.selections);
  const staffIds = [...selectionByStaff.keys()];
  if (staffIds.length === 0) {
    return {
      ok: false,
      error:
        "Select at least one certification for each employee you want to include.",
    };
  }

  const service = createServiceClient();
  const [types, staffResult, stored, userName] = await Promise.all([
    loadCertificationTypesNormalized(service),
    service
      .from("staff")
      .select(STAFF_SELECT)
      .in("id", staffIds)
      .eq("home_venue_id", auth.venue.id),
    getHrVenueSetting<Partial<HrCertificationRequestEmailSettings>>(
      auth.supabase,
      auth.venue.id,
      HR_SETTINGS_KEYS.certificationRequestEmail,
      {},
    ),
    resolveSignedInUserDisplayName(auth.supabase, auth.user.id),
  ]);

  if (staffResult.error) {
    return { ok: false, error: staffResult.error.message };
  }

  const settings = mergeCertificationRequestEmailSettings(stored);
  if (!settings.enabled) {
    return {
      ok: false,
      error:
        "Certification request emails are disabled. Enable them under Settings → Emails → Other templates → Certifications.",
    };
  }
  const typesById = new Map(types.map((t) => [t.id, t]));

  let sent = 0;
  const failed: { unitId: string; error: string }[] = [];

  for (const row of staffResult.data ?? []) {
    const staff = mapStaffForCertificationEmail(
      row as Record<string, unknown>,
    );
    const certIds = selectionByStaff.get(staff.id) ?? [];
    const selectedCerts = certIds
      .map((id) => typesById.get(id))
      .filter((t): t is CertificationType => t != null);
    if (selectedCerts.length === 0) continue;

    const unitsResult = buildCertificationProviderEmailUnits(
      staff,
      selectedCerts,
    );
    if (!unitsResult.ok) {
      failed.push({ unitId: staff.id, error: unitsResult.error });
      continue;
    }

    for (const unit of unitsResult.units) {
      const draft = input.draftsByUnitId?.[unit.id] ?? null;
      const result = await deliverCertificationRequestEmail({
        venue: auth.venue,
        unit,
        settings,
        userName,
        actorId: auth.user.id,
        supabase: service,
        draft,
      });
      if (result.ok) sent += 1;
      else failed.push({ unitId: unit.id, error: result.error });
    }
  }

  revalidateCertPaths();
  return { ok: true, sent, failed };
}

export type CertificationRequestEmailSendRecord = {
  id: string;
  sentAt: string;
  staffId: string;
  employeeName: string;
  empNo: string;
  to: string | null;
  providerCompany: string | null;
  certificationNames: string[];
  sentBy: string | null;
};

export async function listCertificationRequestEmailSends(): Promise<
  | { ok: true; sends: CertificationRequestEmailSendRecord[] }
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
    .eq("action", "certification_request_email.sent")
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

  const sends: CertificationRequestEmailSendRecord[] = rows.map((row) => {
    const after =
      row.after && typeof row.after === "object" && !Array.isArray(row.after)
        ? (row.after as Record<string, unknown>)
        : {};
    const staffId = row.entity_id ? String(row.entity_id) : "";
    const staff = staffNames.get(staffId);
    const certNamesRaw = after.certificationNames;
    const certificationNames = Array.isArray(certNamesRaw)
      ? certNamesRaw
          .map((name) => String(name ?? "").trim())
          .filter(Boolean)
      : [];
    const actorId = row.actor_id ? String(row.actor_id) : "";
    return {
      id: String(row.id),
      sentAt: String(row.created_at),
      staffId,
      employeeName: staff?.fullName ?? "Employee",
      empNo: staff?.empNo ?? "",
      to: String(after.to ?? "").trim() || null,
      providerCompany: String(after.providerCompany ?? "").trim() || null,
      certificationNames,
      sentBy: actorId ? (actorNames.get(actorId) ?? null) : null,
    };
  });

  return { ok: true, sends };
}

export async function setStaffCertificationEmployeeProvided(input: {
  staffId: string;
  staffField: CertificationStaffField;
  employeeProvided: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireManagePermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const staffId = String(input.staffId ?? "").trim();
  const staffField = input.staffField;
  if (!staffId) return { ok: false, error: "Staff member not found." };
  if (!CERT_STAFF_FIELDS.has(staffField)) {
    return { ok: false, error: "Unknown certification field." };
  }

  const service = createServiceClient();
  const { data: staffRow, error: staffError } = await service
    .from("staff")
    .select("id, home_venue_id")
    .eq("id", staffId)
    .eq("home_venue_id", auth.venue.id)
    .maybeSingle();

  if (staffError) return { ok: false, error: staffError.message };
  if (!staffRow) return { ok: false, error: "Staff member not found." };

  const employeeProvided = Boolean(input.employeeProvided);
  const { error } = await service.from("hr_staff_certification_flags").upsert(
    {
      venue_id: auth.venue.id,
      staff_id: staffId,
      staff_field: staffField,
      employee_provided: employeeProvided,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "staff_id,staff_field" },
  );

  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actor_id: auth.user.id,
    action: employeeProvided
      ? "certification.employee_provided.set"
      : "certification.employee_provided.clear",
    module_key: HR_MODULE_KEY,
    entity: "staff",
    entity_id: staffId,
    venue_id: auth.venue.id,
    after: { staffField, employeeProvided },
  });

  revalidateCertPaths();
  return { ok: true };
}

export async function setStaffCertificationDate(input: {
  staffId: string;
  staffField: CertificationStaffField;
  /** ISO date `YYYY-MM-DD`, or empty/null to clear. */
  certifiedAt: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireManagePermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const staffId = String(input.staffId ?? "").trim();
  const staffField = input.staffField;
  if (!staffId) return { ok: false, error: "Staff member not found." };
  if (!CERT_STAFF_FIELDS.has(staffField)) {
    return { ok: false, error: "Unknown certification field." };
  }

  const raw = String(input.certifiedAt ?? "").trim();
  const certifiedAt =
    raw === ""
      ? null
      : /^\d{4}-\d{2}-\d{2}$/.test(raw)
        ? raw
        : null;
  if (raw && !certifiedAt) {
    return { ok: false, error: "Enter a valid certification date." };
  }

  const service = createServiceClient();
  const { data: staffRow, error: staffError } = await service
    .from("staff")
    .select("id, home_venue_id")
    .eq("id", staffId)
    .eq("home_venue_id", auth.venue.id)
    .maybeSingle();

  if (staffError) return { ok: false, error: staffError.message };
  if (!staffRow) return { ok: false, error: "Staff member not found." };

  const { error } = await service
    .from("staff")
    .update({ [staffField]: certifiedAt })
    .eq("id", staffId)
    .eq("home_venue_id", auth.venue.id);

  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actor_id: auth.user.id,
    action: "certification.date.updated",
    module_key: HR_MODULE_KEY,
    entity: "staff",
    entity_id: staffId,
    venue_id: auth.venue.id,
    after: { staffField, certifiedAt },
  });

  revalidateCertPaths();
  return { ok: true };
}
