"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { sendAppEmail } from "@/lib/email/transport";
import {
  loadEmailChromeForVenue,
  mergeEmailChromeSettings,
  resolveEmailChromeForVenue,
} from "@/lib/hr/email-chrome";
import { buildHrTemplateEmailHtml } from "@/lib/hr/email-logo";
import {
  canAdminLookups,
  canEditPayroll,
  canEditStaff,
} from "@/lib/hr/permissions";
import {
  DEFAULT_HR_EMAIL_CHROME_SETTINGS,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  type HrEmailChromeSettings,
} from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

async function getAuth() {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return { error: ctx.error } as const;
  return ctx;
}

function canConfigure(
  permissions: Parameters<typeof canEditStaff>[0],
  venueId: string,
) {
  return (
    canEditPayroll(permissions, venueId) ||
    canEditStaff(permissions, venueId) ||
    canAdminLookups(permissions, venueId)
  );
}

export async function getEmailChromeSettings(): Promise<HrEmailChromeSettings> {
  const auth = await getAuth();
  if ("error" in auth) {
    return resolveEmailChromeForVenue(DEFAULT_HR_EMAIL_CHROME_SETTINGS, {});
  }
  return loadEmailChromeForVenue(auth.supabase, auth.venue);
}

export async function saveEmailChromeSettings(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    const { user, venue, permissions } = auth;

    if (!canConfigure(permissions, venue.id)) {
      return {
        ok: false,
        error: "No permission to change email header/footer.",
      };
    }

    const value = chromeFromFormData(formData, venue);

    const service = createServiceClient();
    const { error } = await service.from("hr_venue_settings").upsert(
      {
        venue_id: venue.id,
        key: HR_SETTINGS_KEYS.emailChrome,
        value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "venue_id,key" },
    );
    if (error) return { ok: false, error: error.message };

    await writeAuditLog({
      actor_id: user.id,
      action: "update",
      module_key: HR_MODULE_KEY,
      entity: "hr_venue_settings",
      entity_id: HR_SETTINGS_KEYS.emailChrome,
      venue_id: venue.id,
      after: {
        enabled: value.enabled,
        footerLength: value.footerText.length,
      },
    });

    revalidatePath("/hr/settings/emails", "layout");
    revalidatePath("/hr/settings/emails/header-footer", "page");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to save email header/footer settings.",
    };
  }
}

function chromeFromFormData(
  formData: FormData,
  venue: { slug?: string | null; name?: string | null },
): HrEmailChromeSettings {
  return resolveEmailChromeForVenue(
    mergeEmailChromeSettings({
      enabled: String(formData.get("enabled") ?? "true") === "true",
      headerBackgroundColor: String(
        formData.get("header_background_color") ?? "",
      ),
      footerText: String(formData.get("footer_text") ?? ""),
      websiteUrl: String(formData.get("website_url") ?? ""),
      instagramUrl: String(formData.get("instagram_url") ?? ""),
      facebookUrl: String(formData.get("facebook_url") ?? ""),
      linkedinUrl: String(formData.get("linkedin_url") ?? ""),
      tiktokUrl: String(formData.get("tiktok_url") ?? ""),
      snapchatUrl: String(formData.get("snapchat_url") ?? ""),
    }),
    venue,
  );
}

/** Send a sample HR email using the current (possibly unsaved) header/footer. */
export async function sendTestEmailChrome(
  formData: FormData,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    const { user, venue, permissions, supabase } = auth;

    if (!canConfigure(permissions, venue.id)) {
      return {
        ok: false,
        error: "No permission to send a header/footer test email.",
      };
    }

    const to = String(formData.get("test_to") ?? "")
      .trim()
      .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return { ok: false, error: "Enter a valid test recipient email." };
    }

    const chrome = chromeFromFormData(formData, venue);
    const sampleBody = [
      "This is a test of the HR email header and footer.",
      "",
      "The message body of template emails appears in this section.",
      chrome.enabled
        ? "Header and footer are included based on your current form values (save to keep them)."
        : "Header and footer are currently turned off — only the body is shown.",
    ].join("\n");

    const { html, inlineAttachments } = await buildHrTemplateEmailHtml({
      body: sampleBody,
      venue,
      chrome,
    });

    const result = await sendAppEmail(
      {
        to,
        subject: `SS Ops Hub — header & footer test (${venue.name ?? "venue"})`,
        html,
        attachments: inlineAttachments,
      },
      { venueId: venue.id, supabase },
    );

    await writeAuditLog({
      actor_id: user.id,
      action: "create",
      module_key: HR_MODULE_KEY,
      entity: "hr_venue_settings",
      entity_id: `${HR_SETTINGS_KEYS.emailChrome}:test`,
      venue_id: venue.id,
      after: {
        testTo: to,
        enabled: chrome.enabled,
        provider: result.provider,
      },
    });

    const message = result.imapAppended
      ? `Test email sent via ${result.provider}; copy appended to Sent.`
      : `Test email sent via ${result.provider}.`;
    return { ok: true, message };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to send header/footer test email.",
    };
  }
}
