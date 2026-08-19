import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/audit";
import type { ActionAuthContext } from "@/lib/auth/action-context";
import { loadStaffInsuranceHistory } from "@/lib/hr/insurance-store";
import { canEditAssets, canEditStaff } from "@/lib/hr/permissions";
import {
  loadStaffVisaHistory,
  pickLatestStaffVisaRecord,
} from "@/lib/hr/visa-store";
import {
  credentialsFromSettings,
  ensureAccessToken,
  renameFile,
  WorkDriveApiError,
} from "@/lib/hr/workdrive/client";
import {
  persistStaffWorkDriveDocument,
  updateStaffWorkDriveDocumentFileName,
} from "@/lib/hr/workdrive/documents";
import { loadWorkDriveSettings } from "@/lib/hr/workdrive/settings";
import {
  docExpiryFieldForKind,
  injectDocExpiryIntoFileName,
  stripLinkedRecordIdSuffixFromFileName,
  uploadStaffDocumentToWorkDrive,
} from "@/lib/hr/workdrive/upload";
import {
  HR_MODULE_KEY,
  type HrWorkDriveDocKind,
  type StaffLinkedWorkDriveDocument,
} from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

export const staffWorkDriveDocKindSchema = z.enum([
  "profile_photo",
  "passport",
  "emirates_id",
  "bank",
  "offer_letter",
  "contract",
  "addendums",
  "eresidence_card",
  "ohc",
  "medical_insurance",
  "visa_noc",
  "visa_cancelation",
  "training_certificates",
  "others",
]);

export type StaffWorkDriveUploadInput = {
  staffId: string;
  empNo: string;
  fullName: string;
  docKind: HrWorkDriveDocKind;
  fileSlotId?: string;
  docExpiry?: string | null;
  bytes: Buffer;
  originalFileName: string;
  contentType: string;
  /** Replace a same-named file in WorkDrive when true. */
  overrideNameExist?: boolean;
};

export type StaffWorkDriveUploadResult =
  | {
      ok: true;
      workdriveFileId: string;
      permalink: string;
      path: string;
      fileName: string;
    }
  | { ok: false; error: string; status?: number };

