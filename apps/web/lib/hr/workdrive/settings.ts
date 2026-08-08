import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { applyAssetsWorkDriveEnvDefaults, applyWorkDriveEnvDefaults } from "@/lib/hr/workdrive/env";
import { ZOHO_WD_VERIFIED } from "@/lib/hr/workdrive/constants";
import {
  DEFAULT_HR_WORK_DRIVE_DOC_SUBFOLDERS,
  DEFAULT_HR_WORK_DRIVE_SETTINGS,
  HR_SETTINGS_KEYS,
  type HrWorkDriveConnection,
  type HrWorkDriveDocFileSlot,
  type HrWorkDriveDocSubfolder,
  type HrWorkDriveExtraFolder,
  type HrWorkDriveFolder,
  type HrWorkDriveSettings,
  type HrWorkDriveStore,
  type ZohoWorkDriveRegion,
} from "@/lib/hr/types";

const REGIONS = new Set<ZohoWorkDriveRegion>([
  "com",
  "eu",
  "in",
  "com.au",
  "jp",
  "uk",
  "ca",
  "sa",
]);

function normalizeFileSlots(
  partial: HrWorkDriveDocFileSlot[] | undefined,
  defaults: HrWorkDriveDocFileSlot[],
  docLabel: string,
  legacyFileNameTemplate?: string,
): HrWorkDriveDocFileSlot[] {
  const legacySingleSlot =
    Array.isArray(partial) &&
    partial.length === 1 &&
    defaults.length > 1 &&
    (String(partial[0]?.id ?? "") === "default" ||
      String(partial[0]?.label ?? "").trim().toLowerCase() === "file");

  if (!Array.isArray(partial) || partial.length === 0 || legacySingleSlot) {
    return defaults.map((slot) => ({ ...slot }));
  }
  const normalized = partial
    .map((row, index) => {
      if (!row || typeof row !== "object") return null;
      const id = String(row.id ?? "").trim() || `slot_${index + 1}`;
      const label = String(row.label ?? "").trim() || `File ${index + 1}`;
      const fileNameTemplate =
        String(row.fileNameTemplate ?? "").trim() ||
        legacyFileNameTemplate?.trim() ||
        `${docLabel}_{emp_no}_{yyyy-MM-dd}`;
      return { id, label, fileNameTemplate };
    })
    .filter((row): row is HrWorkDriveDocFileSlot => row !== null);
  return normalized.length > 0
    ? normalized
    : defaults.map((slot) => ({ ...slot }));
}

function mergeDocSubfolders(
  partial: HrWorkDriveDocSubfolder[] | undefined,
  legacyFileNameTemplate?: string,
): HrWorkDriveDocSubfolder[] {
  if (!partial?.length) {
    return DEFAULT_HR_WORK_DRIVE_DOC_SUBFOLDERS.map((row) => ({
      ...row,
      fileSlots: row.fileSlots.map((slot) => ({ ...slot })),
    }));
  }
  const byKind = new Map(partial.map((row) => [row.kind, row]));
  return DEFAULT_HR_WORK_DRIVE_DOC_SUBFOLDERS.map((defaults) => {
    const override = byKind.get(defaults.kind);
    if (!override) {
      return {
        ...defaults,
        fileSlots: defaults.fileSlots.map((slot) => ({ ...slot })),
      };
    }
    const rawFolderName = String(
      override.folderName ?? defaults.folderName,
    ).trim();
    const folderName =
      defaults.kind === "medical_insurance" &&
      (!rawFolderName ||
        rawFolderName.toLowerCase() === "medical insurance")
        ? defaults.folderName
        : rawFolderName || defaults.folderName;
    const rawLabel = String(override.label ?? defaults.label).trim();
    const label =
      defaults.kind === "medical_insurance" &&
      (!rawLabel ||
        rawLabel.toLowerCase() === "medicalinsurance" ||
        rawLabel.toLowerCase() === "medical insurance")
        ? defaults.label
        : rawLabel || defaults.label;
    return {
      kind: defaults.kind,
      folderName,
      label,
      active:
        typeof override.active === "boolean" ? override.active : defaults.active,
      fileSlots: normalizeFileSlots(
        override.fileSlots,
        defaults.fileSlots,
        label,
        legacyFileNameTemplate,
      ),
    };
  });
}

