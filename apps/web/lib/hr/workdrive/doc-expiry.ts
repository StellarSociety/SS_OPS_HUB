import type { HrWorkDriveDocKind } from "@/lib/hr/types";

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
    case "visa_cancelation":
      return "visa_expiry";
    case "ohc":
      return "ohc_date";
    default:
      return null;
  }
}
