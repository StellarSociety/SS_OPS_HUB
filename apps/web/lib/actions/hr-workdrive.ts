"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { decryptSecret, encryptSecret } from "@/lib/email/secret";
import {
  exchangeAuthorizationCode,
  verifyWorkDriveAccess,
  WorkDriveApiError,
} from "@/lib/hr/workdrive/client";
import {
  loadWorkDriveSettings,
  mergeWorkDriveSettings,
} from "@/lib/hr/workdrive/settings";
import { readWorkDriveEnvCredentials } from "@/lib/hr/workdrive/env";
import { uploadStaffDocumentToWorkDrive } from "@/lib/hr/workdrive/upload";
import { persistStaffWorkDriveDocument } from "@/lib/hr/workdrive/documents";
import { canAdminLookups, canEditStaff } from "@/lib/hr/permissions";
import {
  DEFAULT_HR_WORK_DRIVE_DOC_SUBFOLDERS,
  DEFAULT_HR_WORK_DRIVE_SETTINGS,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  type HrWorkDriveDocKind,
  type HrWorkDriveDocSubfolder,
  type HrWorkDrivePublicSettings,
  type HrWorkDriveSettings,
  type ZohoWorkDriveRegion,
} from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

const regionSchema = z.enum([
  "com",
  "eu",
  "in",
  "com.au",
  "jp",
  "uk",
  "ca",
  "sa",
]);

const docKindSchema = z.enum([
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

function toPublic(settings: HrWorkDriveSettings): HrWorkDrivePublicSettings {
  const envCreds = readWorkDriveEnvCredentials();
  const {
    clientSecretEncrypted: _cs,
    refreshTokenEncrypted: _rt,
    ...rest
  } = settings;
  return {
    ...rest,
    clientId: settings.clientId || envCreds.clientId || "",
    hasClientSecret: Boolean(
      settings.clientSecretEncrypted || envCreds.clientSecret,
    ),
    hasRefreshToken: Boolean(
      settings.refreshTokenEncrypted || envCreds.refreshToken,
    ),
  };
}

async function getAuth() {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return { error: ctx.error } as const;
  return ctx;
}

function requireConfigurePermission(
  permissions: Parameters<typeof canEditStaff>[0],
  venueId: string,
) {
  if (
    !canAdminLookups(permissions, venueId) &&
    !canEditStaff(permissions, venueId)
  ) {
    throw new Error("No permission to change Drive Setup settings.");
  }
}

function flagTrue(raw: FormDataEntryValue | null): boolean {
  const v = String(raw ?? "").toLowerCase();
  return v === "true" || v === "on" || v === "1";
}

function parseDocSubfolders(formData: FormData): HrWorkDriveDocSubfolder[] {
  return DEFAULT_HR_WORK_DRIVE_DOC_SUBFOLDERS.map((defaults) => {
    const kind = defaults.kind;
    const folderName = String(
      formData.get(`doc_folder_${kind}`) ?? defaults.folderName,
    ).trim();
    const label = String(
      formData.get(`doc_label_${kind}`) ?? defaults.label,
    ).trim();
    const active = flagTrue(formData.get(`doc_active_${kind}`));
    const parsedKind = docKindSchema.safeParse(kind);
    return {
      kind: (parsedKind.success
        ? parsedKind.data
        : defaults.kind) as HrWorkDriveDocKind,
      folderName: folderName || defaults.folderName,
      label: label || defaults.label,
      active,
    };
  });
}

async function persistSettings(
  venueId: string,
  userId: string,
  value: HrWorkDriveSettings,
) {
  const service = createServiceClient();
  const { error } = await service.from("hr_venue_settings").upsert(
    {
      venue_id: venueId,
      key: HR_SETTINGS_KEYS.workDrive,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "venue_id,key" },
  );
  if (error) {
    throw new Error(error.message);
  }

  await writeAuditLog({
    actor_id: userId,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "hr_venue_settings",
    entity_id: HR_SETTINGS_KEYS.workDrive,
    venue_id: venueId,
    after: {
      ...value,
      clientSecretEncrypted: value.clientSecretEncrypted ? "[redacted]" : null,
      refreshTokenEncrypted: value.refreshTokenEncrypted ? "[redacted]" : null,
    },
  });

  revalidatePath("/hr/settings/data-management", "layout");
}

export async function getWorkDriveSettings(): Promise<HrWorkDrivePublicSettings> {
  const auth = await getAuth();
  if ("error" in auth) {
    return toPublic(DEFAULT_HR_WORK_DRIVE_SETTINGS);
  }
  const settings = await loadWorkDriveSettings(auth.supabase, auth.venue.id);
  return toPublic(settings);
}

export async function saveWorkDriveSettings(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    const { user, venue, permissions, supabase } = auth;
    requireConfigurePermission(permissions, venue.id);

    const current = await loadWorkDriveSettings(supabase, venue.id);
    const region = regionSchema.parse(
      String(formData.get("region") ?? current.region),
    ) as ZohoWorkDriveRegion;

    const clientSecretRaw = String(formData.get("client_secret") ?? "").trim();
    const refreshTokenRaw = String(formData.get("refresh_token") ?? "").trim();

    const next = mergeWorkDriveSettings({
      enabled: flagTrue(formData.get("enabled")),
      region,
      clientId: String(formData.get("client_id") ?? "").trim(),
      clientSecretEncrypted: clientSecretRaw
        ? encryptSecret(clientSecretRaw)
        : current.clientSecretEncrypted,
      refreshTokenEncrypted: refreshTokenRaw
        ? encryptSecret(refreshTokenRaw)
        : current.refreshTokenEncrypted,
      teamFolderName: String(formData.get("team_folder_name") ?? "").trim(),
      teamFolderId: String(formData.get("team_folder_id") ?? "").trim(),
      hrFolderName: String(formData.get("hr_folder_name") ?? "").trim(),
      hrFolderId: String(formData.get("hr_folder_id") ?? "").trim(),
      employeeDocsFolderId: String(
        formData.get("employee_docs_folder_id") ?? "",
      ).trim(),
      employeeFolderTemplate: String(
        formData.get("employee_folder_template") ?? "",
      ).trim(),
      fileNameTemplate: String(formData.get("file_name_template") ?? "").trim(),
      autoCreateFolders: flagTrue(formData.get("auto_create_folders")),
      docSubfolders: parseDocSubfolders(formData),
      connectionStatus: current.connectionStatus,
      lastVerifiedAt: current.lastVerifiedAt,
      lastError: current.lastError,
    });

    await persistSettings(venue.id, user.id, next);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not save Drive Setup.",
    };
  }
}