function mergeExtraFolders(
  partial: HrWorkDriveExtraFolder[] | undefined,
): HrWorkDriveExtraFolder[] {
  if (!Array.isArray(partial)) return [];
  return partial
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const id = String(row.id ?? "").trim();
      const name = String(row.name ?? "").trim();
      const folderId = String(row.folderId ?? "").trim();
      if (!id && !name && !folderId) return null;
      const fileNameManagement = Boolean(row.fileNameManagement);
      const fileSlots = Array.isArray(row.fileSlots)
        ? row.fileSlots
            .map((slot, index) => {
              if (!slot || typeof slot !== "object") return null;
              const slotId = String(slot.id ?? "").trim() || `part_${index + 1}`;
              const label = String(slot.label ?? "").trim() || `File ${index + 1}`;
              const fileNameTemplate =
                String(slot.fileNameTemplate ?? "").trim() ||
                `{doc_name}_{first_name}_{last_name}_{doc_expiry}`;
              return { id: slotId, label, fileNameTemplate };
            })
            .filter((slot): slot is NonNullable<typeof slot> => slot !== null)
        : undefined;
      return {
        id: id || crypto.randomUUID(),
        name: name || "Folder",
        folderId,
        ...(fileNameManagement ? { fileNameManagement: true, fileSlots } : {}),
      };
    })
    .filter((row): row is HrWorkDriveExtraFolder => row !== null);
}

export function mergeWorkDriveSettings(
  partial: Partial<HrWorkDriveSettings> | null | undefined,
): HrWorkDriveSettings {
  const base = DEFAULT_HR_WORK_DRIVE_SETTINGS;
  const regionRaw = String(partial?.region ?? base.region);
  const region = REGIONS.has(regionRaw as ZohoWorkDriveRegion)
    ? (regionRaw as ZohoWorkDriveRegion)
    : base.region;

  let teamFolderName =
    String(partial?.teamFolderName ?? base.teamFolderName).trim() ||
    base.teamFolderName;
  let teamFolderId = String(partial?.teamFolderId ?? base.teamFolderId).trim();
  let hrFolderName =
    String(partial?.hrFolderName ?? base.hrFolderName).trim() ||
    base.hrFolderName;
  let hrFolderId = String(partial?.hrFolderId ?? base.hrFolderId).trim();

  // Legacy: team === HR — keep HR fields, promote team name to SS-OPS-HUB.
  if (
    teamFolderId &&
    hrFolderId &&
    teamFolderId === hrFolderId &&
    (!partial?.teamFolderName ||
      /human\s*resources/i.test(String(partial.teamFolderName)))
  ) {
    teamFolderName = base.teamFolderName;
    // Keep shared ID on HR; clear team ID so the user can set SS-OPS-HUB `/ws/…`.
    teamFolderId = "";
    if (/human\s*resources/i.test(hrFolderName) || hrFolderName === "HUMAN RESOURCES") {
      hrFolderName = base.hrFolderName;
    }
  }

  return {
    enabled: Boolean(partial?.enabled ?? base.enabled),
    region,
    clientId: String(partial?.clientId ?? base.clientId).trim(),
    clientSecretEncrypted:
      partial?.clientSecretEncrypted ?? base.clientSecretEncrypted,
    refreshTokenEncrypted:
      partial?.refreshTokenEncrypted ?? base.refreshTokenEncrypted,
    teamFolderName,
    teamFolderId,
    hrFolderName,
    hrFolderId,
    employeeDocsFolderId: String(
      partial?.employeeDocsFolderId ?? base.employeeDocsFolderId,
    ).trim(),
    employeeDocsFolderName:
      String(
        partial?.employeeDocsFolderName ?? base.employeeDocsFolderName,
      ).trim() || base.employeeDocsFolderName,
    extraFolders: mergeExtraFolders(partial?.extraFolders),
    employeeFolderTemplate:
      String(
        partial?.employeeFolderTemplate ?? base.employeeFolderTemplate,
      ).trim() || base.employeeFolderTemplate,
    fileNameTemplate:
      String(partial?.fileNameTemplate ?? base.fileNameTemplate).trim() ||
      base.fileNameTemplate,
    autoCreateFolders:
      typeof partial?.autoCreateFolders === "boolean"
        ? partial.autoCreateFolders
        : base.autoCreateFolders,
    docSubfolders: mergeDocSubfolders(
      partial?.docSubfolders,
      String(partial?.fileNameTemplate ?? base.fileNameTemplate).trim() ||
        base.fileNameTemplate,
    ),
    connectionStatus: partial?.connectionStatus ?? base.connectionStatus,
    lastVerifiedAt: partial?.lastVerifiedAt ?? base.lastVerifiedAt,
    lastError: partial?.lastError ?? base.lastError,
  };
}

