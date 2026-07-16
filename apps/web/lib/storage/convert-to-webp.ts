import sharp from "sharp";

/** Default lossy WebP quality for uploaded/imported raster images. */
export const WEBP_QUALITY = 82;

export type ConvertToWebpResult = {
  buffer: Buffer;
  contentType: "image/webp";
  extension: "webp";
};

const RASTER_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/tiff",
]);

const SKIP_WEBP_MIME_TYPES = new Set([
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

/**
 * True when the asset should stay in its original format (SVG/ICO).
 * Raster uploads must go through {@link convertImageToWebp}.
 */
export function shouldSkipWebpConversion(
  mimeType: string,
  extension?: string,
): boolean {
  if (SKIP_WEBP_MIME_TYPES.has(mimeType)) return true;
  const ext = extension?.toLowerCase();
  return ext === "svg" || ext === "ico";
}

export function isRasterImageMime(mimeType: string): boolean {
  return RASTER_MIME_TYPES.has(mimeType);
}

/**
 * Convert any Sharp-supported raster buffer to WebP.
 * Used by all image upload / import paths before Supabase Storage writes.
 */
export async function convertImageToWebp(
  input: Buffer,
  options?: {
    quality?: number;
    maxWidth?: number;
    maxHeight?: number;
  },
): Promise<ConvertToWebpResult> {
  let pipeline = sharp(input, { failOn: "none" }).rotate();

  if (options?.maxWidth || options?.maxHeight) {
    pipeline = pipeline.resize({
      width: options.maxWidth,
      height: options.maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const buffer = await pipeline
    .webp({ quality: options?.quality ?? WEBP_QUALITY })
    .toBuffer();

  return {
    buffer,
    contentType: "image/webp",
    extension: "webp",
  };
}
