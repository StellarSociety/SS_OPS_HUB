import {
  hasPermission,
  isAppAdmin,
  type AccessLevel,
  type UserPermission,
} from "@/lib/role-permissions";
import { HR_FEATURES, HR_MODULE_KEY } from "./types";

export function hasHrPermission(
  permissions: UserPermission[],
  featureKey: string,
  minLevel: AccessLevel = "view",
  venueId?: string | null,
): boolean {
  if (isAppAdmin(permissions)) return true;

  if (venueId) {
    const venueScoped = permissions.some((p) => {
      if (p.module_key !== HR_MODULE_KEY || p.feature_key !== featureKey) {
        return false;
      }
      if (p.venue_id !== null && p.venue_id !== venueId) return false;
      return hasPermission([p], HR_MODULE_KEY, featureKey, minLevel);
    });
    if (venueScoped) return true;
  }

  return permissions.some(
    (p) =>
      p.module_key === HR_MODULE_KEY &&
      p.feature_key === featureKey &&
      p.venue_id === null &&
      hasPermission([p], HR_MODULE_KEY, featureKey, minLevel),
  );
}

export function canViewStaff(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasHrPermission(permissions, HR_FEATURES.staff, "view", venueId);
}

export function canEditStaff(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasHrPermission(permissions, HR_FEATURES.staff, "edit", venueId);
}

export function canAdminStaff(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasHrPermission(permissions, HR_FEATURES.staff, "admin", venueId);
}

export function canViewSalary(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasHrPermission(permissions, HR_FEATURES.salary, "view", venueId);
}

export function canAdminLookups(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasHrPermission(permissions, HR_FEATURES.lookups, "admin", venueId);
}

export function canViewLookups(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return (
    hasHrPermission(permissions, HR_FEATURES.lookups, "view", venueId) ||
    canViewStaff(permissions, venueId)
  );
}

const SENSITIVE_FIELDS = [
  "dob",
  "passport_no",
  "passport_expiry",
  "eid_no",
  "eid_expiry",
  "iban",
  "swift_code",
  "bank_name",
  "wage_package",
  "company_accommodation",
  "basic_salary_60",
  "accom_all_25",
  "transp_all_15",
  "fly_home_ticket_per_year",
  "provisional_leave",
  "provisional_eosb",
  "visa_expenses",
  "visa_penalties_paid",
  "medical_insurance_value",
] as const;

export function maskSensitiveStaffFields<T extends Record<string, unknown>>(
  staff: T,
  permissions: UserPermission[],
  venueId: string,
): T {
  if (canViewSalary(permissions, venueId)) return staff;

  const masked = { ...staff };
  for (const field of SENSITIVE_FIELDS) {
    if (field in masked) {
      (masked as Record<string, unknown>)[field] = null;
    }
  }
  return masked;
}
