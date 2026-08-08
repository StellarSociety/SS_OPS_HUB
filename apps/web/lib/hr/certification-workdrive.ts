import type {
  CertificationStaffField,
  HrWorkDriveDocKind,
} from "@/lib/hr/types";

export type CertificationWorkDriveTarget = {
  docKind: HrWorkDriveDocKind;
  /** Omit / `default` for OHC single-slot folder. */
  fileSlotId?: string;
};

/** Map staff certification date fields to WorkDrive doc kind + file slot. */
export function workDriveTargetForCertField(
  field: CertificationStaffField,
): CertificationWorkDriveTarget {
  switch (field) {
    case "ohc_date":
      return { docKind: "ohc" };
    case "pic_date":
      return { docKind: "training_certificates", fileSlotId: "pic" };
    case "basic_food_safety_date":
      return {
        docKind: "training_certificates",
        fileSlotId: "basic_food_safety",
      };
    case "fire_safety_date":
      return {
        docKind: "training_certificates",
        fileSlotId: "fire_safety",
      };
    case "first_aid_date":
      return {
        docKind: "training_certificates",
        fileSlotId: "first_aid",
      };
  }
}

/**
 * Legacy rows (before file_slot_id) can still be matched from rename templates
 * such as `_PIC_`, `_FoodSafety_`, …
 */
export function matchesCertificationFileSlot(
  fileName: string,
  fileSlotId: string | null | undefined,
  storedSlotId: string | null | undefined,
): boolean {
  const wanted = String(fileSlotId ?? "").trim();
  if (!wanted || wanted === "default") {
    return !storedSlotId || storedSlotId === "default";
  }
  if (storedSlotId && storedSlotId === wanted) return true;
  if (storedSlotId) return false;

  const name = fileName.toLowerCase();
  switch (wanted) {
    case "pic":
      return /_pic_/i.test(fileName) || name.includes("_pic_");
    case "basic_food_safety":
      return /_foodsafety_/i.test(fileName) || name.includes("foodsafety");
    case "fire_safety":
      return /_firesafety_/i.test(fileName) || name.includes("firesafety");
    case "first_aid":
      return /_firstaid_/i.test(fileName) || name.includes("firstaid");
    default:
      return false;
  }
}
