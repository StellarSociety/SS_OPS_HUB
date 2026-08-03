"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { encryptSecret } from "@/lib/email/secret";
import {
  loadEmailTransportStore,
  mergeEmailTransportSettings,
  sendAppEmail,
} from "@/lib/email/transport";
import { canAdminLookups, canEditPayroll } from "@/lib/hr/permissions";
import { isAppAdmin } from "@/lib/role-permissions";
import {
  EMPTY_HR_EMAIL_TRANSPORT_SETTINGS,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  type EmailTransportProvider,
  type HrEmailConnection,
  type HrEmailConnectionPublic,
  type HrEmailTransportPublicSettings,
  type HrEmailTransportSettings,
  type HrEmailTransportStore,
} from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

const providerSchema = z.enum([
  "zoho",
  "gmail",
  "outlook",
  "custom",
  "resend",
]);

const transportConfigSchema = z.object({
  provider: providerSchema,
  smtp: z.object({
    host: z.string(),
    port: z.number().int().min(1).max(65535),
    secure: z.boolean(),
    username: z.string(),
    fromName: z.string(),
    fromEmail: z.string(),
    replyTo: z.string(),
  }),
  imap: z.object({
    enabled: z.boolean(),
    host: z.string(),
    port: z.number().int().min(1).max(65535),
    sentFolder: z.string().min(1),
  }),
});

function toPublic(
  settings: HrEmailTransportSettings,
): HrEmailTransportPublicSettings {
  const { passwordEncrypted: _secret, ...rest } = settings;
  return {
    ...rest,
    hasPassword: Boolean(settings.passwordEncrypted),
  };
}

function toConnectionPublic(
  connection: HrEmailConnection,
  defaultConnectionId: string | null,
): HrEmailConnectionPublic {
  const { passwordEncrypted: _secret, id, label, ...rest } = connection;
  return {
    id,
    label,
    isDefault: connection.id === defaultConnectionId,
    ...rest,
    hasPassword: Boolean(connection.passwordEncrypted),
  };
}

function connectionLabelFromSettings(
  settings: HrEmailTransportSettings,
  label?: string,
): string {
  const trimmed = String(label ?? "").trim();
  if (trimmed) return trimmed;
  return (
    settings.smtp.fromName.trim() ||
    settings.smtp.fromEmail.trim() ||
    settings.smtp.username.trim() ||
    "Email connection"
  );
}

async function getAuth() {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return { error: ctx.error } as const;
  return ctx;
}

function requireConfigurePermission(
  permissions: Parameters<typeof canEditPayroll>[0],
  venueId: string,
) {
  if (
    isAppAdmin(permissions) ||
    canAdminLookups(permissions, venueId) ||
    canEditPayroll(permissions, venueId)
  ) {
    return;
  }
  throw new Error("No permission to change email transport settings.");
}

function flagTrue(raw: FormDataEntryValue | null): boolean {
  const v = String(raw ?? "").toLowerCase();
  return v === "true" || v === "on" || v === "1";
}

