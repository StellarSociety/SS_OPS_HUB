import "server-only";

export function webPushPublicKey(): string {
  return (
    process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY?.trim() ||
    process.env.WEB_PUSH_PUBLIC_KEY?.trim() ||
    ""
  );
}

export function webPushPrivateKey(): string {
  return process.env.WEB_PUSH_PRIVATE_KEY?.trim() ?? "";
}

export function webPushSubject(): string {
  return (
    process.env.WEB_PUSH_SUBJECT?.trim() ||
    "mailto:noreply@orillarestaurant.com"
  );
}

export function isWebPushConfigured(): boolean {
  return Boolean(webPushPublicKey() && webPushPrivateKey());
}
