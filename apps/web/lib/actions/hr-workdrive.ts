"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { decryptSecret, encryptSecret } from "@/lib/email/secret";
import {
  createFolder,
  credentialsFromSettings,
  clearAccessTokenCache,
  ensureAccessToken,
  exchangeAuthorizationCode,
  findChildByName,
  fingerprintCredential,
  getMetadata,
  renameFile,
  trashFile,
  verifyWorkDriveAccess,
  WorkDriveApiError,
  probeWorkDriveCredentials,
  formatWorkDriveTestFailure,
} from "@/lib/hr/workdrive/client";
import {
  deleteStaffWorkDriveDocumentMeta,
  getStaffWorkDriveDocumentById,
  listStaffWorkDriveDocuments,
  listStaffWorkDriveDocumentsForStaff,
  reconcileStaffWorkDriveDocumentsPresence,
  updateStaffWorkDriveDocumentFileName,
} from "@/lib/hr/workdrive/documents";
import {
  emptyWorkDriveConnection,
  emptyWorkDriveFolder,
  ensureWorkDriveStoreForUi,
  flattenWorkDrive,
  loadWorkDriveSettings,
  loadWorkDriveStore,
  workDriveFolderWebUrl,
} from "@/lib/hr/workdrive/settings";
import { ZOHO_WD_VERIFIED } from "@/lib/hr/workdrive/constants";
import { readWorkDriveEnvCredentials } from "@/lib/hr/workdrive/env";
import { performStaffWorkDriveUpload } from "@/lib/hr/workdrive/staff-upload";
import { renderWorkDriveTemplate } from "@/lib/hr/workdrive/upload";
import {
  canAccessAssets,
  canAccessStaff,
  canAdminLookups,
  canEditAssets,
  canEditStaff,
  canViewStaff,
} from "@/lib/hr/permissions";
import { isAppAdmin } from "@/lib/role-permissions";
import {
  DEFAULT_HR_WORK_DRIVE_DOC_SUBFOLDERS,
  DEFAULT_HR_WORK_DRIVE_SETTINGS,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  type HrWorkDriveConnection,
  type HrWorkDriveConnectionPublic,
  type HrWorkDriveDocKind,
  type HrWorkDriveDocSubfolder,
  type HrWorkDriveExtraFolder,
  type HrWorkDriveFolder,
  type HrWorkDrivePublicSettings,
  type HrWorkDriveSettings,
  type HrWorkDriveStore,
  type ZohoWorkDriveRegion,
} from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

function sanitizeWorkDriveFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function workDriveFileExtension(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot);
}

function withPreservedExtension(nextName: string, previousName: string): string {
  const prevExt = workDriveFileExtension(previousName);
  if (!prevExt) return nextName;
  if (workDriveFileExtension(nextName)) return nextName;
  return `${nextName}${prevExt}`;
}

function replaceWorkDrivePathFileName(
  path: string | null,
  fileName: string,
): string | null {
  const raw = String(path ?? "").trim();
  if (!raw) return path;
  const parts = raw.split("/");
  parts[parts.length - 1] = fileName;
  return parts.join("/");
}

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
  "visa_noc",
  "visa_cancelation",
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

function toConnectionPublic(
  connection: HrWorkDriveConnection,
  defaultConnectionId: string | null,
): HrWorkDriveConnectionPublic {
  const envCreds = readWorkDriveEnvCredentials();
  const {
    clientSecretEncrypted: _cs,
    refreshTokenEncrypted: _rt,
    folders,
    ...rest
  } = connection;
  return {
    ...rest,
    clientId: connection.clientId || envCreds.clientId || "",
    hasClientSecret: Boolean(
      connection.clientSecretEncrypted || envCreds.clientSecret,
    ),
    hasRefreshToken: Boolean(
      connection.refreshTokenEncrypted || envCreds.refreshToken,
    ),
    folders,
    isDefault: connection.id === defaultConnectionId,
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
    isAppAdmin(permissions) ||
    canAdminLookups(permissions, venueId) ||
    canEditStaff(permissions, venueId)
  ) {
    return;
  }
  throw new Error("No permission to change Drive Setup settings.");
}

function flagTrue(raw: FormDataEntryValue | null): boolean {
  const v = String(raw ?? "").toLowerCase();
  return v === "true" || v === "on" || v === "1";
}

function parseDocSubfolders(formData: FormData): HrWorkDriveDocSubfolder[] {
  const raw = String(formData.get("doc_subfolders_json") ?? "").trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return mergeDocSubfoldersFromForm(parsed);
      }
    } catch {
      /* fall through to field-based parse */
    }
  }

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
    let fileSlots = defaults.fileSlots.map((slot) => ({ ...slot }));
    const slotsRaw = String(formData.get(`doc_slots_json_${kind}`) ?? "").trim();
    if (slotsRaw) {
      try {
        const slotsParsed = JSON.parse(slotsRaw) as unknown;
        if (Array.isArray(slotsParsed) && slotsParsed.length > 0) {
          fileSlots = slotsParsed
            .map((row, index) => {
              if (!row || typeof row !== "object") return null;
              const r = row as Record<string, unknown>;
              const id = String(r.id ?? "").trim() || `slot_${index + 1}`;
              const slotLabel =
                String(r.label ?? "").trim() || `File ${index + 1}`;
              const fileNameTemplate =
                String(r.fileNameTemplate ?? "").trim() ||
                `${label || defaults.label}_{emp_no}_{yyyy-MM-dd}`;
              return { id, label: slotLabel, fileNameTemplate };
            })
            .filter((row): row is NonNullable<typeof row> => row !== null);
          if (fileSlots.length === 0) {
            fileSlots = defaults.fileSlots.map((slot) => ({ ...slot }));
          }
        }
      } catch {
        /* keep defaults */
      }
    }
    return {
      kind: (parsedKind.success
        ? parsedKind.data
        : defaults.kind) as HrWorkDriveDocKind,
      folderName: folderName || defaults.folderName,
      label: label || defaults.label,
      active,
      fileSlots,
    };
  });
}

