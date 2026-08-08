/** Max size for the original file picked before client-side crop/WebP export. */
export const STAFF_PHOTO_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Hard ceiling for the cropped WebP sent to the server. */
export const STAFF_PHOTO_MAX_CROPPED_BYTES = 512 * 1024;

/** Cap long edge when storing the full (uncropped) source WebP. */
export const STAFF_PHOTO_SOURCE_MAX_EDGE_PX = 2400;

/** Square export size before the server stores WebP. */
export const STAFF_PHOTO_CROP_OUTPUT_PX = 512;

export const STAFF_PHOTO_ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,image/avif,image/heic,image/heif,.heic,.heif";

export const STAFF_PHOTOS_BUCKET = "staff-photos";

/** Storage object paths for a staff member's crop + full source. */
export function staffPhotoObjectPaths(venueId: string, staffId: string) {
  return {
    crop: `${venueId}/${staffId}.webp`,
    source: `${venueId}/${staffId}-source.webp`,
    legacy: [
      `${venueId}/${staffId}.jpg`,
      `${venueId}/${staffId}.jpeg`,
      `${venueId}/${staffId}.png`,
    ],
    legacySource: [
      `${venueId}/${staffId}-source.jpg`,
      `${venueId}/${staffId}-source.jpeg`,
      `${venueId}/${staffId}-source.png`,
    ],
  };
}

/**
 * Derive the full-source public URL from a cropped photo_url.
 * Returns null when the URL shape is unexpected.
 */
export function staffPhotoSourceUrlFromCropUrl(
  cropUrl: string | null | undefined,
): string | null {
  const raw = String(cropUrl ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const next = u.pathname.replace(
      /\/([^/]+)\.webp$/i,
      (_m, id: string) =>
        String(id).endsWith("-source") ? `/${id}.webp` : `/${id}-source.webp`,
    );
    if (next === u.pathname) return null;
    u.pathname = next;
    return u.toString();
  } catch {
    return null;
  }
}
