import {
  hasFeatureAccess,
  hasPermission,
  hasSubmitGrant,
  isAppAdmin,
  type AccessLevel,
  type UserPermission,
} from "@/lib/role-permissions";
import { HR_FEATURES, HR_MODULE_KEY } from "./types";

function matchesVenueScope(
  permissionVenueId: string | null,
  venueId?: string | null,
): boolean {
  if (!venueId) return true;
  return permissionVenueId === null || permissionVenueId === venueId;
}

export function hasHrPermission(
  permissions: UserPermission[],
  featureKey: string,
  minLevel: AccessLevel = "view",
  venueId?: string | null,
): boolean {
  if (isAppAdmin(permissions)) return true;

  return permissions.some(
    (p) =>
      p.module_key === HR_MODULE_KEY &&
      p.feature_key === featureKey &&
      matchesVenueScope(p.venue_id, venueId) &&
      hasPermission([p], HR_MODULE_KEY, featureKey, minLevel),
  );
}

export function hasHrFeatureAccess(
  permissions: UserPermission[],
  featureKey: string,
  venueId?: string | null,
): boolean {
  if (isAppAdmin(permissions)) return true;

  return permissions.some(
    (p) =>
      p.module_key === HR_MODULE_KEY &&
      p.feature_key === featureKey &&
      matchesVenueScope(p.venue_id, venueId) &&
      hasFeatureAccess([p], HR_MODULE_KEY, featureKey),
  );
}

export function hasHrSubmitGrant(
  permissions: UserPermission[],
  featureKey: string,
  venueId?: string | null,
): boolean {
  if (isAppAdmin(permissions)) return true;

  return permissions.some(
    (p) =>
      p.module_key === HR_MODULE_KEY &&
      p.feature_key === featureKey &&
      matchesVenueScope(p.venue_id, venueId) &&
      hasSubmitGrant([p], HR_MODULE_KEY, featureKey),
  );
}

/** Can enter the staff feature (submit or ladder grant). */
export function canAccessStaff(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasHrFeatureAccess(permissions, HR_FEATURES.staff, venueId);
}

/** Can enter the schedules feature (independent of Staff directory). */
export function canAccessSchedules(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasHrFeatureAccess(permissions, HR_FEATURES.schedules, venueId);
}

/** Can edit schedule roster cells and week sections. */
export function canEditSchedules(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasHrPermission(permissions, HR_FEATURES.schedules, "edit", venueId);
}

/** Can read all staff rows (view/edit/admin ladder). */
export function canViewStaff(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasHrPermission(permissions, HR_FEATURES.staff, "view", venueId);
}

/** Can create staff entries (submit or edit/admin). */
export function canSubmitStaff(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return (
    hasHrPermission(permissions, HR_FEATURES.staff, "edit", venueId) ||
    hasHrSubmitGrant(permissions, HR_FEATURES.staff, venueId)
  );
}

/** Can edit any staff row (edit/admin ladder). */
export function canEditStaff(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  return hasHrPermission(permissions, HR_FEATURES.staff, "edit", venueId);
}

export function canEditOwnStaff(
  permissions: UserPermission[],
  venueId: string,
  createdBy: string | null,
  userId: string,
): boolean {
  if (canEditStaff(permissions, venueId)) return true;
  if (!createdBy || createdBy !== userId) return false;
  return hasHrSubmitGrant(permissions, HR_FEATURES.staff, venueId);
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
    canAccessStaff(permissions, venueId)
  );
}

/**
 * Staff columns governed by the `hr/salary` (Salary & sensitive data) grant.
 * These are hidden from readers and never shipped to a client without the
 * grant. Keep this list in sync with the compensation, expenses, bank,
 * document and DOB fields displayed anywhere in the app.
 */
export const SENSITIVE_STAFF_FIELDS = [
  "dob",
  "passport_no",
  "passport_expiry",
  "eid_no",
  "eid_expiry",
  "visa_expiry",
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
  for (const field of SENSITIVE_STAFF_FIELDS) {
    if (field in masked) {
      (masked as Record<string, unknown>)[field] = null;
    }
  }
  return masked;
}

/**
 * Drop sensitive/compensation fields from a staff write payload when the
 * editor lacks the salary grant. Those fields are never rendered for such
 * users, so a full payload would otherwise overwrite the stored values with
 * null on save — silently wiping salary, bank and document data.
 */
export function stripSensitiveStaffWrites<T extends Record<string, unknown>>(
  payload: T,
  permissions: UserPermission[],
  venueId: string,
): T {
  if (canViewSalary(permissions, venueId)) return payload;

  const cleaned = { ...payload };
  for (const field of SENSITIVE_STAFF_FIELDS) {
    delete (cleaned as Record<string, unknown>)[field];
  }
  return cleaned;
}