function mergeDocSubfoldersFromForm(
  partial: unknown[],
): HrWorkDriveDocSubfolder[] {
  const byKind = new Map<string, Record<string, unknown>>();
  for (const row of partial) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const kind = String(r.kind ?? "").trim();
    if (!kind) continue;
    byKind.set(kind, r);
  }
  return DEFAULT_HR_WORK_DRIVE_DOC_SUBFOLDERS.map((defaults) => {
    const override = byKind.get(defaults.kind);
    if (!override) {
      return {
        ...defaults,
        fileSlots: defaults.fileSlots.map((slot) => ({ ...slot })),
      };
    }
    const label =
      String(override.label ?? defaults.label).trim() || defaults.label;
    const folderName =
      String(override.folderName ?? defaults.folderName).trim() ||
      defaults.folderName;
    const active =
      typeof override.active === "boolean" ? override.active : defaults.active;
    let fileSlots = defaults.fileSlots.map((slot) => ({ ...slot }));
    if (Array.isArray(override.fileSlots) && override.fileSlots.length > 0) {
      const parsed = override.fileSlots
        .map((slot, index) => {
          if (!slot || typeof slot !== "object") return null;
          const s = slot as Record<string, unknown>;
          const id = String(s.id ?? "").trim() || `slot_${index + 1}`;
          const slotLabel = String(s.label ?? "").trim() || `File ${index + 1}`;
          const fileNameTemplate =
            String(s.fileNameTemplate ?? "").trim() ||
            `${label}_{emp_no}_{yyyy-MM-dd}`;
          return { id, label: slotLabel, fileNameTemplate };
        })
        .filter((slot): slot is NonNullable<typeof slot> => slot !== null);
      if (parsed.length > 0) fileSlots = parsed;
    }
    return {
      kind: defaults.kind,
      folderName,
      label,
      active,
      fileSlots,
    };
  });
}

function parseExtraFolders(formData: FormData): HrWorkDriveExtraFolder[] {
  const raw = String(formData.get("extra_folders_json") ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        const id = String(r.id ?? "").trim() || randomUUID();
        const name = String(r.name ?? "").trim();
        const folderId = String(r.folderId ?? "").trim();
        if (!name && !folderId) return null;
        const fileNameManagement = Boolean(r.fileNameManagement);
        const fileSlots = Array.isArray(r.fileSlots)
          ? r.fileSlots
              .map((slot, index) => {
                if (!slot || typeof slot !== "object") return null;
                const s = slot as Record<string, unknown>;
                const slotId =
                  String(s.id ?? "").trim() || `part_${index + 1}`;
                const label =
                  String(s.label ?? "").trim() || `File ${index + 1}`;
                const fileNameTemplate =
                  String(s.fileNameTemplate ?? "").trim() ||
                  `{doc_name}_{first_name}_{last_name}_{doc_expiry}`;
                return { id: slotId, label, fileNameTemplate };
              })
              .filter((slot): slot is NonNullable<typeof slot> => slot !== null)
          : undefined;
        return {
          id,
          name: name || "Folder",
          folderId,
          ...(fileNameManagement ? { fileNameManagement: true, fileSlots } : {}),
        };
      })
      .filter((row): row is HrWorkDriveExtraFolder => row !== null);
  } catch {
    return [];
  }
}

type NamedFolderRef = { id: string; name: string; label: string };

async function resolveWorkDriveApi(
  venueId: string,
  settings: HrWorkDriveSettings,
): Promise<{ accessToken: string; apiDomain: string } | null> {
  try {
    const credentials = credentialsFromSettings(settings);
    return await ensureAccessToken(venueId, credentials);
  } catch {
    return null;
  }
}

