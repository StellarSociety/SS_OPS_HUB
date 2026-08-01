"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import {
  mergePayslipLetterheadSettings,
  resolvePayslipLetterheadForVenue,
} from "@/lib/hr/payslip-letterhead";
import { canAdminLookups, canEditPayroll } from "@/lib/hr/permissions";
import { getHrVenueSetting } from "@/lib/hr/store";
import {
  DEFAULT_HR_PAYSLIP_LETTERHEAD_SETTINGS,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  type HrPayslipLetterheadSettings,
} from "@/lib/hr/types";
import { loadSharp } from "@/lib/storage/convert-to-webp";
import { createServiceClient } from "@/lib/supabase/service";
import {
  isStorageBrandAssetUrl,
  storagePathFromBrandAssetUrl,
} from "@/lib/venue/branding";

const STAMP_BUCKET = "venue-branding";
const STAMP_ASSET_KEY = "payslip-stamp";
const STAMP_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_STAMP_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

async function getAuth() {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return { error: ctx.error } as const;
  return ctx;
}

function canConfigure(
  permissions: Parameters<typeof canEditPayroll>[0],
  venueId: string,
): boolean {
  return (
    canAdminLookups(permissions, venueId) ||
    canEditPayroll(permissions, venueId)
  );
}

/** Load letterhead with venue built-in fallbacks applied (for forms + PDFs). */
export async function getPayslipLetterheadSettings(): Promise<HrPayslipLetterheadSettings> {
  const auth = await getAuth();
  if ("error" in auth) {
    return resolvePayslipLetterheadForVenue(
      DEFAULT_HR_PAYSLIP_LETTERHEAD_SETTINGS,
      {},
    );
  }
  const stored = await getHrVenueSetting<Partial<HrPayslipLetterheadSettings>>(
    auth.supabase,
    auth.venue.id,
    HR_SETTINGS_KEYS.payslipLetterhead,
    {},
  );
  return resolvePayslipLetterheadForVenue(
    mergePayslipLetterheadSettings(stored),
    { slug: auth.venue.slug, name: auth.venue.name },
  );
}

async function loadStoredLetterhead(
  supabase: SupabaseClient,
  venueId: string,
): Promise<HrPayslipLetterheadSettings> {
  const stored = await getHrVenueSetting<Partial<HrPayslipLetterheadSettings>>(
    supabase,
    venueId,
    HR_SETTINGS_KEYS.payslipLetterhead,
    {},
  );
  return mergePayslipLetterheadSettings(stored);
}

async function persistLetterhead(input: {
  userId: string;
  venueId: string;
  value: HrPayslipLetterheadSettings;
}) {
  const service = createServiceClient();
  const { error } = await service.from("hr_venue_settings").upsert(
    {
      venue_id: input.venueId,
      key: HR_SETTINGS_KEYS.payslipLetterhead,
      value: input.value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "venue_id,key" },
  );
  if (error) {
    throw new Error(error.message);
  }

  await writeAuditLog({
    actor_id: input.userId,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "hr_venue_settings",
    entity_id: HR_SETTINGS_KEYS.payslipLetterhead,
    venue_id: input.venueId,
    after: input.value,
  });

  revalidatePath("/hr/settings", "layout");
  revalidatePath("/hr/payslips");
  revalidatePath("/hr/payslips/preview");
}

export async function savePayslipLetterheadSettings(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    const { user, venue, permissions, supabase } = auth;

    if (!canConfigure(permissions, venue.id)) {
      return {
        ok: false,
        error: "No permission to save payslip letterhead settings.",
      };
    }

    const existing = await loadStoredLetterhead(supabase, venue.id);
    const value = mergePayslipLetterheadSettings({
      companyName: String(formData.get("company_name") ?? ""),
      companyAddress: String(formData.get("company_address") ?? ""),
      stampUrl: existing.stampUrl,
      footerDisclaimer: String(formData.get("footer_disclaimer") ?? ""),
    });

    await persistLetterhead({
      userId: user.id,
      venueId: venue.id,
      value,
    });

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not save settings.",
    };
  }
}

/**
 * Convert stamp raster to lossless WebP with alpha preserved.
 *
 * - PNGs that already have transparency are kept as-is (alpha untouched).
 * - Opaque stamps on a solid black or white backdrop get that backdrop keyed out
 *   so the stamp overlays cleanly on the payslip.
 */
