import { getRenderClient, getRenderUser } from "@/lib/auth/render-user";
import {
  countNotifications,
  countUnreadNotifications,
  listNotificationsForUser,
} from "@/lib/notifications/store";
import type { NotificationRow } from "@/lib/notifications/types";
import type { Venue } from "@/lib/types/database";

export type MobileNotificationsData = {
  notifications: NotificationRow[];
  totalCount: number;
  unreadCount: number;
};

export async function loadMobileNotifications(
  venue: Venue,
): Promise<MobileNotificationsData> {
  const supabase = await getRenderClient();
  const user = await getRenderUser();
  if (!user) {
    return { notifications: [], totalCount: 0, unreadCount: 0 };
  }

  const venueContext = {
    venueId: venue.id,
    isGlobalVenue: Boolean(venue.is_global),
  };

  const [notifications, totalCount, unreadCount] = await Promise.all([
    listNotificationsForUser(supabase, user.id, { ...venueContext, limit: 50 }),
    countNotifications(supabase, user.id, venueContext),
    countUnreadNotifications(supabase, user.id, venueContext),
  ]);

  return { notifications, totalCount, unreadCount };
}
