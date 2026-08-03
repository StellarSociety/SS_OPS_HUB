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
  HrWorkDriveDocFileSlot,
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
  /** Optional file part within the doc kind (e.g. emirates_id "front"). */
  fileSlotId?: string;
  /**
   * Document expiry as ISO `YYYY-MM-DD` (or similar). Used for `{doc_expiry}`
   * as `dd-mm-yy` in the file name.
   */
  docExpiry?: string | null;
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

/** Format ISO / YYYY-MM-DD as dd-mm-yy for file names (safe chars). */
export function formatDocExpiryDdMmYy(
  iso: string | null | undefined,
): string {
  const raw = String(iso ?? "").trim();
  if (!raw) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (m) {
    return `${m[3]}-${m[2]}-${m[1].slice(-2)}`;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${String(
    d.getFullYear(),
  ).slice(-2)}`;
}

/** Staff date field used for `{doc_expiry}` for a doc kind / file part. */
export type HrWorkDriveDocExpiryField =
  | "passport_expiry"
  | "eid_expiry"
  | "visa_expiry"
  | "contract_expiry"
  | "eresidence_expiry"
  | "medical_insurance_expiry_date"
  | "ohc_date"
  | "pic_date"
  | "basic_food_safety_date"
  | "fire_safety_date"
  | "first_aid_date";

/** Expiry field on staff for a given WorkDrive document kind / file part. */
export function docExpiryFieldForKind(
  kind: HrWorkDriveDocKind,
  fileSlotId?: string | null,
): HrWorkDriveDocExpiryField | null {
  if (kind === "training_certificates") {
    switch (String(fileSlotId ?? "").trim()) {
      case "pic":
        return "pic_date";
      case "basic_food_safety":
        return "basic_food_safety_date";
      case "fire_safety":
        return "fire_safety_date";
      case "first_aid":
        return "first_aid_date";
      default:
        return "pic_date";
    }
  }

  switch (kind) {
    case "passport":
      return "passport_expiry";
    case "emirates_id":
      return "eid_expiry";
    case "contract":
      return "contract_expiry";
    case "eresidence_card":
      return "eresidence_expiry";
    case "medical_insurance":
      return "medical_insurance_expiry_date";
    case "ohc":
      return "ohc_date";
    default:
      return null;
  }
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

  const slots: HrWorkDriveDocFileSlot[] =
    sub.fileSlots?.length > 0
      ? sub.fileSlots
      : [
          {
            id: "default",
            label: "File",
            fileNameTemplate: settings.fileNameTemplate,
          },
        ];
  const slot =
    (input.fileSlotId
      ? slots.find((row) => row.id === input.fileSlotId)
      : undefined) ?? slots[0];
  if (!slot) {
    throw new Error(
      `File part "${input.fileSlotId ?? "default"}" is not configured for "${input.docKind}".`,
    );
  }

  const credentials = credentialsFromSettings(settings);
  const { accessToken, apiDomain } = await ensureAccessToken(
    input.venueId,
    credentials,
  );

  const dates = dateTokens();
  const firstName = (input.firstName ?? "").trim();
  const lastName = (input.lastName ?? "").trim();
  const docName = sub.folderName.trim() || sub.label.trim() || input.docKind;
  const docExpiry = formatDocExpiryDdMmYy(input.docExpiry);
  const templateVars: Record<string, string> = {
    emp_no: input.empNo.trim(),
    full_name: input.fullName.trim(),
    first_name: firstName,
    last_name: lastName,
    employee_first_name: firstName,
    employee_last_name: lastName,
    doc_kind: input.docKind,
    doc_label: sub.label,
    doc_name: docName,
    document_name: docName,
    slot_id: slot.id,
    slot_label: slot.label,
    doc_expiry: docExpiry,
    doc_expiry_ddmmyy: docExpiry,
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
  const namingTemplate =
    slot.fileNameTemplate.trim() ||
    settings.fileNameTemplate.trim() ||
    "{doc_label}_{emp_no}_{yyyy-MM-dd}";
  const stem = sanitizeFileName(
    renderWorkDriveTemplate(namingTemplate, templateVars),
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
    settings.teamFolderName || ZOHO_WD_VERIFIED.teamFolderName,
    settings.hrFolderName || ZOHO_WD_VERIFIED.hrFolderName,
    settings.employeeDocsFolderName || ZOHO_WD_VERIFIED.employeeDocsFolderName,
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