function isoDateOrNull(raw: unknown): string | null {
  const value = String(raw ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

async function resolveExpiryFromLinkedRecord(
  supabase: SupabaseClient,
  venueId: string,
  staffId: string,
  docKind: HrWorkDriveDocKind,
  fileSlotId: string | undefined,
): Promise<string | null> {
  const slot = String(fileSlotId ?? "").trim();

  if (docKind === "visa_cancelation") {
    const records = await loadStaffVisaHistory(supabase, venueId, staffId);
    const match =
      slot && slot !== "default"
        ? records.find((record) => record.id === slot)
        : pickLatestStaffVisaRecord(records);
    return match?.cancelDate ?? match?.expiryDate ?? null;
  }

  if (!slot || slot === "default") return null;

  if (docKind === "eresidence_card" || docKind === "visa_noc") {
    const records = await loadStaffVisaHistory(supabase, venueId, staffId);
    const match = records.find((record) => record.id === slot);
    return match?.expiryDate ?? match?.cancelDate ?? null;
  }

  if (docKind === "medical_insurance") {
    const records = await loadStaffInsuranceHistory(
      supabase,
      venueId,
      staffId,
    );
    const match = records.find((record) => record.id === slot);
    return match?.expiryDate ?? null;
  }

  return null;
}

/**
 * Shared WorkDrive staff-document upload used by the API route (preferred)
 * and any future callers. Accepts raw bytes — never FormData/File — so it
 * cannot trigger Next.js server-action multipart "Unexpected end of form".
 */
export async function performStaffWorkDriveUpload(
  auth: ActionAuthContext,
  input: StaffWorkDriveUploadInput,
): Promise<StaffWorkDriveUploadResult> {
  try {
    const { user, venue, permissions, supabase } = auth;

    if (
      !canEditStaff(permissions, venue.id) &&
      !canEditAssets(permissions, venue.id)
    ) {
      return {
        ok: false,
        error: "No permission to upload staff documents.",
        status: 403,
      };
    }

    const staffId = String(input.staffId ?? "").trim();
    const empNo = String(input.empNo ?? "").trim();
    const fullName = String(input.fullName ?? "").trim();
    const parsedKind = staffWorkDriveDocKindSchema.safeParse(
      String(input.docKind ?? "").trim(),
    );
    if (!parsedKind.success) {
      return { ok: false, error: "Invalid document type.", status: 400 };
    }
    const docKind = parsedKind.data as HrWorkDriveDocKind;
    const fileSlotId = String(input.fileSlotId ?? "").trim() || undefined;

    if (!staffId) {
      return {
        ok: false,
        error: "Save the staff record before uploading.",
        status: 400,
      };
    }
    if (!empNo || !fullName) {
      return {
        ok: false,
        error: "Employee number and full name are required.",
        status: 400,
      };
    }
    if (!input.bytes?.length) {
      return { ok: false, error: "Choose a file to upload.", status: 400 };
    }

    const settings = await loadWorkDriveSettings(supabase, venue.id);
    if (!settings.enabled) {
      return {
        ok: false,
        error: "Enable WorkDrive in Venue Settings → Drive config first.",
        status: 400,
      };
    }

    const { data: staffRow } = await supabase
      .from("staff")
      .select(
        "first_name, last_name, passport_expiry, eid_expiry, visa_expiry, contract_expiry, eresidence_expiry, medical_insurance_expiry_date, ohc_date, pic_date, basic_food_safety_date, fire_safety_date, first_aid_date",
      )
      .eq("id", staffId)
      .maybeSingle();

    const expiryField = docExpiryFieldForKind(docKind, fileSlotId);
    const docExpiryFromStaff =
      expiryField && staffRow
        ? isoDateOrNull((staffRow as Record<string, unknown>)[expiryField])
        : null;
    const docExpiryFromVisaStaff =
      docKind === "eresidence_card" && staffRow
        ? isoDateOrNull(
            (staffRow as { visa_expiry?: string | null }).visa_expiry,
          )
        : null;
    const docExpiryOverride = isoDateOrNull(input.docExpiry);
    const docExpiryFromRecord = await resolveExpiryFromLinkedRecord(
      supabase,
      venue.id,
      staffId,
      docKind,
      fileSlotId,
    );

    const result = await uploadStaffDocumentToWorkDrive({
      venueId: venue.id,
      settings,
      empNo,
      fullName,
      firstName:
        String(
          (staffRow as { first_name?: string | null } | null)?.first_name ?? "",
        ).trim() || undefined,
      lastName:
        String(
          (staffRow as { last_name?: string | null } | null)?.last_name ?? "",
        ).trim() || undefined,
      docKind,
      fileSlotId,
      docExpiry:
        docExpiryOverride ||
        docExpiryFromRecord ||
        docExpiryFromStaff ||
        docExpiryFromVisaStaff ||
        null,
      bytes: input.bytes,
      originalFileName: input.originalFileName,
      contentType: input.contentType || "application/octet-stream",
      overrideNameExist: input.overrideNameExist !== false,
    });

    try {
      await persistStaffWorkDriveDocument(createServiceClient(), {
        venueId: venue.id,
        staffId,
        empNo,
        docKind,
        fileSlotId,
        workdriveFileId: result.workdriveFileId,
        permalink: result.permalink,
        fileName: result.fileName,
        subfolderId: result.docFolderId,
        employeeFolderId: result.employeeFolderId,
        path: result.path,
        contentType: input.contentType || "application/octet-stream",
        uploadedBy: user.id,
      });
    } catch (persistError) {
      await writeAuditLog({
        actor_id: user.id,
        action: "create",
        module_key: HR_MODULE_KEY,
        entity: "workdrive_staff_document_meta_failed",
        entity_id: result.workdriveFileId,
        venue_id: venue.id,
        after: {
          error:
            persistError instanceof Error
              ? persistError.message
              : "metadata persist failed",
        },
      });
    }

    await writeAuditLog({
      actor_id: user.id,
      action: "create",
      module_key: HR_MODULE_KEY,
      entity: "workdrive_staff_document",
      entity_id: result.workdriveFileId,
      venue_id: venue.id,
      after: {
        staffId,
        docKind,
        path: result.path,
        permalink: result.permalink,
        fileName: result.fileName,
      },
    });

    return {
      ok: true,
      workdriveFileId: result.workdriveFileId,
      permalink: result.permalink,
      path: result.path,
      fileName: result.fileName,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof WorkDriveApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Upload failed.",
      status: error instanceof WorkDriveApiError ? error.status : 500,
    };
  }
}

/**
 * When a linked WorkDrive file was saved with an empty `[exp.- ]` placeholder
 * or a legacy `_<record-uuid-prefix>` suffix, rename it and update metadata.
 */
export async function repairLinkedWorkDriveDocExpiryName(input: {
  venueId: string;
  doc: StaffLinkedWorkDriveDocument;
  expiryDate: string | null | undefined;
}): Promise<StaffLinkedWorkDriveDocument> {
  const expiryDate = isoDateOrNull(input.expiryDate);
  let nextName =
    stripLinkedRecordIdSuffixFromFileName(
      input.doc.fileName,
      input.doc.fileSlotId,
    ) ?? input.doc.fileName;
  nextName =
    injectDocExpiryIntoFileName(nextName, expiryDate) ?? nextName;
  if (nextName === input.doc.fileName) return input.doc;

  try {
    const supabase = createServiceClient();
    const settings = await loadWorkDriveSettings(supabase, input.venueId);
    if (!settings.enabled) return input.doc;

    const credentials = credentialsFromSettings(settings);
    const { accessToken, apiDomain } = await ensureAccessToken(
      input.venueId,
      credentials,
    );
    await renameFile(
      apiDomain,
      accessToken,
      input.doc.workdriveFileId,
      nextName,
    );
    await updateStaffWorkDriveDocumentFileName(
      supabase,
      input.venueId,
      input.doc.id,
      nextName,
    );
    return { ...input.doc, fileName: nextName };
  } catch (error) {
    console.error(
      "[workdrive] repairLinkedWorkDriveDocExpiryName:",
      error instanceof Error ? error.message : error,
    );
    return input.doc;
  }
}
