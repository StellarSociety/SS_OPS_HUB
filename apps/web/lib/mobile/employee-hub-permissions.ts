import { hasVenueScopedPermission } from "@/lib/module-access";
import { MOBILE_EMPLOYEE_HUB_MODULE_KEY } from "@/lib/modules-catalog";
import type { UserPermission } from "@/lib/role-permissions";

/**
 * Personal Employee Hub › Leave on the phone: Viewer sees their leave,
 * Editor can also apply for, edit and cancel their own requests.
 * Takes phone permissions (lib/mobile/phone-access).
 */
export function canEditOwnLeave(
  phonePermissions: UserPermission[],
  venueId: string,
): boolean {
  return hasVenueScopedPermission(
    phonePermissions,
    MOBILE_EMPLOYEE_HUB_MODULE_KEY,
    "leave",
    "edit",
    venueId,
  );
}