async function createMissingFoldersInZoho(
  venueId: string,
  settings: HrWorkDriveSettings,
  folder: HrWorkDriveFolder,
): Promise<{ folder: HrWorkDriveFolder; notes: string[] }> {
  const notes: string[] = [];
  const api = await resolveWorkDriveApi(venueId, settings);
  if (!api) return { folder, notes };

  const next: HrWorkDriveFolder = {
    ...folder,
    extraFolders: [...(folder.extraFolders ?? [])],
  };

  if (next.teamFolderId && !next.hrFolderId && next.hrFolderName.trim()) {
    try {
      const created = await createFolder(
        api.apiDomain,
        api.accessToken,
        next.teamFolderId,
        next.hrFolderName.trim(),
      );
      next.hrFolderId = created.id;
      notes.push(`Created module folder “${next.hrFolderName}” in Zoho.`);
    } catch (error) {
      notes.push(
        `Could not create module folder in Zoho: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  const moduleParent = next.hrFolderId;
  if (
    moduleParent &&
    !next.employeeDocsFolderId &&
    next.employeeDocsFolderName.trim()
  ) {
    try {
      const created = await createFolder(
        api.apiDomain,
        api.accessToken,
        moduleParent,
        next.employeeDocsFolderName.trim(),
      );
      next.employeeDocsFolderId = created.id;
      notes.push(
        `Created “${next.employeeDocsFolderName}” under the module folder.`,
      );
    } catch (error) {
      notes.push(
        `Could not create Employee Documents in Zoho: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  if (moduleParent) {
    next.extraFolders = await Promise.all(
      next.extraFolders.map(async (row) => {
        if (row.folderId.trim() || !row.name.trim()) return row;
        try {
          const created = await createFolder(
            api.apiDomain,
            api.accessToken,
            moduleParent,
            row.name.trim(),
          );
          notes.push(`Created extra folder “${row.name}” in Zoho.`);
          return { ...row, folderId: created.id };
        } catch (error) {
          notes.push(
            `Could not create “${row.name}” in Zoho: ${
              error instanceof Error ? error.message : "unknown error"
            }`,
          );
          return row;
        }
      }),
    );
  }

  return { folder: next, notes };
}

async function pushFolderRenamesToZoho(
  venueId: string,
  settings: HrWorkDriveSettings,
  previous: HrWorkDriveFolder | undefined,
  next: HrWorkDriveFolder,
): Promise<string[]> {
  const notes: string[] = [];
  const api = await resolveWorkDriveApi(venueId, settings);
  if (!api) return notes;
  const { accessToken, apiDomain } = api;

  const targets: NamedFolderRef[] = [
    {
      id: next.teamFolderId,
      name: next.teamFolderName,
      label: "Team folder",
    },
    {
      id: next.hrFolderId,
      name: next.hrFolderName,
      label: "Module folder",
    },
    {
      id: next.employeeDocsFolderId,
      name: next.employeeDocsFolderName,
      label: "Employee Documents",
    },
    ...next.extraFolders.map((row) => ({
      id: row.folderId,
      name: row.name,
      label: row.name || "Extra folder",
    })),
  ];

  const prevById = new Map<string, string>();
  if (previous) {
    if (previous.teamFolderId) {
      prevById.set(previous.teamFolderId, previous.teamFolderName);
    }
    if (previous.hrFolderId) {
      prevById.set(previous.hrFolderId, previous.hrFolderName);
    }
    if (previous.employeeDocsFolderId) {
      prevById.set(
        previous.employeeDocsFolderId,
        previous.employeeDocsFolderName || "Employee Documents",
      );
    }
    for (const row of previous.extraFolders ?? []) {
      if (row.folderId) prevById.set(row.folderId, row.name);
    }
  }

  for (const target of targets) {
    const id = target.id.trim();
    const name = target.name.trim();
    if (!id || !name) continue;
    const previousName = prevById.get(id);
    if (previousName === name) continue;
    try {
      const meta = await getMetadata(apiDomain, accessToken, id);
      if (meta.name === name) continue;
      await renameFile(apiDomain, accessToken, id, name);
      notes.push(`Renamed ${target.label} → “${name}” in Zoho.`);
    } catch (error) {
      notes.push(
        `Could not rename ${target.label} in Zoho: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  return notes;
}

async function pullFolderNamesFromZoho(
  venueId: string,
  settings: HrWorkDriveSettings,
  folder: HrWorkDriveFolder,
): Promise<HrWorkDriveFolder> {
  const credentials = credentialsFromSettings(settings);
  const { accessToken, apiDomain } = await ensureAccessToken(
    venueId,
    credentials,
  );

  const next = { ...folder, extraFolders: [...(folder.extraFolders ?? [])] };

  async function nameOf(id: string): Promise<string | null> {
    if (!id.trim()) return null;
    try {
      const meta = await getMetadata(apiDomain, accessToken, id.trim());
      return meta.name?.trim() || null;
    } catch {
      return null;
    }
  }

  const teamName = await nameOf(next.teamFolderId);
  if (teamName) next.teamFolderName = teamName;

  const hrName = await nameOf(next.hrFolderId);
  if (hrName) {
    next.hrFolderName = hrName;
    next.label = hrName;
  }

  const empName = await nameOf(next.employeeDocsFolderId);
  if (empName) next.employeeDocsFolderName = empName;

  next.extraFolders = await Promise.all(
    next.extraFolders.map(async (row) => {
      const synced = await nameOf(row.folderId);
      return synced ? { ...row, name: synced } : row;
    }),
  );

  return next;
}

function revalidateDriveConfig() {
  revalidatePath("/settings/drive-config", "layout");
  revalidatePath("/hr/settings/data-management", "layout");
}

async function persistStore(
  venueId: string,
  userId: string,
  store: HrWorkDriveStore,
  auditEntityId?: string,
) {
  const service = createServiceClient();
  const { error } = await service.from("hr_venue_settings").upsert(
    {
      venue_id: venueId,
      key: HR_SETTINGS_KEYS.workDrive,
      value: store,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "venue_id,key" },
  );
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: userId,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "hr_venue_settings",
    entity_id: auditEntityId ?? HR_SETTINGS_KEYS.workDrive,
    venue_id: venueId,
    after: {
      connectionCount: store.connections.length,
      defaultConnectionId: store.defaultConnectionId,
      connections: store.connections.map((c) => ({
        id: c.id,
        label: c.label,
        enabled: c.enabled,
        region: c.region,
        folderCount: c.folders.length,
        hasClientSecret: Boolean(c.clientSecretEncrypted),
        hasRefreshToken: Boolean(c.refreshTokenEncrypted),
        connectionStatus: c.connectionStatus,
      })),
    },
  });

  revalidateDriveConfig();
}

function findConnection(
  store: HrWorkDriveStore,
  connectionId: string,
): HrWorkDriveConnection | undefined {
  return store.connections.find((c) => c.id === connectionId);
}

function upsertConnection(
  store: HrWorkDriveStore,
  connection: HrWorkDriveConnection,
): HrWorkDriveStore {
  const exists = store.connections.some((c) => c.id === connection.id);
  const connections = exists
    ? store.connections.map((c) =>
        c.id === connection.id ? connection : c,
      )
    : [...store.connections, connection];
  return {
    connections,
    defaultConnectionId:
      store.defaultConnectionId &&
      connections.some((c) => c.id === store.defaultConnectionId)
        ? store.defaultConnectionId
        : connections[0]?.id ?? null,
  };
}

export async function getWorkDriveStoreForUi(): Promise<{
  store: HrWorkDriveStore;
  connections: HrWorkDriveConnectionPublic[];
}> {
  const auth = await getAuth();
  if ("error" in auth) {
    const empty = ensureWorkDriveStoreForUi({
      connections: [],
      defaultConnectionId: null,
    });
    return {
      store: empty,
      connections: empty.connections.map((c) =>
        toConnectionPublic(c, empty.defaultConnectionId),
      ),
    };
  }
  const loaded = await loadWorkDriveStore(auth.supabase, auth.venue.id);
  const store = ensureWorkDriveStoreForUi(loaded);
  return {
    store,
    connections: store.connections.map((c) =>
      toConnectionPublic(c, store.defaultConnectionId),
    ),
  };
}

export async function getWorkDriveSettings(): Promise<HrWorkDrivePublicSettings> {
  const auth = await getAuth();
  if ("error" in auth) {
    return toPublic(DEFAULT_HR_WORK_DRIVE_SETTINGS);
  }
  const settings = await loadWorkDriveSettings(auth.supabase, auth.venue.id);
  return toPublic(settings);
}

export type StaffDocUploadFilePart = {
  id: string;
  label: string;
};

/** Drive Setup file parts per document kind — used by staff entry upload slots. */
export async function getStaffDocUploadSlots(): Promise<
  Record<string, StaffDocUploadFilePart[]>
> {
  const settings = await getWorkDriveSettings();
  const result: Record<string, StaffDocUploadFilePart[]> = {};
  for (const row of settings.docSubfolders) {
    const slots = (row.fileSlots ?? [])
      .map((slot) => ({
        id: String(slot.id ?? "").trim(),
        label: String(slot.label ?? "").trim() || "File",
      }))
      .filter((slot) => slot.id);
    result[row.kind] =
      slots.length > 0 ? slots : [{ id: "default", label: "File" }];
  }
  return result;
}

/** Save OAuth / enable fields for one connection (keeps folders). */
export async function saveWorkDriveConnection(
  formData: FormData,
): Promise<
  | { ok: true; connectionId: string; message?: string }
  | { ok: false; error: string }
> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    const { user, venue, permissions, supabase } = auth;
    requireConfigurePermission(permissions, venue.id);

    const store = ensureWorkDriveStoreForUi(
      await loadWorkDriveStore(supabase, venue.id),
    );
    const connectionIdRaw = String(formData.get("connection_id") ?? "").trim();
    const existing = connectionIdRaw
      ? findConnection(store, connectionIdRaw)
      : undefined;
    const connectionId = existing?.id ?? randomUUID();

    const region = regionSchema.parse(
      String(formData.get("region") ?? existing?.region ?? "com"),
    ) as ZohoWorkDriveRegion;

    const clientId = String(formData.get("client_id") ?? "").trim();
    const clientSecretRaw = String(formData.get("client_secret") ?? "").trim();
    const refreshTokenRaw = String(formData.get("refresh_token") ?? "").trim();
    // Self Client grant code — one-time authorization_code exchange only.
    // Never treat this as a refresh_token.
    const grantCodeRaw = String(formData.get("grant_code") ?? "").trim();
    const label =
      String(formData.get("connection_label") ?? "").trim() ||
      existing?.label ||
      "ZOHO WorkDrive";

    const clientSecretEncrypted = clientSecretRaw
      ? encryptSecret(clientSecretRaw)
      : existing?.clientSecretEncrypted ?? null;

    let refreshTokenEncrypted =
      existing?.refreshTokenEncrypted ?? null;
    let connectionStatus = existing?.connectionStatus ?? "disconnected";
    let lastVerifiedAt = existing?.lastVerifiedAt ?? null;
    let lastError = existing?.lastError ?? null;
    let exchangedGrantCode = false;

    if (grantCodeRaw) {
      if (!clientId) {
        return { ok: false, error: "Client ID is required to exchange a grant code." };
      }
      let clientSecret = clientSecretRaw;
      if (!clientSecret) {
        if (!existing?.clientSecretEncrypted) {
          return {
            ok: false,
            error: "Client secret is required to exchange a grant code.",
          };
        }
        clientSecret = decryptSecret(existing.clientSecretEncrypted);
      }

      try {
        const tokens = await exchangeAuthorizationCode({
          region,
          clientId,
          clientSecret,
          code: grantCodeRaw,
        });
        refreshTokenEncrypted = encryptSecret(tokens.refreshToken);
        lastVerifiedAt = new Date().toISOString();
        lastError = null;
        connectionStatus = "disconnected";
        exchangedGrantCode = true;
        clearAccessTokenCache(venue.id);
        console.log(
          `[workdrive] saved new refresh token after authorization_code exchange ` +
            `(connection=${connectionId}, fingerprint=${fingerprintCredential(tokens.refreshToken)})`,
        );
      } catch (error) {
        // Do not overwrite existing refresh token / good state on failed exchange.
        const rawBody =
          error instanceof WorkDriveApiError && error.body
            ? error.body.trim().slice(0, 800)
            : "";
        const message =
          error instanceof WorkDriveApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Grant code exchange failed.";
        return {
          ok: false,
          error: rawBody && rawBody !== message
            ? `${message}\n\nRaw response: ${rawBody}`
            : message,
        };
      }
    } else if (refreshTokenRaw) {
      // Explicit refresh token paste only — never a grant code path.
      refreshTokenEncrypted = encryptSecret(refreshTokenRaw);
    }

    const nextConnection: HrWorkDriveConnection = {
      id: connectionId,
      label,
      enabled: flagTrue(formData.get("enabled")),
      region,
      clientId,
      clientSecretEncrypted,
      refreshTokenEncrypted,
      connectionStatus,
      lastVerifiedAt,
      lastError,
      folders:
        existing?.folders?.length
          ? existing.folders
          : emptyWorkDriveConnection().folders,
    };

    const nextStore = upsertConnection(store, nextConnection);
    await persistStore(
      venue.id,
      user.id,
      nextStore,
      `${HR_SETTINGS_KEYS.workDrive}:${connectionId}`,
    );
    return {
      ok: true,
      connectionId,
      message: exchangedGrantCode
        ? "Grant code exchanged — refresh token saved. Click Test connection to verify."
        : "Connection saved.",
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not save connection.",
    };
  }
}

/** Save / create a folder tree under a connection. */
export async function saveWorkDriveFolder(
  formData: FormData,
): Promise<
  | { ok: true; connectionId: string; folderId: string; notes?: string[] }
  | { ok: false; error: string }
> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    const { user, venue, permissions, supabase } = auth;
    requireConfigurePermission(permissions, venue.id);

    const store = ensureWorkDriveStoreForUi(
      await loadWorkDriveStore(supabase, venue.id),
    );
    const connectionId = String(formData.get("connection_id") ?? "").trim();
    const connection = findConnection(store, connectionId);
    if (!connection) {
      return { ok: false, error: "Save the Zoho connection first." };
    }

    const folderIdRaw = String(formData.get("folder_id") ?? "").trim();
    const existing = folderIdRaw
      ? connection.folders.find((f) => f.id === folderIdRaw)
      : undefined;
    const folderId = existing?.id ?? randomUUID();

    const teamFolderName =
      String(formData.get("team_folder_name") ?? "").trim() ||
      existing?.teamFolderName ||
      DEFAULT_HR_WORK_DRIVE_SETTINGS.teamFolderName;
    const teamFolderId = String(formData.get("team_folder_id") ?? "").trim();
    const hrFolderName =
      String(formData.get("hr_folder_name") ?? "").trim() ||
      String(formData.get("folder_label") ?? "").trim() ||
      existing?.hrFolderName ||
      "Drive folder";
    const hrFolderId = String(formData.get("hr_folder_id") ?? "").trim();

    const moduleKeyRaw = String(formData.get("module_key") ?? "").trim();
    const moduleKey =
      moduleKeyRaw ||
      existing?.moduleKey ||
      (folderId === "hr" || /human\s*resources/i.test(hrFolderName)
        ? "hr"
        : "custom");

    const employeeDocsFolderName =
      moduleKey === "hr"
        ? String(formData.get("employee_docs_folder_name") ?? "").trim() ||
          existing?.employeeDocsFolderName ||
          DEFAULT_HR_WORK_DRIVE_SETTINGS.employeeDocsFolderName
        : String(formData.get("employee_docs_folder_name") ?? "").trim() ||
          existing?.employeeDocsFolderName ||
          "";
    const employeeDocsFolderId = String(
      formData.get("employee_docs_folder_id") ?? "",
    ).trim();
    const extraFolders = parseExtraFolders(formData);

    // Nav tab label follows the module folder name (under SS-OPS-HUB).
    const label = hrFolderName;

    const nextFolder: HrWorkDriveFolder = {
      id: folderId,
      label,
      moduleKey,
      teamFolderName,
      teamFolderId,
      hrFolderName,
      hrFolderId,
      employeeDocsFolderId,
      employeeDocsFolderName,
      extraFolders,
      employeeFolderTemplate:
        String(formData.get("employee_folder_template") ?? "").trim() ||
        "{emp_no} — {full_name}",
      fileNameTemplate:
        String(formData.get("file_name_template") ?? "").trim() ||
        "{doc_label}_{emp_no}_{yyyy-MM-dd}",
      autoCreateFolders: flagTrue(formData.get("auto_create_folders")),
      docSubfolders: parseDocSubfolders(formData),
    };

    const settings = flattenWorkDrive(connection, nextFolder);
    const created = await createMissingFoldersInZoho(
      venue.id,
      settings,
      nextFolder,
    );
    const folderAfterCreate = created.folder;
    const renameNotes = await pushFolderRenamesToZoho(
      venue.id,
      flattenWorkDrive(connection, folderAfterCreate),
      existing,
      folderAfterCreate,
    );
    const notes = [...created.notes, ...renameNotes];

    const folders = existing
      ? connection.folders.map((f) =>
          f.id === folderId ? folderAfterCreate : f,
        )
      : [...connection.folders, folderAfterCreate];

    const nextStore = upsertConnection(store, { ...connection, folders });
    await persistStore(
      venue.id,
      user.id,
      nextStore,
      `${HR_SETTINGS_KEYS.workDrive}:${connectionId}:folder:${folderId}`,
    );
    return { ok: true, connectionId, folderId, notes };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not save drive folder.",
    };
  }
}

/** Pull team / module / Employee Documents / extra folder names from Zoho metadata. */
export async function syncWorkDriveFolderNamesFromZoho(
  connectionId: string,
  folderId: string,
): Promise<
  | { ok: true; folder: HrWorkDriveFolder; message: string }
  | { ok: false; error: string }
> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    const { user, venue, permissions, supabase } = auth;
    requireConfigurePermission(permissions, venue.id);

    const store = ensureWorkDriveStoreForUi(
      await loadWorkDriveStore(supabase, venue.id),
    );
    const connection = findConnection(store, connectionId);
    if (!connection) {
      return { ok: false, error: "Connection not found." };
    }
    const folder = connection.folders.find((f) => f.id === folderId);
    if (!folder) {
      return { ok: false, error: "Folder not found." };
    }

    const settings = flattenWorkDrive(connection, folder);
    const synced = await pullFolderNamesFromZoho(venue.id, settings, folder);
    const folders = connection.folders.map((f) =>
      f.id === folderId ? synced : f,
    );
    const nextStore = upsertConnection(store, { ...connection, folders });
    await persistStore(
      venue.id,
      user.id,
      nextStore,
      `${HR_SETTINGS_KEYS.workDrive}:${connectionId}:folder:${folderId}:sync-names`,
    );
    revalidateDriveConfig();
    return {
      ok: true,
      folder: synced,
      message: "Folder names updated from Zoho.",
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not sync folder names from Zoho.",
    };
  }
}

/**
 * Backward-compatible full save (connection + folder fields in one form).
 * Prefer saveWorkDriveConnection / saveWorkDriveFolder for new UI.
 */
export async function saveWorkDriveSettings(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const connectionId = String(formData.get("connection_id") ?? "zoho").trim();
  const folderId = String(formData.get("folder_id") ?? "hr").trim();
  if (!formData.get("connection_id")) formData.set("connection_id", connectionId);
  if (!formData.get("folder_id")) formData.set("folder_id", folderId);

  const connResult = await saveWorkDriveConnection(formData);
  if (!connResult.ok) return connResult;
  formData.set("connection_id", connResult.connectionId);
  const folderResult = await saveWorkDriveFolder(formData);
  if (!folderResult.ok) return folderResult;
  return { ok: true };
}

export async function exchangeWorkDriveGrantCode(
  formData: FormData,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    const { user, venue, permissions, supabase } = auth;
    requireConfigurePermission(permissions, venue.id);

    const store = ensureWorkDriveStoreForUi(
      await loadWorkDriveStore(supabase, venue.id),
    );
    const connectionId = String(formData.get("connection_id") ?? "zoho").trim();
    const current =
      findConnection(store, connectionId) ??
      emptyWorkDriveConnection({ id: connectionId });

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

    let tokens;
    try {
      tokens = await exchangeAuthorizationCode({
        region,
        clientId,
        clientSecret,
        code,
      });
    } catch (error) {
      // Do not overwrite existing refresh token on failed exchange.
      const rawBody =
        error instanceof WorkDriveApiError && error.body
          ? error.body.trim().slice(0, 800)
          : "";
      const message =
        error instanceof WorkDriveApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not exchange grant code.";
      return {
        ok: false,
        error:
          rawBody && rawBody !== message
            ? `${message}\n\nRaw response: ${rawBody}`
            : message,
      };
    }

    const nextConnection: HrWorkDriveConnection = {
      ...current,
      id: current.id || connectionId,
      region,
      clientId,
      clientSecretEncrypted: encryptSecret(clientSecret),
      refreshTokenEncrypted: encryptSecret(tokens.refreshToken),
      connectionStatus: "disconnected",
      lastVerifiedAt: new Date().toISOString(),
      lastError: null,
      folders: current.folders.length
        ? current.folders
        : emptyWorkDriveConnection().folders,
    };

    await persistStore(
      venue.id,
      user.id,
      upsertConnection(store, nextConnection),
      `${HR_SETTINGS_KEYS.workDrive}:${nextConnection.id}:exchange`,
    );

    clearAccessTokenCache(venue.id);
    console.log(
      `[workdrive] exchanged grant code → refresh token saved ` +
        `(connection=${nextConnection.id}, fingerprint=${fingerprintCredential(tokens.refreshToken)})`,
    );

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

export async function testWorkDriveConnection(
  formData?: FormData,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  let probeSettings: HrWorkDriveSettings | null = null;
  let testedFolderId = "";

  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    const { user, venue, permissions, supabase } = auth;
    requireConfigurePermission(permissions, venue.id);

    const store = ensureWorkDriveStoreForUi(
      await loadWorkDriveStore(supabase, venue.id),
    );
    const connectionId = String(
      formData?.get("connection_id") ?? store.defaultConnectionId ?? "zoho",
    ).trim();
    const connection = findConnection(store, connectionId);
    if (!connection) {
      return { ok: false, error: "Connection not found." };
    }

    const folderId = String(formData?.get("folder_id") ?? "").trim();
    const folder =
      (folderId
        ? connection.folders.find((f) => f.id === folderId)
        : null) ??
      connection.folders.find((f) => f.moduleKey === "hr") ??
      connection.folders[0] ??
      emptyWorkDriveFolder({ id: "hr", label: "Human Resources", moduleKey: "hr" });

    const settings = flattenWorkDrive(connection, folder);
    probeSettings = settings;
    testedFolderId =
      settings.employeeDocsFolderId ||
      settings.hrFolderId ||
      settings.teamFolderId ||
      "";

    const missing: string[] = [];
    if (!settings.clientId) missing.push("Client ID");
    if (!settings.clientSecretEncrypted) missing.push("Client secret");
    if (!settings.refreshTokenEncrypted) missing.push("Refresh token");
    if (
      !settings.hrFolderId &&
      !settings.teamFolderId &&
      !settings.employeeDocsFolderId
    ) {
      missing.push("Employee Documents folder ID (or HR / Team folder ID)");
    }

    if (missing.length) {
      const probe = probeWorkDriveCredentials(settings);
      const error = [
        `Complete connection fields first (${missing.join(", ")}).`,
        "",
        "Debug:",
        `• Region: ${probe.region}`,
        `• Client ID: ${probe.clientId} (source: ${probe.clientIdSource})`,
        `• Client secret: ${probe.clientSecretFingerprint} (source: ${probe.clientSecretSource})`,
        `• Refresh token: ${probe.refreshTokenFingerprint} (source: ${probe.refreshTokenSource})`,
      ].join("\n");
      const nextStore = upsertConnection(store, {
        ...connection,
        connectionStatus: "error",
        lastError: error,
      });
      await persistStore(venue.id, user.id, nextStore);
      return { ok: false, error };
    }

    const result = await verifyWorkDriveAccess(venue.id, settings);
    const nextStore = upsertConnection(store, {
      ...connection,
      connectionStatus: "connected",
      lastVerifiedAt: new Date().toISOString(),
      lastError: null,
    });
    await persistStore(venue.id, user.id, nextStore);

    return {
      ok: true,
      message: [
        `Connected to WorkDrive (${result.apiDomain}).`,
        `Listed ${result.childCount} item(s) in folder ${result.folderId}.`,
        `Client ID ${probeWorkDriveCredentials(settings).clientId}.`,
      ].join(" "),
    };
  } catch (error) {
    const probe = probeSettings
      ? probeWorkDriveCredentials(probeSettings)
      : probeWorkDriveCredentials(DEFAULT_HR_WORK_DRIVE_SETTINGS);
    const step =
      error instanceof WorkDriveApiError &&
      /invalid_client|invalid_grant|invalid_code|access_denied|token/i.test(
        error.message + (error.code ?? ""),
      )
        ? "OAuth token refresh (accounts.zoho…/oauth/v2/token)"
        : error instanceof WorkDriveApiError
          ? "WorkDrive API (list folder)"
          : "connection test";
    const detailed = formatWorkDriveTestFailure(error, probe, {
      step,
      folderId: testedFolderId || undefined,
    });

    try {
      const auth = await getAuth();
      if (!("error" in auth)) {
        const store = ensureWorkDriveStoreForUi(
          await loadWorkDriveStore(auth.supabase, auth.venue.id),
        );
        const connectionId = String(
          formData?.get("connection_id") ?? store.defaultConnectionId ?? "zoho",
        ).trim();
        const connection = findConnection(store, connectionId);
        if (connection) {
          await persistStore(
            auth.venue.id,
            auth.user.id,
            upsertConnection(store, {
              ...connection,
              connectionStatus: "error",
              lastError: detailed,
            }),
          );
        }
      }
    } catch {
      /* ignore persist failure */
    }

    return { ok: false, error: detailed };
  }
}

export type UploadStaffWorkDriveDocumentInput = {
  staffId: string;
  empNo: string;
  fullName: string;
  docKind: HrWorkDriveDocKind;
  fileSlotId?: string;
  docExpiry?: string;
  /** Prefer the /api/hr/workdrive/upload route from the browser. */
  fileName: string;
  contentType: string;
  bytesBase64: string;
};

export async function uploadStaffWorkDriveDocument(
  input: UploadStaffWorkDriveDocumentInput,
): Promise<
  | {
      ok: true;
      workdriveFileId: string;
      permalink: string;
      path: string;
      fileName: string;
    }
  | { ok: false; error: string }
> {
  const auth = await getAuth();
  if ("error" in auth) return { ok: false, error: auth.error };

  let bytes: Buffer;
  try {
    bytes = Buffer.from(String(input.bytesBase64 ?? ""), "base64");
  } catch {
    return { ok: false, error: "Invalid file payload." };
  }

  return performStaffWorkDriveUpload(auth, {
    staffId: input.staffId,
    empNo: input.empNo,
    fullName: input.fullName,
    docKind: input.docKind,
    fileSlotId: input.fileSlotId,
    docExpiry: input.docExpiry,
    bytes,
    originalFileName: input.fileName,
    contentType: input.contentType,
  });
}

export type StaffWorkDriveDocumentListItem = {
  id: string;
  workdriveFileId: string;
  fileName: string;
  path: string | null;
  permalink: string | null;
  folderId: string | null;
  fileSlotId: string | null;
  uploadedAt: string;
  /** True when Zoho reports the file deleted/trashed outside the hub. */
  isMissing: boolean;
  missingReason: "deleted_on_workdrive" | "trashed_on_workdrive" | null;
};

function toStaffWorkDriveDocumentListItem(
  row: Awaited<ReturnType<typeof listStaffWorkDriveDocuments>>[number],
): StaffWorkDriveDocumentListItem {
  return {
    id: row.id,
    workdriveFileId: row.workdrive_file_id,
    fileName: row.file_name,
    path: row.path,
    permalink: row.permalink,
    folderId: row.subfolder_id || row.employee_folder_id,
    fileSlotId: row.file_slot_id,
    uploadedAt: row.uploaded_at,
    isMissing: Boolean(row.missing_at),
    missingReason: row.missing_reason,
  };
}

export type StaffProfileDocumentPresence = {
  docKind: string;
  fileSlotId: string | null;
  isMissing: boolean;
};

/** All WorkDrive file slots + presence for a staff profile completeness check. */
export async function getStaffProfileDocumentIndex(staffId: string): Promise<
  | {
      ok: true;
      slots: Record<string, StaffDocUploadFilePart[]>;
      present: StaffProfileDocumentPresence[];
    }
  | { ok: false; error: string }
> {
  const auth = await getAuth();
  if ("error" in auth) return { ok: false, error: auth.error };

  const id = String(staffId ?? "").trim();
  if (!id) return { ok: false, error: "Missing staff id." };

  if (
    !canAccessStaff(auth.permissions, auth.venue.id) &&
    !canViewStaff(auth.permissions, auth.venue.id) &&
    !canEditStaff(auth.permissions, auth.venue.id) &&
    !canAccessAssets(auth.permissions, auth.venue.id) &&
    !canEditAssets(auth.permissions, auth.venue.id)
  ) {
    return { ok: false, error: "No permission to view staff documents." };
  }

  try {
    const [slots, rows] = await Promise.all([
      getStaffDocUploadSlots(),
      listStaffWorkDriveDocumentsForStaff(
        createServiceClient(),
        auth.venue.id,
        id,
      ),
    ]);
    return {
      ok: true,
      slots,
      present: rows.map((row) => ({
        docKind: row.doc_kind,
        fileSlotId: row.file_slot_id,
        isMissing: Boolean(row.missing_at),
      })),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not load profile documents.",
    };
  }
}

export async function listStaffWorkDriveDocs(input: {
  staffId: string;
  docKind: HrWorkDriveDocKind;
  fileSlotId?: string;
}): Promise<
  | { ok: true; items: StaffWorkDriveDocumentListItem[] }
  | { ok: false; error: string }
> {
  const auth = await getAuth();
  if ("error" in auth) return { ok: false, error: auth.error };

  const staffId = String(input.staffId ?? "").trim();
  if (!staffId) return { ok: false, error: "Missing staff id." };

  if (
    !canViewStaff(auth.permissions, auth.venue.id) &&
    !canEditStaff(auth.permissions, auth.venue.id) &&
    !canAccessAssets(auth.permissions, auth.venue.id) &&
    !canEditAssets(auth.permissions, auth.venue.id)
  ) {
    return { ok: false, error: "No permission to view staff documents." };
  }

  try {
    const service = createServiceClient();
    const rows = await listStaffWorkDriveDocuments(
      service,
      auth.venue.id,
      staffId,
      input.docKind,
      { fileSlotId: input.fileSlotId },
    );

    let reconciled = rows;
    if (rows.length > 0) {
      try {
        const settings = await loadWorkDriveSettings(service, auth.venue.id);
        const credentials = credentialsFromSettings(settings);
        const { accessToken, apiDomain } = await ensureAccessToken(
          auth.venue.id,
          credentials,
        );
        reconciled = await reconcileStaffWorkDriveDocumentsPresence({
          supabase: service,
          venueId: auth.venue.id,
          apiDomain,
          accessToken,
          rows,
        });
      } catch {
        // Listing still works from metadata if WorkDrive is unreachable.
        reconciled = rows;
      }
    }

    return {
      ok: true,
      items: reconciled.map(toStaffWorkDriveDocumentListItem),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not load documents.",
    };
  }
}

export async function resolveWorkDriveFolderLink(input: {
  folderId: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const auth = await getAuth();
  if ("error" in auth) return { ok: false, error: auth.error };

  const folderId = String(input.folderId ?? "").trim();
  if (!folderId) return { ok: false, error: "Missing folder id." };

  if (
    !canViewStaff(auth.permissions, auth.venue.id) &&
    !canEditStaff(auth.permissions, auth.venue.id) &&
    !canAccessAssets(auth.permissions, auth.venue.id)
  ) {
    return { ok: false, error: "No permission." };
  }

  try {
    const settings = await loadWorkDriveSettings(
      createServiceClient(),
      auth.venue.id,
    );
    // Same pattern as file permalinks (workdrive.zoho.com/file/{id}) —
    // open the folder in the browser without an OAuth API round-trip.
    return {
      ok: true,
      url: workDriveFolderWebUrl(settings.region, folderId),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not open folder.",
    };
  }
}

/**
 * Open the staff member's Employee Documents folder in WorkDrive
 * (SS-OPS-HUB → Human Resources → Employee Documents → `{emp_no} — {full_name}`).
 */
export async function resolveStaffEmployeeWorkDriveFolderLink(input: {
  staffId: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const auth = await getAuth();
  if ("error" in auth) return { ok: false, error: auth.error };

  if (
    !canViewStaff(auth.permissions, auth.venue.id) &&
    !canEditStaff(auth.permissions, auth.venue.id)
  ) {
    return { ok: false, error: "No permission." };
  }

  const staffId = String(input.staffId ?? "").trim();
  if (!staffId) return { ok: false, error: "Missing staff id." };

  const service = createServiceClient();

  const { data: staff, error: staffError } = await auth.supabase
    .from("staff")
    .select("id, emp_no, full_name")
    .eq("id", staffId)
    .eq("home_venue_id", auth.venue.id)
    .maybeSingle();

  if (staffError) return { ok: false, error: staffError.message };
  if (!staff) return { ok: false, error: "Staff member not found." };

  const empNo = String(staff.emp_no ?? "").trim();
  const fullName = String(staff.full_name ?? "").trim();
  if (!empNo || !fullName) {
    return {
      ok: false,
      error: "Employee number and full name are required.",
    };
  }

  try {
    const settings = await loadWorkDriveSettings(service, auth.venue.id);
    if (!settings.enabled) {
      return {
        ok: false,
        error: "Enable WorkDrive in Venue Settings → Drive config first.",
      };
    }

    // Prefer a folder id already recorded from a prior upload.
    const { data: docRow } = await service
      .from("hr_staff_workdrive_documents")
      .select("employee_folder_id")
      .eq("venue_id", auth.venue.id)
      .eq("staff_id", staffId)
      .not("employee_folder_id", "is", null)
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const knownFolderId = String(
      (docRow as { employee_folder_id?: string | null } | null)
        ?.employee_folder_id ?? "",
    ).trim();
    if (knownFolderId) {
      return {
        ok: true,
        url: workDriveFolderWebUrl(settings.region, knownFolderId),
      };
    }

    const parentId =
      settings.employeeDocsFolderId.trim() ||
      ZOHO_WD_VERIFIED.employeeDocsFolderId;
    if (!parentId) {
      return {
        ok: false,
        error: "Employee Documents folder ID is not configured.",
      };
    }

    const credentials = credentialsFromSettings(settings);
    const { accessToken, apiDomain } = await ensureAccessToken(
      auth.venue.id,
      credentials,
    );

    const empFolderName = sanitizeWorkDriveFileName(
      renderWorkDriveTemplate(settings.employeeFolderTemplate, {
        emp_no: empNo,
        full_name: fullName,
      }),
    );
    if (!empFolderName) {
      return { ok: false, error: "Employee folder name resolved empty." };
    }

    let folder = await findChildByName(
      apiDomain,
      accessToken,
      parentId,
      empFolderName,
    );

    if (!folder && settings.autoCreateFolders) {
      try {
        folder = await createFolder(
          apiDomain,
          accessToken,
          parentId,
          empFolderName,
        );
      } catch {
        folder = await findChildByName(
          apiDomain,
          accessToken,
          parentId,
          empFolderName,
        );
      }
    }

    if (!folder) {
      return {
        ok: false,
        error:
          "Employee folder not found in WorkDrive yet. Upload a document first, or enable auto-create folders in Drive config.",
      };
    }

    return {
      ok: true,
      url: workDriveFolderWebUrl(settings.region, folder.id),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof WorkDriveApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not open employee folder.",
    };
  }
}

export async function deleteStaffWorkDriveDoc(input: {
  documentId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await getAuth();
  if ("error" in auth) return { ok: false, error: auth.error };

  if (
    !canEditStaff(auth.permissions, auth.venue.id) &&
    !canEditAssets(auth.permissions, auth.venue.id)
  ) {
    return { ok: false, error: "No permission to delete staff documents." };
  }

  const documentId = String(input.documentId ?? "").trim();
  if (!documentId) return { ok: false, error: "Missing document id." };

  const service = createServiceClient();
  try {
    const existing = await getStaffWorkDriveDocumentById(
      service,
      auth.venue.id,
      documentId,
    );
    if (!existing) {
      return { ok: false, error: "Document not found." };
    }

    const settings = await loadWorkDriveSettings(service, auth.venue.id);
    const credentials = credentialsFromSettings(settings);
    const { accessToken, apiDomain } = await ensureAccessToken(
      auth.venue.id,
      credentials,
    );

    try {
      if (!existing.missing_at) {
        await trashFile(apiDomain, accessToken, existing.workdrive_file_id);
      }
    } catch (error) {
      // File already gone in WorkDrive — still clear local metadata.
      if (
        !(error instanceof WorkDriveApiError) ||
        (error.status !== 404 && error.status !== 400)
      ) {
        throw error;
      }
    }

    await deleteStaffWorkDriveDocumentMeta(service, auth.venue.id, documentId);

    await writeAuditLog({
      actor_id: auth.user.id,
      action: "delete",
      module_key: HR_MODULE_KEY,
      entity: "workdrive_staff_document",
      entity_id: existing.workdrive_file_id,
      venue_id: auth.venue.id,
      before: {
        staffId: existing.staff_id,
        docKind: existing.doc_kind,
        fileName: existing.file_name,
        path: existing.path,
      },
    });

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof WorkDriveApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Delete failed.",
    };
  }
}

export async function renameStaffWorkDriveDoc(input: {
  documentId: string;
  fileName: string;
}): Promise<
  | { ok: true; fileName: string; path: string | null }
  | { ok: false; error: string }
> {
  const auth = await getAuth();
  if ("error" in auth) return { ok: false, error: auth.error };

  if (
    !canEditStaff(auth.permissions, auth.venue.id) &&
    !canEditAssets(auth.permissions, auth.venue.id)
  ) {
    return { ok: false, error: "No permission to rename staff documents." };
  }

  const documentId = String(input.documentId ?? "").trim();
  if (!documentId) return { ok: false, error: "Missing document id." };

  const service = createServiceClient();
  try {
    const existing = await getStaffWorkDriveDocumentById(
      service,
      auth.venue.id,
      documentId,
    );
    if (!existing) {
      return { ok: false, error: "Document not found." };
    }
    if (existing.missing_at) {
      return {
        ok: false,
        error: "This file was deleted from WorkDrive and cannot be renamed.",
      };
    }

    const nextName = withPreservedExtension(
      sanitizeWorkDriveFileName(String(input.fileName ?? "")),
      existing.file_name,
    );
    if (!nextName) {
      return { ok: false, error: "Enter a file name." };
    }
    if (nextName.length > 200) {
      return { ok: false, error: "File name is too long." };
    }

    const nextPath = replaceWorkDrivePathFileName(existing.path, nextName);
    if (nextName === existing.file_name) {
      return { ok: true, fileName: nextName, path: nextPath };
    }

    const settings = await loadWorkDriveSettings(service, auth.venue.id);
    const credentials = credentialsFromSettings(settings);
    const { accessToken, apiDomain } = await ensureAccessToken(
      auth.venue.id,
      credentials,
    );

    await renameFile(apiDomain, accessToken, existing.workdrive_file_id, nextName);
    await updateStaffWorkDriveDocumentFileName(
      service,
      auth.venue.id,
      documentId,
      nextName,
      nextPath,
    );

    await writeAuditLog({
      actor_id: auth.user.id,
      action: "update",
      module_key: HR_MODULE_KEY,
      entity: "workdrive_staff_document",
      entity_id: existing.workdrive_file_id,
      venue_id: auth.venue.id,
      before: {
        staffId: existing.staff_id,
        docKind: existing.doc_kind,
        fileName: existing.file_name,
        path: existing.path,
      },
      after: {
        staffId: existing.staff_id,
        docKind: existing.doc_kind,
        fileName: nextName,
        path: nextPath,
      },
    });

    return { ok: true, fileName: nextName, path: nextPath };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof WorkDriveApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Rename failed.",
    };
  }
}

/**
 * Push the staff member's current profile photo (from staff-photos storage)
 * into WorkDrive under Employee Documents → `{emp_no} — {full_name}` as
 * `{emp_no} - {full_name}.webp`.
 */
export async function uploadStaffProfilePhotoToWorkDrive(
  staffId: string,
): Promise<
  | {
      ok: true;
      workdriveFileId: string;
      permalink: string;
      path: string;
      fileName: string;
    }
  | { ok: false; error: string }
> {
  const auth = await getAuth();
  if ("error" in auth) return { ok: false, error: auth.error };

  const id = String(staffId ?? "").trim();
  if (!id) return { ok: false, error: "Missing staff id." };

  if (!canEditStaff(auth.permissions, auth.venue.id)) {
    return { ok: false, error: "No permission to upload staff documents." };
  }

  const { data: staff, error: staffError } = await auth.supabase
    .from("staff")
    .select("id, emp_no, full_name, first_name, last_name, photo_url")
    .eq("id", id)
    .eq("home_venue_id", auth.venue.id)
    .maybeSingle();

  if (staffError) return { ok: false, error: staffError.message };
  if (!staff) return { ok: false, error: "Staff member not found." };

  const empNo = String(staff.emp_no ?? "").trim();
  const fullName = String(staff.full_name ?? "").trim();
  const photoUrl = String(staff.photo_url ?? "").trim();
  if (!empNo || !fullName) {
    return {
      ok: false,
      error: "Employee number and full name are required before uploading.",
    };
  }
  if (!photoUrl) {
    return { ok: false, error: "This employee has no profile photo to upload." };
  }

  const service = createServiceClient();
  const cropPath = `${auth.venue.id}/${id}.webp`;
  let bytes: Buffer | null = null;
  let contentType = "image/webp";

  const { data: downloaded, error: downloadError } = await service.storage
    .from("staff-photos")
    .download(cropPath);

  if (!downloadError && downloaded) {
    bytes = Buffer.from(await downloaded.arrayBuffer());
    contentType = downloaded.type || "image/webp";
  } else {
    try {
      const res = await fetch(photoUrl);
      if (!res.ok) {
        return {
          ok: false,
          error: "Could not download the current profile photo.",
        };
      }
      bytes = Buffer.from(await res.arrayBuffer());
      contentType = res.headers.get("content-type") || "image/webp";
    } catch {
      return {
        ok: false,
        error: "Could not download the current profile photo.",
      };
    }
  }

  if (!bytes?.length) {
    return { ok: false, error: "Profile photo file is empty." };
  }

  const ext =
    contentType.includes("jpeg") || contentType.includes("jpg")
      ? ".jpg"
      : contentType.includes("png")
        ? ".png"
        : ".webp";
  const fileName = `${empNo} - ${fullName}${ext}`;

  return performStaffWorkDriveUpload(auth, {
    staffId: id,
    empNo,
    fullName,
    docKind: "profile_photo",
    bytes,
    originalFileName: fileName,
    contentType,
    overrideNameExist: true,
  });
}
