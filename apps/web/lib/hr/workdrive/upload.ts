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
import { ZOHO_WD_VERIFIED, ASSETS_WORKDRIVE } from "@/lib/hr/workdrive/constants";
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

/**
 * Fill an empty `[exp.- ]` / `[exp.-]` placeholder in a WorkDrive file name.
 * Returns null when no change is needed.
 */
export function injectDocExpiryIntoFileName(
  fileName: string,
  isoExpiry: string | null | undefined,
): string | null {
  const formatted = formatDocExpiryDdMmYy(isoExpiry);
  if (!formatted) return null;
  const next = fileName.replace(/\[exp\.\-\s*\]/gi, `[exp.- ${formatted}]`);
  return next !== fileName ? next : null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Older insurance/visa uploads wrongly appended `_<first 8 of record uuid>` to
 * the Drive Setup file name. Strip that suffix when present.
 */
export function stripLinkedRecordIdSuffixFromFileName(
  fileName: string,
  fileSlotId: string | null | undefined,
): string | null {
  const slot = String(fileSlotId ?? "").trim();
  if (!UUID_RE.test(slot)) return null;
  const prefix = slot.slice(0, 8);
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`_${escaped}(\\.[^.]+)$`, "i");
  if (!re.test(fileName)) return null;
  return fileName.replace(re, "$1");
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
    case "visa_noc":
      return "visa_expiry";
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
 * Employee Documents → `{emp_no} — {full_name}` → [doc-type subfolder] → file.
 *
 * Profile photos skip the doc-type subfolder and land directly in the
 * employee folder as `{emp_no} - {full_name}.ext`.
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

  const atEmployeeRoot = input.docKind === "profile_photo";

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
  // Insurance / visa uploads pass the HR record UUID as fileSlotId so the
  // document can be linked. That id is not a Drive Setup slot — keep it for
  // persistence, but name the file from the configured template (never append
  // the UUID).
  const configuredSlot =
    (input.fileSlotId
      ? slots.find((row) => row.id === input.fileSlotId)
      : undefined) ?? slots[0];
  const linkRecordAsSlot =
    !configuredSlot ||
    !input.fileSlotId ||
    configuredSlot.id === input.fileSlotId
      ? null
      : input.docKind === "medical_insurance" ||
          input.docKind === "eresidence_card" ||
          input.docKind === "visa_noc"
        ? input.fileSlotId
        : null;
  const defaultNamingTemplate =
    configuredSlot?.fileNameTemplate.trim() ||
    settings.fileNameTemplate.trim() ||
    `{doc_name}_{first_name}_{last_name}_{doc_expiry}`;
  const slot = linkRecordAsSlot
    ? {
        id: linkRecordAsSlot,
        label:
          configuredSlot?.label ??
          (input.docKind === "visa_noc"
            ? "Visa NOC"
            : input.docKind === "eresidence_card"
              ? "Residency card"
              : "Insurance card"),
        fileNameTemplate: defaultNamingTemplate,
      }
    : configuredSlot;
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

  const uploadParentId = atEmployeeRoot
    ? empFolder.id
    : (
        await resolveOrCreateFolder({
          apiDomain,
          accessToken,
          parentId: empFolder.id,
          name: sub.folderName,
          autoCreate: settings.autoCreateFolders,
        })
      ).id;

  const ext = extensionOf(input.originalFileName) || guessExt(input.contentType);
  const namingTemplate = atEmployeeRoot
    ? "{emp_no} - {full_name}"
    : slot.fileNameTemplate.trim() ||
      settings.fileNameTemplate.trim() ||
      "{doc_label}_{emp_no}_{yyyy-MM-dd}";
  const stem = sanitizeFileName(
    renderWorkDriveTemplate(namingTemplate, templateVars),
  );
  const fileName = sanitizeFileName(`${stem}${ext}`);

  let uploaded = await uploadFile({
    apiDomain,
    accessToken,
    parentId: uploadParentId,
    fileName,
    bytes: input.bytes,
    contentType: input.contentType || "application/octet-stream",
    overrideNameExist:
      input.overrideNameExist === true || atEmployeeRoot,
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
    ...(atEmployeeRoot ? [] : [sub.folderName]),
    fileName,
  ].join("/");

  return {
    workdriveFileId: uploaded.id,
    permalink: uploaded.permalink,
    path,
    fileName,
    employeeFolderId: empFolder.id,
    docFolderId: uploadParentId,
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

export function uniformPieceWorkDriveDownloadPath(fileId: string): string {
  return `/api/hr/workdrive/download/${encodeURIComponent(fileId)}`;
}

async function resolveAssetsPicturesFolder(params: {
  apiDomain: string;
  accessToken: string;
  settings: HrWorkDriveSettings;
}): Promise<WorkDriveFileRef> {
  const picturesName = ASSETS_WORKDRIVE.picturesFolderName;
  const moduleName = ASSETS_WORKDRIVE.moduleFolderName;

  const configured = (params.settings.extraFolders ?? []).find(
    (row) =>
      row.name.trim().toLowerCase() === picturesName.toLowerCase() &&
      row.folderId.trim(),
  );
  if (configured?.folderId) {
    return {
      id: configured.folderId,
      name: picturesName,
      permalink: "",
      isFolder: true,
    };
  }

  let assetsFolderId = "";
  if (
    params.settings.hrFolderName.trim().toLowerCase() ===
    moduleName.toLowerCase()
  ) {
    assetsFolderId = params.settings.hrFolderId.trim();
  }
  if (!assetsFolderId) {
    assetsFolderId =
      process.env.ZOHO_WD_ASSETS_FOLDER_ID?.trim() ||
      ZOHO_WD_VERIFIED.assetsFolderId.trim();
  }

  let assetsFolder: WorkDriveFileRef;
  if (assetsFolderId) {
    assetsFolder = {
      id: assetsFolderId,
      name: moduleName,
      permalink: "",
      isFolder: true,
    };
  } else {
    const teamId =
      params.settings.teamFolderId.trim() || ZOHO_WD_VERIFIED.teamFolderId;
    if (!teamId) {
      throw new Error(
        "WorkDrive Assets folder is not configured. Add an Assets module under Drive config or set ZOHO_WD_ASSETS_FOLDER_ID.",
      );
    }
    assetsFolder = await resolveOrCreateFolder({
      apiDomain: params.apiDomain,
      accessToken: params.accessToken,
      parentId: teamId,
      name: moduleName,
      autoCreate: params.settings.autoCreateFolders,
    });
  }

  return resolveOrCreateFolder({
    apiDomain: params.apiDomain,
    accessToken: params.accessToken,
    parentId: assetsFolder.id,
    name: picturesName,
    autoCreate: params.settings.autoCreateFolders,
  });
}

export type UploadUniformPieceImageResult = {
  workdriveFileId: string;
  permalink: string;
  path: string;
  fileName: string;
};

/** Upload a uniform piece photo to SS-OPS-HUB → Assets → Assets Pictures. */
export async function uploadUniformPieceImageToWorkDrive(input: {
  venueId: string;
  settings: HrWorkDriveSettings;
  pieceId: string;
  pieceName: string;
  bytes: Buffer;
  contentType: string;
  overrideNameExist?: boolean;
}): Promise<UploadUniformPieceImageResult> {
  const credentials = credentialsFromSettings(input.settings);
  const { accessToken, apiDomain } = await ensureAccessToken(
    input.venueId,
    credentials,
  );

  const picturesFolder = await resolveAssetsPicturesFolder({
    apiDomain,
    accessToken,
    settings: input.settings,
  });

  const stem = sanitizeFileName(
    `${input.pieceName.trim() || "uniform-piece"}_${input.pieceId.slice(0, 8)}`,
  );
  const ext = guessExt(input.contentType) || ".webp";
  const fileName = sanitizeFileName(`${stem}${ext}`);

  let uploaded = await uploadFile({
    apiDomain,
    accessToken,
    parentId: picturesFolder.id,
    fileName,
    bytes: input.bytes,
    contentType: input.contentType || "image/webp",
    overrideNameExist: input.overrideNameExist === true,
  });

  const storedName = uploaded.name || "";
  if (storedName && storedName !== fileName) {
    await renameFile(apiDomain, accessToken, uploaded.id, fileName);
    uploaded = { ...uploaded, name: fileName };
  } else if (!storedName) {
    try {
      await renameFile(apiDomain, accessToken, uploaded.id, fileName);
      uploaded = { ...uploaded, name: fileName };
    } catch {
      /* keep upload as-is */
    }
  }

  const path = [
    input.settings.teamFolderName || ZOHO_WD_VERIFIED.teamFolderName,
    ASSETS_WORKDRIVE.moduleFolderName,
    ASSETS_WORKDRIVE.picturesFolderName,
    fileName,
  ].join("/");

  return {
    workdriveFileId: uploaded.id,
    permalink: uploaded.permalink,
    path,
    fileName,
  };
}