function parsePort(raw: FormDataEntryValue | null, fallback: number): number {
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

async function persistStore(
  venueId: string,
  store: HrEmailTransportStore,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const service = createServiceClient();
  const { error } = await service.from("hr_venue_settings").upsert(
    {
      venue_id: venueId,
      key: HR_SETTINGS_KEYS.emailTransport,
      value: store,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "venue_id,key" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

function revalidateEmailConfig() {
  revalidatePath("/settings/email-config", "page");
  revalidatePath("/hr/settings/emails", "layout");
  revalidatePath("/hr/settings", "layout");
}

export async function getEmailTransportConnections(): Promise<
  HrEmailConnectionPublic[]
> {
  const auth = await getAuth();
  if ("error" in auth) return [];
  const store = await loadEmailTransportStore(auth.supabase, auth.venue.id);
  return store.connections.map((c) =>
    toConnectionPublic(c, store.defaultConnectionId),
  );
}

/** @deprecated Prefer getEmailTransportConnections; returns default connection. */
export async function getEmailTransportSettings(): Promise<HrEmailTransportPublicSettings> {
  const auth = await getAuth();
  if ("error" in auth) {
    return toPublic(EMPTY_HR_EMAIL_TRANSPORT_SETTINGS);
  }
  const store = await loadEmailTransportStore(auth.supabase, auth.venue.id);
  const preferred =
    store.connections.find((c) => c.id === store.defaultConnectionId) ??
    store.connections[0];
  if (!preferred) return toPublic(EMPTY_HR_EMAIL_TRANSPORT_SETTINGS);
  const { id: _id, label: _label, ...settings } = preferred;
  return toPublic(settings);
}

export async function saveEmailTransportSettings(
  formData: FormData,
): Promise<{ ok: true; connectionId: string } | { ok: false; error: string }> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    const { user, venue, permissions, supabase } = auth;
    requireConfigurePermission(permissions, venue.id);

    const providerRaw = String(formData.get("provider") ?? "zoho");
    const provider = providerSchema.parse(providerRaw) as EmailTransportProvider;

    const security = String(formData.get("smtp_security") ?? "ssl");
    const secure = security === "ssl" || security === "true";

    const nextPartial: Partial<HrEmailTransportSettings> = {
      provider,
      smtp: {
        host: String(formData.get("smtp_host") ?? "").trim(),
        port: parsePort(
          formData.get("smtp_port"),
          secure ? 465 : 587,
        ),
        secure,
        username: String(formData.get("smtp_username") ?? "").trim(),
        fromName: String(formData.get("from_name") ?? "").trim(),
        fromEmail: String(formData.get("from_email") ?? "").trim(),
        replyTo: String(formData.get("reply_to") ?? "").trim(),
      },
      imap: {
        enabled: flagTrue(formData.get("imap_enabled")),
        host: String(formData.get("imap_host") ?? "").trim(),
        port: parsePort(formData.get("imap_port"), 993),
        sentFolder:
          String(formData.get("sent_folder") ?? "").trim() || "Sent",
      },
    };

    const parsed = transportConfigSchema.safeParse(nextPartial);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid transport config.",
      };
    }

    if (provider !== "resend") {
      if (!parsed.data.smtp.host) {
        return { ok: false, error: "SMTP host is required." };
      }
      if (!parsed.data.smtp.username) {
        return { ok: false, error: "SMTP username is required." };
      }
      if (!parsed.data.smtp.fromEmail) {
        return { ok: false, error: "From email is required." };
      }
      if (parsed.data.imap.enabled && !parsed.data.imap.host) {
        return {
          ok: false,
          error: "IMAP host is required when Save to Sent is enabled.",
        };
      }
    }

    const store = await loadEmailTransportStore(supabase, venue.id);
    const connectionIdRaw = String(formData.get("connection_id") ?? "").trim();
    const existing =
      connectionIdRaw
        ? store.connections.find((c) => c.id === connectionIdRaw)
        : undefined;
    const connectionId = existing?.id ?? randomUUID();

    const passwordInput = String(formData.get("smtp_password") ?? "");
    let passwordEncrypted = existing?.passwordEncrypted ?? null;

    if (passwordInput.trim()) {
      passwordEncrypted = encryptSecret(passwordInput.trim());
    }

    if (provider !== "resend" && !passwordEncrypted) {
      return {
        ok: false,
        error: "Enter an app password (required for SMTP).",
      };
    }

    const merged = mergeEmailTransportSettings({
      ...parsed.data,
      passwordEncrypted,
      lastVerifiedAt: existing?.lastVerifiedAt ?? null,
      lastError: existing?.lastError ?? null,
    });

    const labelInput = String(formData.get("connection_label") ?? "").trim();
    const nextConnection: HrEmailConnection = {
      id: connectionId,
      label: connectionLabelFromSettings(merged, labelInput || existing?.label),
      ...merged,
    };

    const connections = existing
      ? store.connections.map((c) =>
          c.id === connectionId ? nextConnection : c,
        )
      : [...store.connections, nextConnection];

    const nextStore: HrEmailTransportStore = {
      connections,
      defaultConnectionId:
        store.defaultConnectionId &&
        connections.some((c) => c.id === store.defaultConnectionId)
          ? store.defaultConnectionId
          : connections[0]?.id ?? null,
    };

    const persisted = await persistStore(venue.id, nextStore);
    if (!persisted.ok) return persisted;

    const { passwordEncrypted: _omit, ...auditSafe } = nextConnection;
    await writeAuditLog({
      actor_id: user.id,
      action: existing ? "update" : "create",
      module_key: HR_MODULE_KEY,
      entity: "hr_venue_settings",
      entity_id: `${HR_SETTINGS_KEYS.emailTransport}:${connectionId}`,
      venue_id: venue.id,
      after: {
        ...auditSafe,
        hasPassword: Boolean(passwordEncrypted),
        passwordUpdated: Boolean(passwordInput.trim()),
      },
    });

    revalidateEmailConfig();
    return { ok: true, connectionId };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to save transport settings.",
    };
  }
}

