export type PushPlatform = "ios" | "android" | "desktop";

export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
  platform: PushPlatform;
};

export type PushSubscriptionRow = PushSubscriptionInput & {
  id: string;
  user_id: string;
  created_at: string;
  last_seen_at: string;
};

export type WebPushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
  notificationId?: string;
  severity?: "info" | "warning" | "critical";
};
