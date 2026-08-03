import "server-only";

import type { ZohoWorkDriveRegion } from "@/lib/hr/types";

/**
 * Live-verified WorkDrive folder IDs where known (Orilla, US `.com`).
 * Team root (SS-OPS-HUB) is separate from Human Resources — fill teamFolderId
 * from the `/ws/…` URL when available.
 */
export const ZOHO_WD_VERIFIED = {
  region: "com" as ZohoWorkDriveRegion,
  /** Rarely needed — Team ID from WorkDrive URL `/teams/…`. */
  teamId: "gcdaw6ac36b8a97be4387bfd0a3d3e13866d7",
  teamFolderName: "SS-OPS-HUB",
  /** Team Folder ID = segment after `/ws/` — set when known; not equal to HR. */
  teamFolderId: "",
  hrFolderName: "Human Resources",
  /** Human Resources folder under SS-OPS-HUB (`/folders/…`). */
  hrFolderId: "sae44cf1e2c4af89c4b2db0cbfcf01bcb006a",
  /**
   * Working parent for `{emp_no} — {full_name}` folders.
   * Swap this constant / env without changing upload logic.
   */
  employeeDocsFolderId: "vtvbm62a07bbd35f041bd996fea000998c43a",
  employeeDocsFolderName: "Employee Documents",
} as const;

export function zohoWorkDriveDownloadHost(region: ZohoWorkDriveRegion): string {
  switch (region) {
    case "eu":
      return "download.zoho.eu";
    case "in":
      return "download.zoho.in";
    case "com.au":
      return "download.zoho.com.au";
    case "jp":
      return "download.zoho.jp";
    case "uk":
      return "download.zoho.uk";
    case "ca":
      return "download.zohocloud.ca";
    case "sa":
      return "download.zoho.sa";
    default:
      return "download.zoho.com";
  }
}