export async function sendTestEmailTransport(
  formData: FormData,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    const { user, venue, permissions, supabase } = auth;
    requireConfigurePermission(permissions, venue.id);

    const to = String(formData.get("test_to") ?? "")
      .trim()
      .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return { ok: false, error: "Enter a valid test recipient email." };
    }

    const store = await loadEmailTransportStore(supabase, venue.id);
    const connectionId = String(formData.get("connection_id") ?? "").trim();
    const connection =
      (connectionId
        ? store.connections.find((c) => c.id === connectionId)
        : null) ??
      store.connections.find((c) => c.id === store.defaultConnectionId) ??
      store.connections[0];

    if (!connection) {
      return { ok: false, error: "Save the connection before sending a test." };
    }

    const { id: _id, label: _label, ...settings } = connection;

    if (settings.provider !== "resend" && !settings.passwordEncrypted) {
      return {
        ok: false,
        error: "Save an app password before sending a test email.",
      };
    }

    const result = await sendAppEmail(
      {
        to,
        subject: "SS Ops Hub — email transport test",
        html: `<p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#3D421F;">
          This is a test message from the SS Ops Hub email transport
          (provider: <strong>${settings.provider}</strong>).
          ${
            settings.provider !== "resend" && settings.imap.enabled
              ? "If IMAP is configured correctly, a copy should appear in your Sent folder."
              : ""
          }
        </p>`,
      },
      { venueId: venue.id, settings, supabase },
    );

    const verifiedAt = new Date().toISOString();
    const message = result.imapAppended
      ? `Sent via ${result.provider}; copy appended to Sent.`
      : `Sent via ${result.provider}.`;

    const nextConnection: HrEmailConnection = {
      ...connection,
      lastVerifiedAt: verifiedAt,
      lastError: null,
    };
    const nextStore: HrEmailTransportStore = {
      ...store,
      connections: store.connections.map((c) =>
        c.id === connection.id ? nextConnection : c,
      ),
    };

    const persisted = await persistStore(venue.id, nextStore);
    if (!persisted.ok) return persisted;

    await writeAuditLog({
      actor_id: user.id,
      action: "update",
      module_key: HR_MODULE_KEY,
      entity: "hr_venue_settings",
      entity_id: `${HR_SETTINGS_KEYS.emailTransport}:${connection.id}:test`,
      venue_id: venue.id,
      after: {
        testTo: to,
        provider: result.provider,
        imapAppended: result.imapAppended,
        lastVerifiedAt: verifiedAt,
      },
    });

    revalidatePath("/settings/email-config", "page");
    revalidatePath("/hr/settings/emails", "layout");
    return { ok: true, message };
  } catch (e) {
    const errorText =
      e instanceof Error ? e.message : "Test email failed.";

    try {
      const auth = await getAuth();
      if (!("error" in auth)) {
        const store = await loadEmailTransportStore(
          auth.supabase,
          auth.venue.id,
        );
        const connectionId = String(formData.get("connection_id") ?? "").trim();
        const connection =
          (connectionId
            ? store.connections.find((c) => c.id === connectionId)
            : null) ??
          store.connections.find((c) => c.id === store.defaultConnectionId) ??
          store.connections[0];
        if (connection) {
          const nextStore: HrEmailTransportStore = {
            ...store,
            connections: store.connections.map((c) =>
              c.id === connection.id
                ? { ...c, lastError: errorText }
                : c,
            ),
          };
          await persistStore(auth.venue.id, nextStore);
          revalidatePath("/settings/email-config", "page");
          revalidatePath("/hr/settings/emails", "layout");
        }
      }
    } catch {
      // ignore persistence failure on error path
    }

    return { ok: false, error: errorText };
  }
}
