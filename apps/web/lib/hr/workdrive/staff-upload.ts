import "server-only";

import { writeAuditLog } from "@/lib/audit";
import type { ActionAuthContext } from "@/lib/auth/action-context";
import { WorkDriveApiError } from "@/lib/hr/workdrive/client";
import { persistStaffWorkDriveDocument } from "@/lib/hr/workdrive/documents";
import { loadWorkDriveSettings } from "@/lib/hr/workdrive/settings";
import {
  docExpiryFieldForKind,
  uploadStaffDocumentToWorkDrive,
} from "@/lib/hr/workdrive/upload";
import { canEditStaff } from "@/lib/hr/permissions";
import { HR_MODULE_KEY, type HrWorkDriveDocKind } from "@/lib/hr/types";
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

    if (!canEditStaff(permissions, venue.id)) {
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
        ? ((staffRow as Record<string, unknown>)[expiryField] as
            | string
            | null
            | undefined)
        : null;
    const docExpiryOverride = String(input.docExpiry ?? "").trim();

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
      docExpiry: docExpiryOverride || docExpiryFromStaff || null,
      bytes: input.bytes,
      originalFileName: input.originalFileName,
      contentType: input.contentType || "application/octet-stream",
      overrideNameExist: false,
    });

    try {
      await persistStaffWorkDriveDocument(createServiceClient(), {
        venueId: venue.id,
        staffId,
        empNo,
        docKind,
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
      status: 500,
    };
  }
}