async function convertPayslipStampToWebp(bytes: Buffer): Promise<{
  buffer: Buffer;
  contentType: "image/webp";
  extension: "webp";
}> {
  const sharpFn = await loadSharp();
  const meta = await sharpFn(bytes, { failOn: "none" }).metadata();
  const { data, info } = await sharpFn(bytes, { failOn: "none" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Buffer.from(data);
  const channels = info.channels;
  const total = Math.floor(pixels.length / channels);

  let transparentCount = 0;
  for (let i = 0; i < pixels.length; i += channels) {
    if ((pixels[i + 3] ?? 255) < 250) transparentCount += 1;
  }
  const alreadyHasAlpha =
    Boolean(meta.hasAlpha) && transparentCount > total * 0.01;

  if (!alreadyHasAlpha) {
    const sampleCorner = (ox: number, oy: number) => {
      const x = Math.min(info.width - 1, Math.max(0, ox));
      const y = Math.min(info.height - 1, Math.max(0, oy));
      const idx = (y * info.width + x) * channels;
      return {
        r: pixels[idx] ?? 0,
        g: pixels[idx + 1] ?? 0,
        b: pixels[idx + 2] ?? 0,
      };
    };
    const corners = [
      sampleCorner(2, 2),
      sampleCorner(info.width - 3, 2),
      sampleCorner(2, info.height - 3),
      sampleCorner(info.width - 3, info.height - 3),
    ];
    const avg = corners.reduce(
      (acc, c) => ({
        r: acc.r + c.r / corners.length,
        g: acc.g + c.g / corners.length,
        b: acc.b + c.b / corners.length,
      }),
      { r: 0, g: 0, b: 0 },
    );
    const luminance = 0.299 * avg.r + 0.587 * avg.g + 0.114 * avg.b;

    // Key solid backdrop: dark plate (~black) or paper (~white).
    if (luminance <= 40) {
      const threshold = 36;
      for (let i = 0; i < pixels.length; i += channels) {
        const r = pixels[i]!;
        const g = pixels[i + 1]!;
        const b = pixels[i + 2]!;
        if (r <= threshold && g <= threshold && b <= threshold) {
          pixels[i + 3] = 0;
        }
      }
    } else if (luminance >= 220) {
      const threshold = 232;
      for (let i = 0; i < pixels.length; i += channels) {
        const r = pixels[i]!;
        const g = pixels[i + 1]!;
        const b = pixels[i + 2]!;
        if (r >= threshold && g >= threshold && b >= threshold) {
          pixels[i + 3] = 0;
        }
      }
    }
  }

  const buffer = await sharpFn(pixels, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .webp({ lossless: true, alphaQuality: 100, effort: 4 })
    .toBuffer();

  return { buffer, contentType: "image/webp", extension: "webp" };
}

export async function uploadPayslipLegalStamp(
  formData: FormData,
): Promise<{ ok: true; stampUrl: string } | { ok: false; error: string }> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    const { user, venue, permissions, supabase } = auth;

    if (!canConfigure(permissions, venue.id)) {
      return { ok: false, error: "No permission to upload a legal stamp." };
    }

    const file = formData.get("stamp");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose a stamp image to upload." };
    }
    if (file.size > STAMP_MAX_BYTES) {
      return { ok: false, error: "Stamp image must be 5 MB or smaller." };
    }

    const mime = file.type || "application/octet-stream";
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const allowedExt = ["png", "jpg", "jpeg", "webp"].includes(ext);
    if (!ALLOWED_STAMP_MIME.has(mime) && !allowedExt) {
      return {
        ok: false,
        error: "Upload a PNG, JPEG, or WebP stamp image.",
      };
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    let converted: {
      buffer: Buffer;
      contentType: "image/webp";
      extension: "webp";
    };
    try {
      converted = await convertPayslipStampToWebp(bytes);
    } catch {
      return { ok: false, error: "Could not process stamp image." };
    }

    const service = createServiceClient();
    const storagePath = `${venue.id}/${STAMP_ASSET_KEY}.${converted.extension}`;

    await service.storage.from(STAMP_BUCKET).remove([
      `${venue.id}/${STAMP_ASSET_KEY}.png`,
      `${venue.id}/${STAMP_ASSET_KEY}.jpg`,
      `${venue.id}/${STAMP_ASSET_KEY}.jpeg`,
      `${venue.id}/${STAMP_ASSET_KEY}.webp`,
    ]);

    const { error: uploadError } = await service.storage
      .from(STAMP_BUCKET)
      .upload(storagePath, converted.buffer, {
        contentType: converted.contentType,
        upsert: true,
        cacheControl: "31536000",
      });

    if (uploadError) {
      return {
        ok: false,
        error:
          "Could not upload stamp. Ensure the venue-branding storage bucket exists.",
      };
    }

    const { data: publicData } = service.storage
      .from(STAMP_BUCKET)
      .getPublicUrl(storagePath);
    const stampUrl = `${publicData.publicUrl}?v=${Date.now()}`;

    const existing = await loadStoredLetterhead(supabase, venue.id);
    const companyName = String(formData.get("company_name") ?? "").trim();
    const companyAddress = String(formData.get("company_address") ?? "").trim();
    const footerDisclaimer = String(
      formData.get("footer_disclaimer") ?? "",
    ).trim();

    await persistLetterhead({
      userId: user.id,
      venueId: venue.id,
      value: mergePayslipLetterheadSettings({
        companyName: companyName || existing.companyName,
        companyAddress: companyAddress || existing.companyAddress,
        stampUrl,
        footerDisclaimer: footerDisclaimer || existing.footerDisclaimer,
      }),
    });

    return { ok: true, stampUrl };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not upload stamp.",
    };
  }
}

export async function removePayslipLegalStamp(): Promise<
  { ok: true; stampUrl: string | null } | { ok: false; error: string }
> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    const { user, venue, permissions, supabase } = auth;

    if (!canConfigure(permissions, venue.id)) {
      return { ok: false, error: "No permission to remove the legal stamp." };
    }

    const existing = await loadStoredLetterhead(supabase, venue.id);
    if (isStorageBrandAssetUrl(existing.stampUrl)) {
      const path = storagePathFromBrandAssetUrl(existing.stampUrl);
      if (path) {
        const service = createServiceClient();
        await service.storage.from(STAMP_BUCKET).remove([path]);
      }
    }

    const value = {
      ...existing,
      stampUrl: null,
    };

    await persistLetterhead({
      userId: user.id,
      venueId: venue.id,
      value,
    });

    const resolved = resolvePayslipLetterheadForVenue(value, {
      slug: venue.slug,
      name: venue.name,
    });

    return { ok: true, stampUrl: resolved.stampUrl };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not remove stamp.",
    };
  }
}
