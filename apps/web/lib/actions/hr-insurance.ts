"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { resolveSignedInUserDisplayName } from "@/lib/auth/resolve-signed-in-user-name";
import { recordOutboundStaffEmail } from "@/lib/email/record-staff-email";
import { sendAppEmail } from "@/lib/email/transport";
import { formatAed, formatDateOnly } from "@/lib/hr/derived";
import { loadStaffEmailAttachments } from "@/lib/hr/email-staff-attachments";
import { parseEmailStaffDocumentKeysFromForm } from "@/lib/hr/email-staff-documents";
import { buildHrTemplateEmailHtml } from "@/lib/hr/email-logo";
import {
  loadInsuranceProviders,
  mergeInsuranceRequestEmailSettings,
} from "@/lib/hr/insurance-store";
import { canAdminLookups, canEditAssets, canEditStaff } from "@/lib/hr/permissions";
import { getHrVenueSetting } from "@/lib/hr/store";
import {
  DEFAULT_HR_INSURANCE_REQUEST_EMAIL_SETTINGS,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  type HrInsuranceRequestEmailSettings,
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
  return "No permission to manage insurance.";
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

function revalidateInsurancePaths() {
  revalidatePath("/hr/assets/insurance", "layout");
  revalidatePath("/hr/settings", "layout");
}

const positionDefaultSchema = z.object({
  departmentId: z.string().uuid(),
  positionId: z.string().uuid().nullable().optional(),
});

const categoryInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  defaultMedicalValue: z.coerce.number().min(0).max(999_999_999).optional(),
  sortOrder: z.coerce.number().int().min(0).max(10_000).optional(),
  positionDefaults: z.array(positionDefaultSchema).optional(),
});

const providerUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  contactPerson: z.string().trim().max(200).optional(),
  contactEmail: z.string().trim().max(200).optional(),
  contactPhone: z.string().trim().max(40).optional(),
  leadDays: z.coerce.number().int().min(0).max(365).optional(),
  categories: z.array(categoryInputSchema).optional(),
});