/**
 * Self Client: paste the one-time grant code from API Console → store refresh token.
 */
export async function exchangeWorkDriveGrantCode(
  formData: FormData,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    const { user, venue, permissions, supabase } = auth;
    requireConfigurePermission(permissions, venue.id);

    const current = await loadWorkDriveSettings(supabase, venue.id);
    const region = regionSchema.parse(
      String(formData.get("region") ?? current.region),
    ) as ZohoWorkDriveRegion;
    const clientId = String(
      formData.get("client_id") ?? current.clientId,
    ).trim();
    const clientSecretRaw = String(formData.get("client_secret") ?? "").trim();
    const code = String(formData.get("grant_code") ?? "").trim();

    if (!clientId) return { ok: false, error: "Client ID is required." };
    if (!code) return { ok: false, error: "Paste the Self Client grant code." };

    let clientSecret = clientSecretRaw;
    if (!clientSecret) {
      if (!current.clientSecretEncrypted) {
        return { ok: false, error: "Client secret is required for exchange." };
      }
      clientSecret = decryptSecret(current.clientSecretEncrypted);
    }

    const tokens = await exchangeAuthorizationCode({
      region,
      clientId,
      clientSecret,
      code,
    });

    const next = mergeWorkDriveSettings({
      ...current,
      region,
      clientId,
      clientSecretEncrypted: encryptSecret(clientSecret),
      refreshTokenEncrypted: encryptSecret(tokens.refreshToken),
      connectionStatus: "disconnected",
      lastError: null,
    });
    await persistSettings(venue.id, user.id, next);

    return {
      ok: true,
      message:
        "Refresh token saved. Click Test connection to verify folder access.",
    };
  } catch (error) {
    const message =
      error instanceof WorkDriveApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not exchange grant code.";
    return { ok: false, error: message };
  }
}