function mergeFolder(
  partial: Partial<HrWorkDriveFolder> | null | undefined,
  defaults?: Partial<HrWorkDriveFolder>,
): Omit<HrWorkDriveFolder, "id" | "label" | "moduleKey"> {
  const merged = mergeWorkDriveSettings({
    teamFolderName: partial?.teamFolderName ?? defaults?.teamFolderName,
    teamFolderId: partial?.teamFolderId ?? defaults?.teamFolderId,
    hrFolderName: partial?.hrFolderName ?? defaults?.hrFolderName,
    hrFolderId: partial?.hrFolderId ?? defaults?.hrFolderId,
    employeeDocsFolderId:
      partial?.employeeDocsFolderId ?? defaults?.employeeDocsFolderId,
    employeeDocsFolderName:
      partial?.employeeDocsFolderName ?? defaults?.employeeDocsFolderName,
    extraFolders: partial?.extraFolders ?? defaults?.extraFolders,
    employeeFolderTemplate:
      partial?.employeeFolderTemplate ?? defaults?.employeeFolderTemplate,
    fileNameTemplate: partial?.fileNameTemplate ?? defaults?.fileNameTemplate,
    autoCreateFolders:
      typeof partial?.autoCreateFolders === "boolean"
        ? partial.autoCreateFolders
        : typeof defaults?.autoCreateFolders === "boolean"
          ? defaults.autoCreateFolders
          : undefined,
    docSubfolders: partial?.docSubfolders ?? defaults?.docSubfolders,
  });
  return {
    teamFolderName: merged.teamFolderName,
    teamFolderId: merged.teamFolderId,
    hrFolderName: merged.hrFolderName,
    hrFolderId: merged.hrFolderId,
    employeeDocsFolderId: merged.employeeDocsFolderId,
    employeeDocsFolderName: merged.employeeDocsFolderName,
    extraFolders: merged.extraFolders,
    employeeFolderTemplate: merged.employeeFolderTemplate,
    fileNameTemplate: merged.fileNameTemplate,
    autoCreateFolders: merged.autoCreateFolders,
    docSubfolders: merged.docSubfolders,
  };
}

function isStoreShape(value: unknown): value is {
  connections: unknown[];
  defaultConnectionId?: string | null;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { connections?: unknown }).connections)
  );
}

function isLegacyWorkDriveShape(
  value: unknown,
): value is Partial<HrWorkDriveSettings> {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    "clientId" in v ||
    "teamFolderId" in v ||
    "hrFolderId" in v ||
    "region" in v ||
    "enabled" in v
  );
}

