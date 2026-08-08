import type { HrEmailStaffDocumentKey, HrWorkDriveDocKind } from "@/lib/hr/types";

export type { HrEmailStaffDocumentKey };

export type HrEmailStaffDocumentOption = {
  key: HrEmailStaffDocumentKey;
  label: string;
  kind: HrWorkDriveDocKind;
  /** Slot within the kind; null = default/latest for single-slot kinds. */
  slotId: string | null;
};

export const HR_EMAIL_STAFF_DOCUMENT_OPTIONS: readonly HrEmailStaffDocumentOption[] =
  [
    {
      key: "passport",
      label: "Passport",
      kind: "passport",
      slotId: null,
    },
    {
      key: "emirates_id_front",
      label: "Emirates ID (front)",
      kind: "emirates_id",
      slotId: "front",
    },
    {
      key: "emirates_id_back",
      label: "Emirates ID (back)",
      kind: "emirates_id",
      slotId: "back",
    },
    {
      key: "eresidence_card",
      label: "eResidence card",
      kind: "eresidence_card",
      slotId: null,
    },
    {
      key: "medical_insurance",
      label: "Medical insurance",
      kind: "medical_insurance",
      slotId: null,
    },
    {
      key: "ohc",
      label: "OHC",
      kind: "ohc",
      slotId: null,
    },
    {
      key: "bank",
      label: "Bank details",
      kind: "bank",
      slotId: null,
    },
    {
      key: "offer_letter",
      label: "Offer letter",
      kind: "offer_letter",
      slotId: null,
    },
    {
      key: "contract",
      label: "Labour contract",
      kind: "contract",
      slotId: null,
    },
    {
      key: "addendums",
      label: "Addendums",
      kind: "addendums",
      slotId: null,
    },
    {
      key: "training_pic",
      label: "Training — PIC",
      kind: "training_certificates",
      slotId: "pic",
    },
    {
      key: "training_basic_food_safety",
      label: "Training — Food safety",
      kind: "training_certificates",
      slotId: "basic_food_safety",
    },
    {
      key: "training_fire_safety",
      label: "Training — Fire safety",
      kind: "training_certificates",
      slotId: "fire_safety",
    },
    {
      key: "training_first_aid",
      label: "Training — First aid",
      kind: "training_certificates",
      slotId: "first_aid",
    },
  ] as const;

const OPTION_BY_KEY = new Map(
  HR_EMAIL_STAFF_DOCUMENT_OPTIONS.map((o) => [o.key, o]),
);

export const DEFAULT_IDENTITY_EMAIL_ATTACH_DOCUMENTS: HrEmailStaffDocumentKey[] =
  ["passport", "emirates_id_front", "emirates_id_back"];

export function isHrEmailStaffDocumentKey(
  value: string,
): value is HrEmailStaffDocumentKey {
  return OPTION_BY_KEY.has(value as HrEmailStaffDocumentKey);
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
  return OPTION_BY_KEY.get(key);
}

export function labelForEmailStaffDocumentKey(
  key: HrEmailStaffDocumentKey,
): string {
  return OPTION_BY_KEY.get(key)?.label ?? key;
}
