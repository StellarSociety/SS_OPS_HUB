import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getHrVenueSetting } from "@/lib/hr/store";
import { applyWorkDriveEnvDefaults } from "@/lib/hr/workdrive/env";
import {
  DEFAULT_HR_WORK_DRIVE_DOC_SUBFOLDERS,
  DEFAULT_HR_WORK_DRIVE_SETTINGS,
  HR_SETTINGS_KEYS,
  type HrWorkDriveDocSubfolder,
  type HrWorkDriveSettings,
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

function mergeDocSubfolders(
  partial: HrWorkDriveDocSubfolder[] | undefined,
): HrWorkDriveDocSubfolder[] {
  if (!partial?.length) {
    return DEFAULT_HR_WORK_DRIVE_DOC_SUBFOLDERS.map((row) => ({ ...row }));
  }
  const byKind = new Map(partial.map((row) => [row.kind, row]));
  return DEFAULT_HR_WORK_DRIVE_DOC_SUBFOLDERS.map((defaults) => {
    const override = byKind.get(defaults.kind);
    if (!override) return { ...defaults };
    return {
      kind: defaults.kind,
      folderName: String(override.folderName ?? defaults.folderName).trim() ||
        defaults.folderName,
      label: String(override.label ?? defaults.label).trim() || defaults.label,
      active:
        typeof override.active === "boolean" ? override.active : defaults.active,
    };
  });
}

export function mergeWorkDriveSettings(
  partial: Partial<HrWorkDriveSettings> | null | undefined,
): HrWorkDriveSettings {
  const base = DEFAULT_HR_WORK_DRIVE_SETTINGS;
  const regionRaw = String(partial?.region ?? base.region);
  const region = REGIONS.has(regionRaw as ZohoWorkDriveRegion)
    ? (regionRaw as ZohoWorkDriveRegion)
    : base.region;

  return {
    enabled: Boolean(partial?.enabled ?? base.enabled),
    region,
    clientId: String(partial?.clientId ?? base.clientId).trim(),
    clientSecretEncrypted:
      partial?.clientSecretEncrypted ?? base.clientSecretEncrypted,
    refreshTokenEncrypted:
      partial?.refreshTokenEncrypted ?? base.refreshTokenEncrypted,
    teamFolderName:
      String(partial?.teamFolderName ?? base.teamFolderName).trim() ||
      base.teamFolderName,
    teamFolderId: String(partial?.teamFolderId ?? base.teamFolderId).trim(),
    hrFolderName:
      String(partial?.hrFolderName ?? base.hrFolderName).trim() ||
      base.hrFolderName,
    hrFolderId: String(partial?.hrFolderId ?? base.hrFolderId).trim(),
    employeeDocsFolderId: String(
      partial?.employeeDocsFolderId ?? base.employeeDocsFolderId,
    ).trim(),
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
    docSubfolders: mergeDocSubfolders(partial?.docSubfolders),
    connectionStatus: partial?.connectionStatus ?? base.connectionStatus,
    lastVerifiedAt: partial?.lastVerifiedAt ?? base.lastVerifiedAt,
    lastError: partial?.lastError ?? base.lastError,
  };
}

export async function loadWorkDriveSettings(
  supabase: SupabaseClient,
  venueId: string,
): Promise<HrWorkDriveSettings> {
  const stored = await getHrVenueSetting<Partial<HrWorkDriveSettings>>(
    supabase,
    venueId,
    HR_SETTINGS_KEYS.workDrive,
    {},
  );
  return applyWorkDriveEnvDefaults(mergeWorkDriveSettings(stored));
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