export function folderFromFlatSettings(
  settings: HrWorkDriveSettings,
  overrides?: Partial<Pick<HrWorkDriveFolder, "id" | "label" | "moduleKey">>,
): HrWorkDriveFolder {
  return {
    id: overrides?.id ?? "hr",
    label: overrides?.label ?? "Human Resources",
    moduleKey: overrides?.moduleKey ?? "hr",
    teamFolderName: settings.teamFolderName,
    teamFolderId: settings.teamFolderId,
    hrFolderName: settings.hrFolderName,
    hrFolderId: settings.hrFolderId,
    employeeDocsFolderId: settings.employeeDocsFolderId,
    employeeDocsFolderName: settings.employeeDocsFolderName,
    extraFolders: settings.extraFolders,
    employeeFolderTemplate: settings.employeeFolderTemplate,
    fileNameTemplate: settings.fileNameTemplate,
    autoCreateFolders: settings.autoCreateFolders,
    docSubfolders: settings.docSubfolders,
  };
}

export function connectionFromFlatSettings(
  settings: HrWorkDriveSettings,
  overrides?: Partial<Pick<HrWorkDriveConnection, "id" | "label">>,
): HrWorkDriveConnection {
  return {
    id: overrides?.id ?? "zoho",
    label: overrides?.label ?? "ZOHO WorkDrive",
    enabled: settings.enabled,
    region: settings.region,
    clientId: settings.clientId,
    clientSecretEncrypted: settings.clientSecretEncrypted,
    refreshTokenEncrypted: settings.refreshTokenEncrypted,
    connectionStatus: settings.connectionStatus,
    lastVerifiedAt: settings.lastVerifiedAt,
    lastError: settings.lastError,
    folders: [folderFromFlatSettings(settings)],
  };
}

export function flattenWorkDrive(
  connection: HrWorkDriveConnection,
  folder: HrWorkDriveFolder,
): HrWorkDriveSettings {
  return mergeWorkDriveSettings({
    enabled: connection.enabled,
    region: connection.region,
    clientId: connection.clientId,
    clientSecretEncrypted: connection.clientSecretEncrypted,
    refreshTokenEncrypted: connection.refreshTokenEncrypted,
    connectionStatus: connection.connectionStatus,
    lastVerifiedAt: connection.lastVerifiedAt,
    lastError: connection.lastError,
    teamFolderName: folder.teamFolderName,
    teamFolderId: folder.teamFolderId,
    hrFolderName: folder.hrFolderName,
    hrFolderId: folder.hrFolderId,
    employeeDocsFolderId: folder.employeeDocsFolderId,
    employeeDocsFolderName: folder.employeeDocsFolderName,
    extraFolders: folder.extraFolders,
    employeeFolderTemplate: folder.employeeFolderTemplate,
    fileNameTemplate: folder.fileNameTemplate,
    autoCreateFolders: folder.autoCreateFolders,
    docSubfolders: folder.docSubfolders,
  });
}

function pickHrFolder(connection: HrWorkDriveConnection): HrWorkDriveFolder | null {
  return (
    connection.folders.find((f) => f.moduleKey === "hr") ??
    connection.folders[0] ??
    null
  );
}

function isAssetsModuleFolder(folder: HrWorkDriveFolder): boolean {
  const key = folder.moduleKey.trim().toLowerCase();
  if (key === "assets") return true;
  const label = folder.label.trim().toLowerCase();
  const hrName = folder.hrFolderName.trim().toLowerCase();
  if (label === "assets" || hrName === "assets") return true;
  return (folder.extraFolders ?? []).some(
    (row) => row.name.trim().toLowerCase() === "assets pictures",
  );
}

function pickAssetsFolder(
  connection: HrWorkDriveConnection,
): HrWorkDriveFolder | null {
  return connection.folders.find(isAssetsModuleFolder) ?? null;
}

