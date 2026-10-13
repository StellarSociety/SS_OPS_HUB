import "server-only";

import { canAccessConnect } from "@/lib/connect/permissions";
import { CONNECT_FEATURES, CONNECT_MODULE_KEY } from "@/lib/connect/types";
import { loadPhoneAccess } from "@/lib/mobile/phone-access";
import { hasVenueScopedPermission } from "@/lib/module-access";
import type { UserPermission } from "@/lib/role-permissions";

type ConnectAuth = {
  user: { id: string };
  venue: { id: string };
  permissions: UserPermission[];
};

/**
 * Phone Connecteam: Viewer reads the feed, announcements and chats; Editor
 * can also start chats, send messages, post, comment and call.
 * Takes phone permissions (lib/mobile/phone-access).
 */
export function canWriteConnectOnPhone(
  phonePermissions: UserPermission[],
  venueId: string,
): boolean {
  return hasVenueScopedPermission(
    phonePermissions,
    CONNECT_MODULE_KEY,
    CONNECT_FEATURES.feed,
    "edit",
    venueId,
  );
}

/**
 * Connecteam actions are shared by the web app and the phone. Allowed when
 * the web Connecteam toggle is on, or the phone Connecteam switch is on (with
 * the mobile app switched on). Nothing else grants it.
 */
export async function canUseConnect(auth: ConnectAuth): Promise<boolean> {
  return (await connectAccess(auth)).canOpen;
}

/**
 * Open and write rights. Web access keeps full chat as before; phone-only
 * access writes only at Editor.
 */
export async function connectAccess(
  auth: ConnectAuth,
): Promise<{ canOpen: boolean; canWrite: boolean }> {
  if (canAccessConnect(auth.permissions, auth.venue.id)) {
    return { canOpen: true, canWrite: true };
  }
  const phone = await loadPhoneAccess(auth.user.id, auth.venue.id);
  const canOpen = phone.canUseApp && canAccessConnect(phone.permissions, auth.venue.id);
  return {
    canOpen,
    canWrite: canOpen && canWriteConnectOnPhone(phone.permissions, auth.venue.id),
  };
}

export const CONNECT_READ_ONLY_ERROR =
  "You can read Connecteam but not send. Contact your supervisor or Hub admin.";
