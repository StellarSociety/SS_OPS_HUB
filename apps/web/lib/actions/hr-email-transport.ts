"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { encryptSecret } from "@/lib/email/secret";
import {
  loadEmailTransportSettings,
  mergeEmailTransportSettings,
  sendAppEmail,
} from "@/lib/email/transport";
import { canAdminLookups, canEditPayroll } from "@/lib/hr/permissions";
import {
  DEFAULT_HR_EMAIL_TRANSPORT_SETTINGS,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  type EmailTransportProvider,
  type HrEmailTransportPublicSettings,
  type HrEmailTransportSettings,
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
    !canAdminLookups(permissions, venueId) &&
    !canEditPayroll(permissions, venueId)
  ) {
    throw new Error("No permission to change email transport settings.");
  }
}

function flagTrue(raw: FormDataEntryValue | null): boolean {
  const v = String(raw ?? "").toLowerCase();
  return v === "true" || v === "on" || v === "1";
}

function parsePort(raw: FormDataEntryValue | null, fallback: number): number {
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export async function getEmailTransportSettings(): Promise<HrEmailTransportPublicSettings> {
  const auth = await getAuth();
  if ("error" in auth) {
    return toPublic(DEFAULT_HR_EMAIL_TRANSPORT_SETTINGS);
  }
  const settings = await loadEmailTransportSettings(auth.supabase, auth.venue.id);
  return toPublic(settings);
}

export async function saveEmailTransportSettings(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
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

    const existing = await loadEmailTransportSettings(supabase, venue.id);
    const passwordInput = String(formData.get("smtp_password") ?? "");
    let passwordEncrypted = existing.passwordEncrypted ?? null;

    if (passwordInput.trim()) {
      passwordEncrypted = encryptSecret(passwordInput.trim());
    }

    if (provider !== "resend" && !passwordEncrypted) {
      return {
        ok: false,
        error: "Enter an app password (required for SMTP).",
      };
    }

    const value = mergeEmailTransportSettings({
      ...parsed.data,
      passwordEncrypted,
      lastVerifiedAt: existing.lastVerifiedAt,
      lastError: existing.lastError,
    });

    const service = createServiceClient();
    const { error } = await service.from("hr_venue_settings").upsert(
      {
        venue_id: venue.id,
        key: HR_SETTINGS_KEYS.emailTransport,
        value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "venue_id,key" },
    );
    if (error) return { ok: false, error: error.message };

    const { passwordEncrypted: _omit, ...auditSafe } = value;
    await writeAuditLog({
      actor_id: user.id,
      action: "update",
      module_key: HR_MODULE_KEY,
      entity: "hr_venue_settings",
      entity_id: HR_SETTINGS_KEYS.emailTransport,
      venue_id: venue.id,
      after: {
        ...auditSafe,
        hasPassword: Boolean(passwordEncrypted),
        passwordUpdated: Boolean(passwordInput.trim()),
      },
    });

    revalidatePath("/hr/settings/emails", "layout");
    revalidatePath("/hr/settings/emails/connection", "page");
    revalidatePath("/hr/settings", "layout");
    return { ok: true };
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

    const settings = await loadEmailTransportSettings(supabase, venue.id);

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

    const nextValue = mergeEmailTransportSettings({
      ...settings,
      lastVerifiedAt: verifiedAt,
      lastError: null,
    });

    const service = createServiceClient();
    await service.from("hr_venue_settings").upsert(
      {
        venue_id: venue.id,
        key: HR_SETTINGS_KEYS.emailTransport,
        value: nextValue,
        updated_at: verifiedAt,
      },
      { onConflict: "venue_id,key" },
    );

    await writeAuditLog({
      actor_id: user.id,
      action: "update",
      module_key: HR_MODULE_KEY,
      entity: "hr_venue_settings",
      entity_id: `${HR_SETTINGS_KEYS.emailTransport}:test`,
      venue_id: venue.id,
      after: {
        testTo: to,
        provider: result.provider,
        imapAppended: result.imapAppended,
        lastVerifiedAt: verifiedAt,
      },
    });

    revalidatePath("/hr/settings/emails", "layout");
    revalidatePath("/hr/settings/emails/connection", "page");
    return { ok: true, message };
  } catch (e) {
    const errorText =
      e instanceof Error ? e.message : "Test email failed.";

    try {
      const auth = await getAuth();
      if (!("error" in auth)) {
        const settings = await loadEmailTransportSettings(
          auth.supabase,
          auth.venue.id,
        );
        const nextValue = mergeEmailTransportSettings({
          ...settings,
          lastError: errorText,
        });
        const service = createServiceClient();
        await service.from("hr_venue_settings").upsert(
          {
            venue_id: auth.venue.id,
            key: HR_SETTINGS_KEYS.emailTransport,
            value: nextValue,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "venue_id,key" },
        );
        revalidatePath("/hr/settings/emails", "layout");
        revalidatePath("/hr/settings/emails/connection", "page");
      }
    } catch {
      // ignore persistence failure on error path
    }

    return { ok: false, error: errorText };
  }
}