export function pickAssetsFlatSettings(
  store: HrWorkDriveStore,
): HrWorkDriveSettings | null {
  if (store.connections.length === 0) return null;
  const connection =
    store.connections.find((c) => c.id === store.defaultConnectionId) ??
    store.connections[0];
  if (!connection) return null;
  const folder = pickAssetsFolder(connection);
  if (!folder) return null;
  return flattenWorkDrive(connection, folder);
}

export function pickDefaultFlatSettings(
  store: HrWorkDriveStore,
): HrWorkDriveSettings | null {
  if (store.connections.length === 0) return null;
  const connection =
    store.connections.find((c) => c.id === store.defaultConnectionId) ??
    store.connections[0];
  if (!connection) return null;
  const folder = pickHrFolder(connection);
  if (!folder) return null;
  return flattenWorkDrive(connection, folder);
}

/** Normalize raw DB JSON (legacy flat object or multi-connection store). */
export function normalizeWorkDriveStore(raw: unknown): HrWorkDriveStore {
  if (!raw || (typeof raw === "object" && Object.keys(raw as object).length === 0)) {
    return { connections: [], defaultConnectionId: null };
  }

  if (isStoreShape(raw)) {
    const connections: HrWorkDriveConnection[] = raw.connections
      .map((entry) => {
        if (typeof entry !== "object" || entry === null) return null;
        const row = entry as Partial<HrWorkDriveConnection>;
        const id = String(row.id ?? "").trim();
        if (!id) return null;

        const regionRaw = String(row.region ?? "com");
        const region = REGIONS.has(regionRaw as ZohoWorkDriveRegion)
          ? (regionRaw as ZohoWorkDriveRegion)
          : ("com" as ZohoWorkDriveRegion);

        const folders: HrWorkDriveFolder[] = Array.isArray(row.folders)
          ? row.folders
              .map((folderEntry) => {
                if (typeof folderEntry !== "object" || folderEntry === null) {
                  return null;
                }
                const f = folderEntry as Partial<HrWorkDriveFolder>;
                const folderId = String(f.id ?? "").trim();
                if (!folderId) return null;
                return {
                  id: folderId,
                  label:
                    String(f.label ?? "").trim() ||
                    String(f.teamFolderName ?? "").trim() ||
                    "Drive folder",
                  moduleKey: String(f.moduleKey ?? "").trim() || "custom",
                  ...mergeFolder(f),
                };
              })
              .filter((f): f is HrWorkDriveFolder => f !== null)
          : [];

        const connection: HrWorkDriveConnection = {
          id,
          label: String(row.label ?? "").trim() || "ZOHO WorkDrive",
          enabled: Boolean(row.enabled),
          region,
          clientId: String(row.clientId ?? "").trim(),
          clientSecretEncrypted: row.clientSecretEncrypted ?? null,
          refreshTokenEncrypted: row.refreshTokenEncrypted ?? null,
          connectionStatus: row.connectionStatus ?? "disconnected",
          lastVerifiedAt: row.lastVerifiedAt ?? null,
          lastError: row.lastError ?? null,
          folders,
        };
        return connection;
      })
      .filter((c): c is HrWorkDriveConnection => c !== null);

    const defaultConnectionId =
      (raw.defaultConnectionId &&
      connections.some((c) => c.id === raw.defaultConnectionId)
        ? raw.defaultConnectionId
        : connections[0]?.id) ?? null;

    return { connections, defaultConnectionId };
  }

  if (isLegacyWorkDriveShape(raw)) {
    const flat = mergeWorkDriveSettings(raw);
    const connection = connectionFromFlatSettings(flat);
    return {
      connections: [connection],
      defaultConnectionId: connection.id,
    };
  }

  return { connections: [], defaultConnectionId: null };
}

/**
 * Ensure UI always has at least one Zoho connection + HR folder tab.
 * Does not persist — caller persists on save.
 */
