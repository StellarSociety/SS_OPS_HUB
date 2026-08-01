import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/email/secret";
import { getHrVenueSetting } from "@/lib/hr/store";
import {
  DEFAULT_HR_EMAIL_TRANSPORT_SETTINGS,
  HR_SETTINGS_KEYS,
  type HrEmailTransportSettings,
} from "@/lib/hr/types";
import { sendViaResend } from "./resend-transport";
import { sendViaSmtp } from "./smtp";
import type { SendAppEmailParams, SendAppEmailResult } from "./types";

export type { SendAppEmailAttachment, SendAppEmailParams, SendAppEmailResult } from "./types";

export function mergeEmailTransportSettings(
  partial: Partial<HrEmailTransportSettings> | null | undefined,
): HrEmailTransportSettings {
  const base = DEFAULT_HR_EMAIL_TRANSPORT_SETTINGS;
  const smtp = { ...base.smtp, ...(partial?.smtp ?? {}) };
  const imap = { ...base.imap, ...(partial?.imap ?? {}) };
  return {
    provider: partial?.provider ?? base.provider,
    smtp: {
      host: String(smtp.host ?? "").trim(),
      port: Number(smtp.port) || base.smtp.port,
      secure: Boolean(smtp.secure),
      username: String(smtp.username ?? "").trim(),
      fromName: String(smtp.fromName ?? "").trim(),
      fromEmail: String(smtp.fromEmail ?? "").trim(),
      replyTo: String(smtp.replyTo ?? "").trim(),
    },
    imap: {
      enabled: typeof imap.enabled === "boolean" ? imap.enabled : base.imap.enabled,
      host: String(imap.host ?? "").trim(),
      port: Number(imap.port) || base.imap.port,
      sentFolder: String(imap.sentFolder ?? "").trim() || base.imap.sentFolder,
    },
    passwordEncrypted: partial?.passwordEncrypted ?? base.passwordEncrypted,
    lastVerifiedAt: partial?.lastVerifiedAt ?? base.lastVerifiedAt,
    lastError: partial?.lastError ?? base.lastError,
  };
}

export async function loadEmailTransportSettings(
  supabase: SupabaseClient,
  venueId: string,
): Promise<HrEmailTransportSettings> {
  const stored = await getHrVenueSetting<Partial<HrEmailTransportSettings>>(
    supabase,
    venueId,
    HR_SETTINGS_KEYS.emailTransport,
    {},
  );
  return mergeEmailTransportSettings(stored);
}

/**
 * When no venue is supplied (e.g. cron notifications), prefer the first venue
 * with a non-Resend transport and a saved password; otherwise Resend defaults.
 */
export async function resolveEmailTransportSettings(
  supabase: SupabaseClient,
  venueId?: string | null,
): Promise<HrEmailTransportSettings> {
  if (venueId) {
    return loadEmailTransportSettings(supabase, venueId);
  }

  const { data, error } = await supabase
    .from("hr_venue_settings")
    .select("venue_id, value")
    .eq("key", HR_SETTINGS_KEYS.emailTransport)
    .limit(50);

  if (error) {
    console.warn("[email] Could not list transport settings:", error.message);
    return mergeEmailTransportSettings({ provider: "resend" });
  }

  for (const row of data ?? []) {
    const settings = mergeEmailTransportSettings(
      row.value as Partial<HrEmailTransportSettings>,
    );
    if (
      settings.provider !== "resend" &&
      settings.passwordEncrypted &&
      settings.smtp.host
    ) {
      return settings;
    }
  }

  const first = data?.[0]?.value as Partial<HrEmailTransportSettings> | undefined;
  if (first) return mergeEmailTransportSettings(first);
  return mergeEmailTransportSettings({ provider: "resend" });
}

function resolvePassword(settings: HrEmailTransportSettings): string {
  if (!settings.passwordEncrypted) {
    throw new Error(
      "Mailbox password is not configured. Save an app password in Emails Config.",
    );
  }
  return decryptSecret(settings.passwordEncrypted);
}

/**
 * Dispatch to SMTP (+ optional IMAP Sent append) or Resend based on saved config.
 */
export async function sendAppEmail(
  params: SendAppEmailParams,
  options?: {
    venueId?: string | null;
    /** Preloaded settings (skips DB read). */
    settings?: HrEmailTransportSettings;
    supabase?: SupabaseClient;
  },
): Promise<SendAppEmailResult> {
  let settings = options?.settings;
  if (!settings) {
    if (!options?.supabase) {
      const { createServiceClient } = await import("@/lib/supabase/service");
      const supabase = createServiceClient();
      settings = await resolveEmailTransportSettings(
        supabase,
        options?.venueId,
      );
    } else {
      settings = await resolveEmailTransportSettings(
        options.supabase,
        options.venueId,
      );
    }
  }

  if (settings.provider === "resend") {
    await sendViaResend(params);
    return { provider: "resend", imapAppended: false };
  }

  const password = resolvePassword(settings);
  const { imapAppended } = await sendViaSmtp({
    message: params,
    settings,
    password,
  });
  return { provider: settings.provider, imapAppended };
}
