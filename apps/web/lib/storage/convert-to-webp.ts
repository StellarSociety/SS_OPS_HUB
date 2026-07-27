import { createRequire } from "node:module";
import type { Sharp, SharpOptions } from "sharp";

/**
 * Load sharp lazily.
 *
 * sharp is a native module. Importing it at module scope makes every server
 * action that transitively imports this file (staff saves, schedule saves,
 * venue branding) pay the native load — and hard-fail with ERR_DLOPEN_FAILED
 * if the platform binary is missing on the deployment target. Loading it only
 * when an image is actually being processed keeps non-image writes working.
 */
export async function loadSharp(): Promise<
  (input?: Buffer | ArrayBuffer | Uint8Array | string, options?: SharpOptions) => Sharp
> {
  try {
    const mod = await import("sharp");
    return (mod.default ?? mod) as unknown as (
      input?: Buffer | ArrayBuffer | Uint8Array | string,
      options?: SharpOptions,
    ) => Sharp;
  } catch (dynamicErr) {
    // Turbopack/Vercel sometimes fails dynamic import of the native binding;
    // createRequire resolves the real package from disk as a fallback.
    try {
      const require = createRequire(import.meta.url);
      return require("sharp") as (
        input?: Buffer | ArrayBuffer | Uint8Array | string,
        options?: SharpOptions,
      ) => Sharp;
    } catch {
      throw dynamicErr;
    }
  }
}

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

/** Some browsers omit File.type on canvas exports; infer from the filename. */
export function resolveRasterImageMime(
  file: Pick<File, "type" | "name">,
): string | null {
  if (isRasterImageMime(file.type)) return file.type;
  const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  switch (ext) {
    case "webp":
      return "image/webp";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "avif":
      return "image/avif";
    case "tif":
    case "tiff":
      return "image/tiff";
    default:
      return null;
  }
}

/** RIFF....WEBP header — client crops already produce this. */
export function isWebpBuffer(input: Buffer): boolean {
  return (
    input.length >= 12 &&
    input.toString("ascii", 0, 4) === "RIFF" &&
    input.toString("ascii", 8, 12) === "WEBP"
  );
}

function asNodeBuffer(input: Buffer | Uint8Array | ArrayBuffer): Buffer {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof ArrayBuffer) return Buffer.from(input);
  return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
}

/**
 * Convert any Sharp-supported raster buffer to WebP.
 * Used by all image upload / import paths before Supabase Storage writes.
 *
 * If sharp cannot load (known Next 16.2 + Turbopack + Vercel gap) and the
 * input is already a WebP with no resize requested, the buffer is returned
 * as-is so client-exported staff photos still persist.
 */
export async function convertImageToWebp(
  input: Buffer | Uint8Array | ArrayBuffer,
  options?: {
    quality?: number;
    maxWidth?: number;
    maxHeight?: number;
  },
): Promise<ConvertToWebpResult> {
  const bytes = asNodeBuffer(input);
  if (bytes.length === 0) {
    throw new Error("Input Buffer is empty");
  }

  const needsResize = Boolean(options?.maxWidth || options?.maxHeight);

  // Client-cropped staff photos are already WebP — skip sharp entirely when no
  // resize is needed so uploads still work if libvips fails to load on Vercel.
  if (!needsResize && isWebpBuffer(bytes)) {
    return {
      buffer: bytes,
      contentType: "image/webp",
      extension: "webp",
    };
  }

  try {
    const sharp = await loadSharp();
    let pipeline = sharp(bytes, { failOn: "none" }).rotate();

    if (needsResize) {
      pipeline = pipeline.resize({
        width: options?.maxWidth,
        height: options?.maxHeight,
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
  } catch (err) {
    if (!needsResize && isWebpBuffer(bytes)) {
      console.warn(
        "[convert-to-webp] sharp failed; using already-WebP input as-is:",
        err instanceof Error ? err.message : err,
      );
      return {
        buffer: bytes,
        contentType: "image/webp",
        extension: "webp",
      };
    }
    throw err;
  }
}