export function ensureWorkDriveStoreForUi(store: HrWorkDriveStore): HrWorkDriveStore {
  if (store.connections.length > 0) {
    return {
      ...store,
      connections: store.connections.map((c) =>
        c.folders.length > 0
          ? c
          : {
              ...c,
              folders: [
                folderFromFlatSettings(DEFAULT_HR_WORK_DRIVE_SETTINGS, {
                  id: "hr",
                  label: "Human Resources",
                  moduleKey: "hr",
                }),
              ],
            },
      ),
    };
  }

  const connection = connectionFromFlatSettings(
    mergeWorkDriveSettings({
      enabled: false,
      clientId: "",
      teamFolderId: "",
      hrFolderId: "",
      employeeDocsFolderId: "",
      connectionStatus: "disconnected",
    }),
  );
  // Blank IDs for a fresh venue — avoid seeding another venue's live IDs.
  connection.folders = [
    {
      ...folderFromFlatSettings(DEFAULT_HR_WORK_DRIVE_SETTINGS),
      teamFolderId: "",
      hrFolderId: "",
      employeeDocsFolderId: "",
    },
  ];

  return {
    connections: [connection],
    defaultConnectionId: connection.id,
  };
}

export function emptyWorkDriveFolder(
  overrides?: Partial<HrWorkDriveFolder>,
): HrWorkDriveFolder {
  const base = DEFAULT_HR_WORK_DRIVE_SETTINGS;
  return {
    id: overrides?.id ?? "",
    label: overrides?.label ?? "",
    moduleKey: overrides?.moduleKey ?? "custom",
    teamFolderName: overrides?.teamFolderName ?? base.teamFolderName,
    teamFolderId: overrides?.teamFolderId ?? "",
    hrFolderName:
      overrides?.hrFolderName ?? overrides?.label ?? base.hrFolderName,
    hrFolderId: overrides?.hrFolderId ?? "",
    employeeDocsFolderId: overrides?.employeeDocsFolderId ?? "",
    employeeDocsFolderName:
      overrides?.employeeDocsFolderName ?? base.employeeDocsFolderName,
    extraFolders: mergeExtraFolders(overrides?.extraFolders),
    employeeFolderTemplate:
      overrides?.employeeFolderTemplate ?? base.employeeFolderTemplate,
    fileNameTemplate:
      overrides?.fileNameTemplate ?? base.fileNameTemplate,
    autoCreateFolders:
      typeof overrides?.autoCreateFolders === "boolean"
        ? overrides.autoCreateFolders
        : true,
    docSubfolders: mergeDocSubfolders(
      overrides?.docSubfolders,
      overrides?.fileNameTemplate ?? base.fileNameTemplate,
    ),
  };
}

export function emptyWorkDriveConnection(
  overrides?: Partial<HrWorkDriveConnection>,
): HrWorkDriveConnection {
  return {
    id: overrides?.id ?? "",
    label: overrides?.label ?? "ZOHO WorkDrive",
    enabled: Boolean(overrides?.enabled),
    region: overrides?.region ?? "com",
    clientId: overrides?.clientId ?? "",
    clientSecretEncrypted: overrides?.clientSecretEncrypted ?? null,
    refreshTokenEncrypted: overrides?.refreshTokenEncrypted ?? null,
    connectionStatus: overrides?.connectionStatus ?? "disconnected",
    lastVerifiedAt: overrides?.lastVerifiedAt ?? null,
    lastError: overrides?.lastError ?? null,
    folders: overrides?.folders ?? [
      emptyWorkDriveFolder({
        id: "hr",
        label: "Human Resources",
        moduleKey: "hr",
      }),
    ],
  };
}

async function fetchWorkDriveRaw(
  supabase: SupabaseClient,
  venueId: string,
): Promise<unknown | null> {
  const { data, error } = await supabase
    .from("hr_venue_settings")
    .select("value")
    .eq("venue_id", venueId)
    .eq("key", HR_SETTINGS_KEYS.workDrive)
    .maybeSingle();
  if (error) {
    console.error("[workdrive] loadWorkDriveStore:", error.message);
    return null;
  }
  return data?.value ?? null;
}