export async function upsertInsuranceProvider(
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
  let providerId = data.id ?? null;

  if (providerId) {
    const { error } = await service
      .from("insurance_providers")
      .update({
        name: data.name,
        contact_person: (data.contactPerson ?? "").trim(),
        contact_email: email,
        contact_phone: (data.contactPhone ?? "").trim(),
        lead_days: data.leadDays ?? 30,
      })
      .eq("id", providerId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: maxRow } = await service
      .from("insurance_providers")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (Number(maxRow?.sort_order) || 0) + 1;
    const { data: created, error } = await service
      .from("insurance_providers")
      .insert({
        name: data.name,
        contact_person: (data.contactPerson ?? "").trim(),
        contact_email: email,
        contact_phone: (data.contactPhone ?? "").trim(),
        lead_days: data.leadDays ?? 30,
        sort_order: nextOrder,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    providerId = String(created.id);
  }

  if (data.categories) {
    const { data: existingCats, error: listErr } = await service
      .from("insurance_categories")
      .select("id")
      .eq("provider_id", providerId);
    if (listErr) return { ok: false, error: listErr.message };

    const keepIds = new Set(
      data.categories
        .map((c) => c.id)
        .filter((id): id is string => Boolean(id)),
    );
    const toDelete = (existingCats ?? [])
      .map((c) => String(c.id))
      .filter((id) => !keepIds.has(id));

    if (toDelete.length > 0) {
      const { error: delErr } = await service
        .from("insurance_categories")
        .delete()
        .in("id", toDelete);
      if (delErr) return { ok: false, error: delErr.message };
    }

    for (let i = 0; i < data.categories.length; i++) {
      const cat = data.categories[i];
      const payload = {
        name: cat.name,
        default_medical_value: cat.defaultMedicalValue ?? 0,
        sort_order: cat.sortOrder ?? i + 1,
        provider_id: providerId,
        archived_at: null,
      };

      let categoryId = cat.id ?? null;
      if (categoryId) {
        const { error } = await service
          .from("insurance_categories")
          .update(payload)
          .eq("id", categoryId);
        if (error) return { ok: false, error: error.message };
      } else {
        const { data: created, error } = await service
          .from("insurance_categories")
          .insert(payload)
          .select("id")
          .single();
        if (error) {
          // Reuse an existing category name (e.g. from Settings) by linking it.
          if (error.code === "23505") {
            const { data: existing, error: findErr } = await service
              .from("insurance_categories")
              .select("id")
              .eq("name", cat.name)
              .maybeSingle();
            if (findErr || !existing) {
              return { ok: false, error: error.message };
            }
            categoryId = String(existing.id);
            const { error: linkErr } = await service
              .from("insurance_categories")
              .update(payload)
              .eq("id", categoryId);
            if (linkErr) return { ok: false, error: linkErr.message };
          } else {
            return { ok: false, error: error.message };
          }
        } else {
          categoryId = String(created.id);
        }
      }

      const { error: clearErr } = await service
        .from("insurance_category_position_defaults")
        .delete()
        .eq("category_id", categoryId);
      if (clearErr) return { ok: false, error: clearErr.message };

      const defaults = cat.positionDefaults ?? [];
      if (defaults.length > 0) {
        const rows = defaults.map((d) => ({
          category_id: categoryId,
          department_id: d.departmentId,
          position_id: d.positionId ?? null,
        }));
        const { error: insErr } = await service
          .from("insurance_category_position_defaults")
          .insert(rows);
        if (insErr) return { ok: false, error: insErr.message };
      }
    }
  }

  await writeAuditLog({
    actor_id: auth.user.id,
    action: data.id
      ? "insurance_provider.updated"
      : "insurance_provider.created",
    module_key: HR_MODULE_KEY,
    entity: "insurance_providers",
    entity_id: providerId,
    venue_id: auth.venue.id,
    after: { name: data.name, categories: data.categories?.length ?? 0 },
  });

  revalidateInsurancePaths();
  return { ok: true, id: providerId };
}

export async function setInsuranceProviderArchived(input: {
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
  const { error } = await service
    .from("insurance_providers")
    .update({
      archived_at: parsed.data.archived ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.id);
  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actor_id: auth.user.id,
    action: parsed.data.archived
      ? "insurance_provider.archived"
      : "insurance_provider.restored",
    module_key: HR_MODULE_KEY,
    entity: "insurance_providers",
    entity_id: parsed.data.id,
    venue_id: auth.venue.id,
  });

  revalidateInsurancePaths();
  return { ok: true };
}

export async function reorderInsuranceProvidersAction(
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
  for (let i = 0; i < parsed.data.length; i++) {
    const { error } = await service
      .from("insurance_providers")
      .update({ sort_order: i + 1 })
      .eq("id", parsed.data[i]);
    if (error) return { ok: false, error: error.message };
  }

  revalidateInsurancePaths();
  return { ok: true };
}

const staffInsuranceSchema = z.object({
  staffId: z.string().uuid(),
  insuranceCategory: z.string().trim().max(200).nullable(),
  medicalInsuranceValue: z.coerce
    .number()
    .min(0)
    .max(999_999_999)
    .nullable(),
  medicalInsuranceIssueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  medicalInsuranceExpiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

export async function updateStaffInsurance(
  input: z.infer<typeof staffInsuranceSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  if (
    !canEditStaff(auth.permissions, auth.venue.id) &&
    !canEditAssets(auth.permissions, auth.venue.id)
  ) {
    return {
      ok: false,
      error: "No permission to update staff insurance.",
    };
  }

  const parsed = staffInsuranceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const service = createServiceClient();
  const { error } = await service
    .from("staff")
    .update({
      insurance_category: parsed.data.insuranceCategory || null,
      medical_insurance_value: parsed.data.medicalInsuranceValue,
      medical_insurance_issue_date: parsed.data.medicalInsuranceIssueDate,
      medical_insurance_expiry_date: parsed.data.medicalInsuranceExpiryDate,
    })
    .eq("id", parsed.data.staffId)
    .eq("home_venue_id", auth.venue.id);

  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actor_id: auth.user.id,
    action: "staff.insurance.updated",
    module_key: HR_MODULE_KEY,
    entity: "staff",
    entity_id: parsed.data.staffId,
    venue_id: auth.venue.id,
    after: parsed.data,
  });

  revalidateInsurancePaths();
  revalidatePath("/hr/staff", "layout");
  return { ok: true };
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

export type InsuranceRequestEmailUnit = {
  staffId: string;
  requestType: "issue" | "renew";
  providerId?: string | null;
  to?: string;
  subject?: string;
  body?: string;
};

export type InsuranceRequestEmailPreview = {
  staffId: string;
  empNo: string;
  fullName: string;
  requestType: "issue" | "renew";
  providerId: string | null;
  providerName: string;
  to: string;
  subject: string;
  body: string;
};

export async function previewInsuranceRequestEmails(input: {
  units: InsuranceRequestEmailUnit[];
}): Promise<
  | {
      ok: true;
      previews: InsuranceRequestEmailPreview[];
      settings: HrInsuranceRequestEmailSettings;
    }
  | { ok: false; error: string }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireSendPermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const settings = mergeInsuranceRequestEmailSettings(
    await getHrVenueSetting(
      auth.supabase,
      auth.venue.id,
      HR_SETTINGS_KEYS.insuranceRequestEmail,
      {},
    ),
  );

  const staffIds = input.units.map((u) => u.staffId);
  if (staffIds.length === 0) {
    return { ok: false, error: "Select at least one employee." };
  }

  const service = createServiceClient();
  const providers = await loadInsuranceProviders(service);
  const { data: staffRows, error } = await service
    .from("staff")
    .select(
      "id, emp_no, full_name, insurance_category, medical_insurance_value, medical_insurance_issue_date, medical_insurance_expiry_date, passport_no, passport_expiry, eid_no, eid_expiry, home_venue_id, nationality:nationalities(id, name)",
    )
    .in("id", staffIds)
    .eq("home_venue_id", auth.venue.id);
  if (error) return { ok: false, error: error.message };

  const byId = new Map((staffRows ?? []).map((s) => [String(s.id), s]));
  const userName = await resolveSignedInUserDisplayName(
    auth.supabase,
    auth.user.id,
  );
  const previews: InsuranceRequestEmailPreview[] = [];

  for (const unit of input.units) {
    const staff = byId.get(unit.staffId);
    if (!staff) continue;

    const categoryName = String(staff.insurance_category ?? "").trim();
    let provider =
      (unit.providerId
        ? providers.find((p) => !p.archived_at && p.id === unit.providerId)
        : null) ??
      providers.find((p) =>
        p.categories.some(
          (c) =>
            !c.archived_at &&
            c.name.toLowerCase() === categoryName.toLowerCase(),
        ),
      ) ??
      null;
    if (!provider) {
      provider =
        providers.find((p) => !p.archived_at && p.contact_email.trim()) ??
        providers.find((p) => !p.archived_at) ??
        null;
    }

    const requestTypeLabel = unit.requestType === "renew" ? "renewal" : "issue";
    const templateSubject =
      unit.requestType === "renew"
        ? settings.renewSubject
        : settings.issueSubject;
    const templateMessage =
      unit.requestType === "renew"
        ? settings.renewMessage
        : settings.issueMessage;
    const vars: Record<string, string> = {
      PROVIDER_CONTACT:
        provider?.contact_person?.trim() || provider?.name || "Provider",
      PROVIDER_COMPANY: provider?.name ?? "",
      EMPLOYEE_NAME: String(staff.full_name ?? ""),
      EMP_NO: String(staff.emp_no ?? ""),
      INSURANCE_CATEGORY: categoryName || "—",
      INSURANCE_VALUE:
        staff.medical_insurance_value == null
          ? "—"
          : formatAed(Number(staff.medical_insurance_value)),
      ISSUE_DATE: staff.medical_insurance_issue_date
        ? formatDateOnly(String(staff.medical_insurance_issue_date).slice(0, 10))
        : "—",
      EXPIRY_DATE: staff.medical_insurance_expiry_date
        ? formatDateOnly(
            String(staff.medical_insurance_expiry_date).slice(0, 10),
          )
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
    });
  }

  return { ok: true, previews, settings };
}

export async function sendInsuranceRequestEmails(input: {
  units: InsuranceRequestEmailUnit[];
}): Promise<{ ok: true; sent: number } | { ok: false; error: string }> {
  const preview = await previewInsuranceRequestEmails(input);
  if (!preview.ok) return preview;

  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireSendPermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  if (!preview.settings.enabled) {
    return { ok: false, error: "Insurance request emails are disabled." };
  }

  const supabase = createServiceClient();
  let sent = 0;

  for (const unit of preview.previews) {
    if (!unit.to) {
      return {
        ok: false,
        error: `No provider email for ${unit.fullName}.`,
      };
    }

    const attachKeys =
      unit.requestType === "renew"
        ? preview.settings.renewAttachDocuments
        : preview.settings.issueAttachDocuments;
    const requireAttachments =
      unit.requestType === "renew"
        ? preview.settings.renewRequireAttachments
        : preview.settings.issueRequireAttachments;

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

    const sendResult = await sendAppEmail(
      {
        to: unit.to,
        subject: unit.subject,
        html,
        attachments: attachments.length > 0 ? attachments : undefined,
        fromOverride: preview.settings.fromEmail || undefined,
      },
      { venueId: auth.venue.id, supabase },
    );

    const auditId = await writeAuditLog({
      actor_id: auth.user.id,
      action: "insurance_request_email.sent",
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

  revalidateInsurancePaths();
  return { ok: true, sent };
}

export async function getInsuranceRequestEmailSettings(): Promise<HrInsuranceRequestEmailSettings> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return DEFAULT_HR_INSURANCE_REQUEST_EMAIL_SETTINGS;

  const stored = await getHrVenueSetting<
    Partial<HrInsuranceRequestEmailSettings> & {
      subject?: string;
      message?: string;
    }
  >(
    auth.supabase,
    auth.venue.id,
    HR_SETTINGS_KEYS.insuranceRequestEmail,
    {},
  );
  return mergeInsuranceRequestEmailSettings(stored);
}

function flagTrue(raw: FormDataEntryValue | null): boolean {
  const v = String(raw ?? "").toLowerCase();
  return v === "true" || v === "on" || v === "1";
}

export async function saveInsuranceRequestEmailSettings(
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

  const next = mergeInsuranceRequestEmailSettings({
    enabled: flagTrue(formData.get("enabled")),
    fromEmail: String(formData.get("from_email") ?? ""),
    issueSubject: String(formData.get("issue_subject") ?? ""),
    issueMessage: String(formData.get("issue_message") ?? ""),
    renewSubject: String(formData.get("renew_subject") ?? ""),
    renewMessage: String(formData.get("renew_message") ?? ""),
    issueAttachDocuments: parseEmailStaffDocumentKeysFromForm(
      formData,
      "issue_attach_documents",
      DEFAULT_HR_INSURANCE_REQUEST_EMAIL_SETTINGS.issueAttachDocuments,
    ),
    renewAttachDocuments: parseEmailStaffDocumentKeysFromForm(
      formData,
      "renew_attach_documents",
      DEFAULT_HR_INSURANCE_REQUEST_EMAIL_SETTINGS.renewAttachDocuments,
    ),
    issueRequireAttachments: flagTrue(formData.get("issue_attach_documents_require")),
    renewRequireAttachments: flagTrue(formData.get("renew_attach_documents_require")),
  });

  try {
    const service = createServiceClient();
    const { error } = await service.from("hr_venue_settings").upsert(
      {
        venue_id: auth.venue.id,
        key: HR_SETTINGS_KEYS.insuranceRequestEmail,
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
      entity_id: HR_SETTINGS_KEYS.insuranceRequestEmail,
      venue_id: auth.venue.id,
      after: { enabled: next.enabled },
    });

    revalidatePath("/hr/settings/emails", "layout");
    revalidatePath("/hr/settings/emails/other/insurance-request", "page");
    revalidateInsurancePaths();
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Could not save email settings.",
    };
  }
}
