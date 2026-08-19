import {
  DEFAULT_HR_WORK_DRIVE_DOC_SUBFOLDERS,
  type HrEmailStaffDocumentKey,
  type HrWorkDriveDocKind,
  type HrWorkDriveDocSubfolder,
} from "@/lib/hr/types";

export type { HrEmailStaffDocumentKey };

export type HrEmailStaffDocumentOption = {
  key: HrEmailStaffDocumentKey;
  label: string;
  kind: HrWorkDriveDocKind;
  /** Slot within the kind; null = default/latest for single-slot kinds. */
  slotId: string | null;
};

const DOC_KINDS = new Set<string>(
  DEFAULT_HR_WORK_DRIVE_DOC_SUBFOLDERS.map((row) => row.kind),
);

/** Stable keys + labels for built-in Drive Setup file parts. */
const KNOWN_EMAIL_DOC: Record<
  string,
  { key: HrEmailStaffDocumentKey; label: string }
> = {
  "profile_photo:default": { key: "profile_photo", label: "Profile photo" },
  "passport:default": { key: "passport", label: "Passport" },
  "emirates_id:front": {
    key: "emirates_id_front",
    label: "Emirates ID (front)",
  },
  "emirates_id:back": { key: "emirates_id_back", label: "Emirates ID (back)" },
  "bank:default": { key: "bank", label: "Bank details" },
  "offer_letter:default": { key: "offer_letter", label: "Offer letter" },
  "contract:default": { key: "contract", label: "Labour contract" },
  "addendums:default": { key: "addendums", label: "Addendums" },
  "eresidence_card:default": {
    key: "eresidence_card",
    label: "eResidence card",
  },
  "ohc:default": { key: "ohc", label: "OHC" },
  "medical_insurance:default": {
    key: "medical_insurance",
    label: "Medical insurance",
  },
  "training_certificates:pic": {
    key: "training_pic",
    label: "Training — PIC",
  },
  "training_certificates:basic_food_safety": {
    key: "training_basic_food_safety",
    label: "Training — Food safety",
  },
  "training_certificates:fire_safety": {
    key: "training_fire_safety",
    label: "Training — Fire safety",
  },
  "training_certificates:first_aid": {
    key: "training_first_aid",
    label: "Training — First aid",
  },
  "visa_noc:default": { key: "visa_noc", label: "Visa NOC" },
  "visa_cancelation:default": {
    key: "visa_cancelation",
    label: "Visa cancelation",
  },
  "others:default": { key: "others", label: "Others" },
};

function normalizeSlotId(slotId: string | null | undefined): string {
  const slot = String(slotId ?? "").trim();
  return slot || "default";
}

function optionFromFolderSlot(
  folder: HrWorkDriveDocSubfolder,
  slotIdRaw: string,
  slotLabel: string,
  multiSlot: boolean,
): HrEmailStaffDocumentOption {
  const slotId = normalizeSlotId(slotIdRaw);
  const known = KNOWN_EMAIL_DOC[`${folder.kind}:${slotId}`];
  if (known) {
    return {
      key: known.key,
      label: known.label,
      kind: folder.kind,
      slotId: slotId === "default" ? null : slotId,
    };
  }
  const folderName = folder.folderName.trim() || folder.label.trim() || folder.kind;
  const partLabel = slotLabel.trim() || "File";
  return {
    key: `${folder.kind}:${slotId}` as HrEmailStaffDocumentKey,
    label: multiSlot ? `${folderName} (${partLabel})` : folderName,
    kind: folder.kind,
    slotId: slotId === "default" ? null : slotId,
  };
}

/** One picker row per Drive Setup file part (built-in + any extra slots). */
export function emailStaffDocumentOptionsFromSubfolders(
  subfolders: readonly HrWorkDriveDocSubfolder[],
): HrEmailStaffDocumentOption[] {
  const out: HrEmailStaffDocumentOption[] = [];
  const seen = new Set<string>();
  for (const folder of subfolders) {
    const slots =
      folder.fileSlots && folder.fileSlots.length > 0
        ? folder.fileSlots
        : [{ id: "default", label: "File", fileNameTemplate: "" }];
    const multiSlot = slots.length > 1;
    for (const slot of slots) {
      const option = optionFromFolderSlot(
        folder,
        slot.id,
        slot.label,
        multiSlot,
      );
      if (seen.has(option.key)) continue;
      seen.add(option.key);
      out.push(option);
    }
  }
  return out;
}

export const HR_EMAIL_STAFF_DOCUMENT_OPTIONS: readonly HrEmailStaffDocumentOption[] =
  emailStaffDocumentOptionsFromSubfolders(DEFAULT_HR_WORK_DRIVE_DOC_SUBFOLDERS);

const OPTION_BY_KEY = new Map(
  HR_EMAIL_STAFF_DOCUMENT_OPTIONS.map((o) => [o.key, o]),
);

export const DEFAULT_IDENTITY_EMAIL_ATTACH_DOCUMENTS: HrEmailStaffDocumentKey[] =
  ["passport", "emirates_id_front", "emirates_id_back"];

function parseDynamicEmailStaffDocumentKey(
  value: string,
): HrEmailStaffDocumentOption | undefined {
  const idx = value.indexOf(":");
  if (idx <= 0) return undefined;
  const kind = value.slice(0, idx).trim();
  const slotId = value.slice(idx + 1).trim();
  if (!DOC_KINDS.has(kind) || !slotId) return undefined;
  const folder = DEFAULT_HR_WORK_DRIVE_DOC_SUBFOLDERS.find(
    (row) => row.kind === kind,
  );
  if (!folder) return undefined;
  return optionFromFolderSlot(folder, slotId, slotId.replace(/_/g, " "), true);
}

export function isHrEmailStaffDocumentKey(
  value: string,
): value is HrEmailStaffDocumentKey {
  if (OPTION_BY_KEY.has(value as HrEmailStaffDocumentKey)) return true;
  return parseDynamicEmailStaffDocumentKey(value) != null;
}

export function normalizeEmailStaffDocumentKeys(
  raw: unknown,
  fallback: readonly HrEmailStaffDocumentKey[],
): HrEmailStaffDocumentKey[] {
  if (!Array.isArray(raw)) return [...fallback];
  const seen = new Set<HrEmailStaffDocumentKey>();
  const out: HrEmailStaffDocumentKey[] = [];
  for (const item of raw) {
    const key = String(item ?? "").trim();
    if (!isHrEmailStaffDocumentKey(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function parseEmailStaffDocumentKeysFromForm(
  formData: FormData,
  fieldName: string,
  fallback: readonly HrEmailStaffDocumentKey[],
): HrEmailStaffDocumentKey[] {
  const raw = formData.getAll(fieldName).map((v) => String(v));
  // Marker means the picker was rendered; empty = intentionally none.
  if (raw.length === 0 && !formData.has(`${fieldName}_present`)) {
    return [...fallback];
  }
  return normalizeEmailStaffDocumentKeys(raw, []);
}

export function emailStaffDocumentOption(
  key: HrEmailStaffDocumentKey,
): HrEmailStaffDocumentOption | undefined {
  return OPTION_BY_KEY.get(key) ?? parseDynamicEmailStaffDocumentKey(key);
}

export function labelForEmailStaffDocumentKey(
  key: HrEmailStaffDocumentKey,
): string {
  return emailStaffDocumentOption(key)?.label ?? key;
}