export async function loadWorkDriveStore(
  supabase: SupabaseClient,
  venueId: string,
): Promise<HrWorkDriveStore> {
  const raw = await fetchWorkDriveRaw(supabase, venueId);
  return normalizeWorkDriveStore(raw);
}

export async function loadWorkDriveSettings(
  supabase: SupabaseClient,
  venueId: string,
): Promise<HrWorkDriveSettings> {
  const store = await loadWorkDriveStore(supabase, venueId);
  const flat =
    pickDefaultFlatSettings(store) ?? mergeWorkDriveSettings({});
  return applyWorkDriveEnvDefaults(flat);
}

/** WorkDrive settings for Assets / uniform piece photos (moduleKey `assets`). */
export async function loadAssetsWorkDriveSettings(
  supabase: SupabaseClient,
  venueId: string,
): Promise<HrWorkDriveSettings> {
  const store = await loadWorkDriveStore(supabase, venueId);
  const assetsFlat = pickAssetsFlatSettings(store);
  if (assetsFlat) {
    return applyAssetsWorkDriveEnvDefaults(
      applyWorkDriveEnvDefaults(assetsFlat),
    );
  }

  const hrFlat = pickDefaultFlatSettings(store) ?? mergeWorkDriveSettings({});
  const fallback = mergeWorkDriveSettings({
    ...hrFlat,
    hrFolderName: ZOHO_WD_VERIFIED.assetsFolderName,
    hrFolderId: "",
    employeeDocsFolderId: "",
    employeeDocsFolderName: "",
    extraFolders: [],
  });
  return applyAssetsWorkDriveEnvDefaults(applyWorkDriveEnvDefaults(fallback));
}

/** Accounts host for OAuth by Zoho DC. */
export function zohoAccountsHost(region: ZohoWorkDriveRegion): string {
  switch (region) {
    case "eu":
      return "accounts.zoho.eu";
    case "in":
      return "accounts.zoho.in";
    case "com.au":
      return "accounts.zoho.com.au";
    case "jp":
      return "accounts.zoho.jp";
    case "uk":
      return "accounts.zoho.uk";
    case "ca":
      return "accounts.zohocloud.ca";
    case "sa":
      return "accounts.zoho.sa";
    default:
      return "accounts.zoho.com";
  }
}

/** WorkDrive API host by Zoho DC — confirm against Claude prompt findings. */
export function zohoWorkDriveApiHost(region: ZohoWorkDriveRegion): string {
  switch (region) {
    case "eu":
      return "www.zohoapis.eu";
    case "in":
      return "www.zohoapis.in";
    case "com.au":
      return "www.zohoapis.com.au";
    case "jp":
      return "www.zohoapis.jp";
    case "uk":
      return "www.zohoapis.uk";
    case "ca":
      return "www.zohoapis.ca";
    case "sa":
      return "www.zohoapis.sa";
    default:
      return "www.zohoapis.com";
  }
}

/** Browser UI host for opening files/folders in a new tab (no OAuth needed). */
export function zohoWorkDriveWebHost(region: ZohoWorkDriveRegion): string {
  switch (region) {
    case "eu":
      return "workdrive.zoho.eu";
    case "in":
      return "workdrive.zoho.in";
    case "com.au":
      return "workdrive.zoho.com.au";
    case "jp":
      return "workdrive.zoho.jp";
    case "uk":
      return "workdrive.zoho.uk";
    case "ca":
      return "workdrive.zohocloud.ca";
    case "sa":
      return "workdrive.zoho.sa";
    default:
      return "workdrive.zoho.com";
  }
}

/** Deep link that opens a folder in the WorkDrive web app. */
export function workDriveFolderWebUrl(
  region: ZohoWorkDriveRegion,
  folderId: string,
): string {
  const id = folderId.trim();
  return `https://${zohoWorkDriveWebHost(region)}/folder/${encodeURIComponent(id)}`;
}