export async function testWorkDriveConnection(): Promise<
  { ok: true; message: string } | { ok: false; error: string }
> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    const { user, venue, permissions, supabase } = auth;
    requireConfigurePermission(permissions, venue.id);

    const settings = await loadWorkDriveSettings(supabase, venue.id);
    const missing: string[] = [];
    if (!settings.clientId) missing.push("Client ID");
    if (!settings.clientSecretEncrypted) missing.push("Client secret");
    if (!settings.refreshTokenEncrypted) missing.push("Refresh token");
    if (!settings.hrFolderId && !settings.teamFolderId && !settings.employeeDocsFolderId) {
      missing.push("Employee Documents folder ID (or HR / Team folder ID)");
    }

    if (missing.length) {
      const next = mergeWorkDriveSettings({
        ...settings,
        connectionStatus: "error",
        lastError: `Missing: ${missing.join(", ")}`,
      });
      await persistSettings(venue.id, user.id, next);
      return {
        ok: false,
        error: `Complete connection fields first (${missing.join(", ")}).`,
      };
    }

    const result = await verifyWorkDriveAccess(venue.id, settings);
    const next = mergeWorkDriveSettings({
      ...settings,
      connectionStatus: "connected",
      lastVerifiedAt: new Date().toISOString(),
      lastError: null,
    });
    await persistSettings(venue.id, user.id, next);

    return {
      ok: true,
      message: `Connected to WorkDrive (${result.apiDomain}). Listed ${result.childCount} item(s) in folder ${result.folderId}.`,
    };
  } catch (error) {
    try {
      const auth = await getAuth();
      if (!("error" in auth)) {
        const settings = await loadWorkDriveSettings(
          auth.supabase,
          auth.venue.id,
        );
        await persistSettings(
          auth.venue.id,
          auth.user.id,
          mergeWorkDriveSettings({
            ...settings,
            connectionStatus: "error",
            lastError:
              error instanceof Error
                ? error.message
                : "Connection test failed.",
          }),
        );
      }
    } catch {
      /* ignore persist failure */
    }

    return {
      ok: false,
      error:
        error instanceof WorkDriveApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Connection test failed.",
    };
  }
}

export async function uploadStaffWorkDriveDocument(formData: FormData): Promise<
  | {
      ok: true;
      workdriveFileId: string;
      permalink: string;
      path: string;
      fileName: string;
    }
  | { ok: false; error: string }
> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    const { user, venue, permissions, supabase } = auth;

    if (!canEditStaff(permissions, venue.id)) {
      return { ok: false, error: "No permission to upload staff documents." };
    }

    const staffId = String(formData.get("staff_id") ?? "").trim();
    const empNo = String(formData.get("emp_no") ?? "").trim();
    const fullName = String(formData.get("full_name") ?? "").trim();
    const docKindRaw = String(formData.get("doc_kind") ?? "passport").trim();
    const docKind = docKindSchema.parse(docKindRaw) as HrWorkDriveDocKind;
    const file = formData.get("file");

    if (!staffId) {
      return { ok: false, error: "Save the staff record before uploading." };
    }
    if (!empNo || !fullName) {
      return { ok: false, error: "Employee number and full name are required." };
    }
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose a file to upload." };
    }
    if (file.size > 250 * 1024 * 1024) {
      return { ok: false, error: "File exceeds WorkDrive 250 MB limit." };
    }

    const settings = await loadWorkDriveSettings(supabase, venue.id);
    if (!settings.enabled) {
      return {
        ok: false,
        error: "Enable WorkDrive in Data Management → Drive Setup first.",
      };
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await uploadStaffDocumentToWorkDrive({
      venueId: venue.id,
      settings,
      empNo,
      fullName,
      docKind,
      bytes,
      originalFileName: file.name,
      contentType: file.type || "application/octet-stream",
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
        contentType: file.type || "application/octet-stream",
        uploadedBy: user.id,
      });
    } catch (persistError) {
      // Upload already succeeded in WorkDrive — surface soft failure in audit.
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
    };
  }
}
