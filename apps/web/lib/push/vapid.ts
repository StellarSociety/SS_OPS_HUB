import "server-only";

import { resolveWebPushPublicKey } from "./resolve-public-key";

export function webPushPublicKey(): string {
  return resolveWebPushPublicKey({
    WEB_PUSH_PUBLIC_KEY: process.env.WEB_PUSH_PUBLIC_KEY,
    NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY: process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY,
  });
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
