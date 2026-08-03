import "server-only";

import { encryptSecret } from "@/lib/email/secret";
import { ZOHO_WD_VERIFIED } from "@/lib/hr/workdrive/constants";
import type {
  HrWorkDriveSettings,
  ZohoWorkDriveRegion,
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

function env(name: string): string {
  return String(process.env[name] ?? "").trim();
}

/**
 * Read server-only ZOHO_WD_* credentials. Never expose via NEXT_PUBLIC_*.
 */
export function readWorkDriveEnvCredentials(): {
  region?: ZohoWorkDriveRegion;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  teamFolderId?: string;
  hrFolderId?: string;
  employeeDocsFolderId?: string;
} {
  const regionRaw = env("ZOHO_WD_REGION");
  const region = REGIONS.has(regionRaw as ZohoWorkDriveRegion)
    ? (regionRaw as ZohoWorkDriveRegion)
    : undefined;

  return {
    region,
    clientId: env("ZOHO_WD_CLIENT_ID") || undefined,
    clientSecret: env("ZOHO_WD_CLIENT_SECRET") || undefined,
    refreshToken: env("ZOHO_WD_REFRESH_TOKEN") || undefined,
    teamFolderId: env("ZOHO_WD_TEAM_FOLDER_ID") || undefined,
    hrFolderId: env("ZOHO_WD_HR_FOLDER_ID") || undefined,
    employeeDocsFolderId: env("ZOHO_WD_EMPLOYEE_DOCS_FOLDER_ID") || undefined,
  };
}

/**
 * Fill empty settings fields from env + verified live folder IDs.
 * Does not overwrite non-empty DB values. Secrets from env are encrypted
 * into the returned object only when the DB has none (for in-memory use /
 * seed — not written unless caller persists).
 */
export function applyWorkDriveEnvDefaults(
  settings: HrWorkDriveSettings,
): HrWorkDriveSettings {
  const e = readWorkDriveEnvCredentials();
  const next: HrWorkDriveSettings = { ...settings };

  if (e.region) next.region = e.region;

  if (!next.clientId && e.clientId) next.clientId = e.clientId;

  if (!next.clientSecretEncrypted && e.clientSecret) {
    next.clientSecretEncrypted = encryptSecret(e.clientSecret);
  }
  if (!next.refreshTokenEncrypted && e.refreshToken) {
    next.refreshTokenEncrypted = encryptSecret(e.refreshToken);
  }

  if (!next.teamFolderId) {
    next.teamFolderId =
      e.teamFolderId || ZOHO_WD_VERIFIED.teamFolderId;
  }
  if (!next.hrFolderId) {
    next.hrFolderId = e.hrFolderId || ZOHO_WD_VERIFIED.hrFolderId;
  }
  if (!next.employeeDocsFolderId) {
    next.employeeDocsFolderId =
      e.employeeDocsFolderId || ZOHO_WD_VERIFIED.employeeDocsFolderId;
  }

  if (!next.teamFolderName) {
    next.teamFolderName = ZOHO_WD_VERIFIED.teamFolderName;
  }
  if (!next.hrFolderName) {
    next.hrFolderName = ZOHO_WD_VERIFIED.hrFolderName;
  }
  if (!next.employeeDocsFolderName) {
    next.employeeDocsFolderName = ZOHO_WD_VERIFIED.employeeDocsFolderName;
  }
  if (!Array.isArray(next.extraFolders)) {
    next.extraFolders = [];
  }

  return next;
}

/** Plaintext secret resolution: DB encrypted value wins; else env. */
export function resolveWorkDrivePlainSecrets(settings: HrWorkDriveSettings): {
  clientSecret: string | null;
  refreshToken: string | null;
  fromEnv: { clientSecret: boolean; refreshToken: boolean };
} {
  const e = readWorkDriveEnvCredentials();
  return {
    clientSecret: settings.clientSecretEncrypted
      ? null // caller decrypts
      : e.clientSecret ?? null,
    refreshToken: settings.refreshTokenEncrypted
      ? null
      : e.refreshToken ?? null,
    fromEnv: {
      clientSecret: !settings.clientSecretEncrypted && Boolean(e.clientSecret),
      refreshToken:
        !settings.refreshTokenEncrypted && Boolean(e.refreshToken),
    },
  };
}
