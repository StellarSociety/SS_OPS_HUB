/**
 * Resolve the VAPID public key from env.
 * Prefer `WEB_PUSH_PUBLIC_KEY` — it is read at runtime on the server.
 * `NEXT_PUBLIC_*` is inlined at `next build` and ships as "" when the
 * Vercel project did not have the var during that build.
 */
export function resolveWebPushPublicKey(env: {
  WEB_PUSH_PUBLIC_KEY?: string;
  NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY?: string;
}): string {
  return (
    env.WEB_PUSH_PUBLIC_KEY?.trim() ||
    env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY?.trim() ||
    ""
  );
}
