"use server";

import { revalidatePath } from "next/cache";
import type { NotificationFolder } from "@/lib/notifications/folder";
import {
  archiveAllNotifications,
  archiveNotification,
  deleteNotification,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
  unarchiveNotification,
} from "@/lib/notifications/store";
import { createClient } from "@/lib/supabase/server";

export async function markNotificationAsRead(notificationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  await markNotificationRead(supabase, user.id, notificationId);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function markAllNotificationsAsRead(params: {
  venueId: string;
  isGlobalVenue: boolean;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  await markAllNotificationsRead(supabase, user.id, params);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function archiveNotificationById(notificationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  await archiveNotification(supabase, user.id, notificationId);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function archiveAllNotificationsForVenue(params: {
  venueId: string;
  isGlobalVenue: boolean;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  await archiveAllNotifications(supabase, user.id, params);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function unarchiveNotificationById(notificationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  await unarchiveNotification(supabase, user.id, notificationId);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Permanent remove — only from Archive, after the row has been dismissed. */
export async function deleteNotificationById(notificationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  await deleteNotification(supabase, user.id, notificationId);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function fetchNotifications(params: {
  venueId: string;
  isGlobalVenue: boolean;
  folder?: NotificationFolder;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { notifications: [], unreadCount: 0 };

  const notifications = await listNotificationsForUser(supabase, user.id, {
    venueId: params.venueId,
    isGlobalVenue: params.isGlobalVenue,
    folder: params.folder ?? "inbox",
    limit: 40,
  });

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return { notifications, unreadCount };
}
