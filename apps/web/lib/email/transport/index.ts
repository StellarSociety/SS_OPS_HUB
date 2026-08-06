import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/email/secret";
import {
  DEFAULT_HR_EMAIL_TRANSPORT_SETTINGS,
  HR_SETTINGS_KEYS,
  type HrEmailConnection,
  type HrEmailTransportSettings,
  type HrEmailTransportStore,
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

function connectionLabel(settings: HrEmailTransportSettings, label?: string): string {
  const trimmed = String(label ?? "").trim();
  if (trimmed) return trimmed;
  return (
    settings.smtp.fromName.trim() ||
    settings.smtp.fromEmail.trim() ||
    settings.smtp.username.trim() ||
    "Email connection"
  );
}

function stripConnectionMeta(
  connection: HrEmailConnection,
): HrEmailTransportSettings {
  const { id: _id, label: _label, ...settings } = connection;
  return settings;
}

function isStoreShape(value: unknown): value is {
  connections: unknown[];
  defaultConnectionId?: string | null;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { connections?: unknown }).connections)
  );
}

function isLegacyTransportShape(value: unknown): value is Partial<HrEmailTransportSettings> {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return "provider" in v || "smtp" in v;
}

/** Normalize raw DB JSON (legacy single object or multi-connection store). */
export function normalizeEmailTransportStore(
  raw: unknown,
): HrEmailTransportStore {
  if (!raw || (typeof raw === "object" && Object.keys(raw as object).length === 0)) {
    return { connections: [], defaultConnectionId: null };
  }

  if (isStoreShape(raw)) {
    const connections: HrEmailConnection[] = raw.connections
      .map((entry) => {
        if (typeof entry !== "object" || entry === null) return null;
        const row = entry as Partial<HrEmailConnection>;
        const id = String(row.id ?? "").trim();
        if (!id) return null;
        const settings = mergeEmailTransportSettings(row);
        return {
          id,
          label: connectionLabel(settings, row.label),
          ...settings,
        };
      })
      .filter((c): c is HrEmailConnection => c !== null);

    const defaultConnectionId =
      (raw.defaultConnectionId &&
        connections.some((c) => c.id === raw.defaultConnectionId)
        ? raw.defaultConnectionId
        : connections[0]?.id) ?? null;

    return { connections, defaultConnectionId };
  }

  if (isLegacyTransportShape(raw)) {
    const settings = mergeEmailTransportSettings(raw);
    const connection: HrEmailConnection = {
      id: "default",
      label: connectionLabel(settings),
      ...settings,
    };
    return {
      connections: [connection],
      defaultConnectionId: "default",
    };
  }

  return { connections: [], defaultConnectionId: null };
}

export function pickDefaultEmailTransport(
  store: HrEmailTransportStore,
): HrEmailTransportSettings | null {
  if (store.connections.length === 0) return null;
  const preferred =
    store.connections.find((c) => c.id === store.defaultConnectionId) ??
    store.connections[0];
  return preferred ? stripConnectionMeta(preferred) : null;
}

async function fetchEmailTransportRaw(
  supabase: SupabaseClient,
  venueId: string,
): Promise<unknown | null> {
  const { data, error } = await supabase
    .from("hr_venue_settings")
    .select("value")
    .eq("venue_id", venueId)
    .eq("key", HR_SETTINGS_KEYS.emailTransport)
    .maybeSingle();
  if (error) {
    console.error("[email] loadEmailTransportStore:", error.message);
    return null;
  }
  return data?.value ?? null;
}

export async function loadEmailTransportStore(
  supabase: SupabaseClient,
  venueId: string,
): Promise<HrEmailTransportStore> {
  const raw = await fetchEmailTransportRaw(supabase, venueId);
  return normalizeEmailTransportStore(raw);
}

export async function loadEmailTransportSettings(
  supabase: SupabaseClient,
  venueId: string,
): Promise<HrEmailTransportSettings> {
  const store = await loadEmailTransportStore(supabase, venueId);
  return (
    pickDefaultEmailTransport(store) ??
    mergeEmailTransportSettings({ provider: "resend" })
  );
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
    const store = normalizeEmailTransportStore(row.value);
    const settings = pickDefaultEmailTransport(store);
    if (
      settings &&
      settings.provider !== "resend" &&
      settings.passwordEncrypted &&
      settings.smtp.host
    ) {
      return settings;
    }
  }

  const first = data?.[0]?.value;
  if (first) {
    const settings = pickDefaultEmailTransport(normalizeEmailTransportStore(first));
    if (settings) return settings;
  }
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
    const result = await sendViaResend(params);
    return {
      provider: "resend",
      imapAppended: false,
      messageId: result.messageId,
    };
  }

  const password = resolvePassword(settings);
  const { imapAppended, messageId } = await sendViaSmtp({
    message: params,
    settings,
    password,
  });
  return { provider: settings.provider, imapAppended, messageId };
}
