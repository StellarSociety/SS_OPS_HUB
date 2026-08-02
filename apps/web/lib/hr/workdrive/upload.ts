import "server-only";

import {
  createFolder,
  credentialsFromSettings,
  ensureAccessToken,
  findChildByName,
  renameFile,
  uploadFile,
  type WorkDriveFileRef,
} from "@/lib/hr/workdrive/client";
import { ZOHO_WD_VERIFIED } from "@/lib/hr/workdrive/constants";
import type {
  HrWorkDriveDocKind,
  HrWorkDriveSettings,
} from "@/lib/hr/types";

export type UploadStaffDocInput = {
  venueId: string;
  settings: HrWorkDriveSettings;
  empNo: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  docKind: HrWorkDriveDocKind;
  bytes: Buffer;
  originalFileName: string;
  contentType: string;
  /** Replace same-named file when true. Default false. */
  overrideNameExist?: boolean;
};

export type UploadStaffDocResult = {
  workdriveFileId: string;
  permalink: string;
  path: string;
  fileName: string;
  employeeFolderId: string;
  docFolderId: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dateTokens(d = new Date()) {
  const yyyy = String(d.getFullYear());
  const MM = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return {
    yyyy,
    MM,
    dd,
    "yyyy-MM-dd": `${yyyy}-${MM}-${dd}`,
  };
}

export function renderWorkDriveTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{([a-zA-Z0-9_-]+)\}/g, (_, key: string) => {
    return vars[key] ?? "";
  });
}

function extensionOf(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot);
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveOrCreateFolder(params: {
  apiDomain: string;
  accessToken: string;
  parentId: string;
  name: string;
  autoCreate: boolean;
}): Promise<WorkDriveFileRef> {
  const existing = await findChildByName(
    params.apiDomain,
    params.accessToken,
    params.parentId,
    params.name,
  );
  if (existing) return existing;
  if (!params.autoCreate) {
    throw new Error(
      `Folder "${params.name}" not found and auto-create is off.`,
    );
  }
  // Guard races: if create fails because name already exists, re-list.
  try {
    return await createFolder(
      params.apiDomain,
      params.accessToken,
      params.parentId,
      params.name,
    );
  } catch (error) {
    const again = await findChildByName(
      params.apiDomain,
      params.accessToken,
      params.parentId,
      params.name,
    );
    if (again) return again;
    throw error;
  }
}

/**
 * Upload a staff document into WorkDrive:
 * Employee Documents → `{emp_no} — {full_name}` → doc-type subfolder → file.
 */
export async function uploadStaffDocumentToWorkDrive(
  input: UploadStaffDocInput,
): Promise<UploadStaffDocResult> {
  const { settings } = input;
  if (!settings.enabled) {
    throw new Error("WorkDrive uploads are disabled in Drive Setup.");
  }

  const parentId =
    settings.employeeDocsFolderId ||
    ZOHO_WD_VERIFIED.employeeDocsFolderId;
  if (!parentId) {
    throw new Error("Employee Documents folder ID is not configured.");
  }

  const sub = settings.docSubfolders.find((row) => row.kind === input.docKind);
  if (!sub || !sub.active) {
    throw new Error(
      `Document type "${input.docKind}" is not enabled in Drive Setup.`,
    );
  }

  const credentials = credentialsFromSettings(settings);
  const { accessToken, apiDomain } = await ensureAccessToken(
    input.venueId,
    credentials,
  );

  const dates = dateTokens();
  const templateVars: Record<string, string> = {
    emp_no: input.empNo.trim(),
    full_name: input.fullName.trim(),
    first_name: (input.firstName ?? "").trim(),
    last_name: (input.lastName ?? "").trim(),
    doc_kind: input.docKind,
    doc_label: sub.label,
    original_name: input.originalFileName.replace(/\.[^.]+$/, ""),
    ...dates,
  };

  const empFolderName = sanitizeFileName(
    renderWorkDriveTemplate(settings.employeeFolderTemplate, templateVars),
  );
  if (!empFolderName) {
    throw new Error("Employee folder template resolved to an empty name.");
  }

  const empFolder = await resolveOrCreateFolder({
    apiDomain,
    accessToken,
    parentId,
    name: empFolderName,
    autoCreate: settings.autoCreateFolders,
  });

  const docFolder = await resolveOrCreateFolder({
    apiDomain,
    accessToken,
    parentId: empFolder.id,
    name: sub.folderName,
    autoCreate: settings.autoCreateFolders,
  });

  const ext = extensionOf(input.originalFileName) || guessExt(input.contentType);
  const stem = sanitizeFileName(
    renderWorkDriveTemplate(settings.fileNameTemplate, templateVars),
  );
  const fileName = sanitizeFileName(`${stem}${ext}`);

  let uploaded = await uploadFile({
    apiDomain,
    accessToken,
    parentId: docFolder.id,
    fileName,
    bytes: input.bytes,
    contentType: input.contentType || "application/octet-stream",
    overrideNameExist: input.overrideNameExist === true,
  });

  const storedName = uploaded.name || "";
  if (storedName && storedName !== fileName) {
    await renameFile(apiDomain, accessToken, uploaded.id, fileName);
    uploaded = { ...uploaded, name: fileName };
  } else if (!storedName) {
    // §G-1: filename multipart field may not stick — rename to be safe.
    try {
      await renameFile(apiDomain, accessToken, uploaded.id, fileName);
      uploaded = { ...uploaded, name: fileName };
    } catch {
      /* keep upload as-is */
    }
  }

  const path = [
    ZOHO_WD_VERIFIED.employeeDocsFolderName,
    empFolderName,
    sub.folderName,
    fileName,
  ].join("/");

  return {
    workdriveFileId: uploaded.id,
    permalink: uploaded.permalink,
    path,
    fileName,
    employeeFolderId: empFolder.id,
    docFolderId: docFolder.id,
  };
}

function guessExt(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes("pdf")) return ".pdf";
  if (ct.includes("png")) return ".png";
  if (ct.includes("webp")) return ".webp";
  if (ct.includes("jpeg") || ct.includes("jpg")) return ".jpg";
  return "";
}
