/**
 * Browsers generally cannot draw HEIC/HEIF into <img>/canvas for crop UI.
 * Convert to a JPEG File so the existing crop dialog can load it.
 */

export function isHeicLikeFile(file: Pick<File, "type" | "name">): boolean {
  const type = (file.type || "").toLowerCase();
  if (
    type === "image/heic" ||
    type === "image/heif" ||
    type === "image/heic-sequence" ||
    type === "image/heif-sequence"
  ) {
    return true;
  }
  return /\.hei[cf]$/i.test(file.name);
}

export async function ensureBrowserDecodableImage(file: File): Promise<File> {
  if (!isHeicLikeFile(file)) return file;

  const heic2any = (await import("heic2any")).default;
  const converted = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.92,
  });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  if (!blob || blob.size === 0) {
    throw new Error("Could not convert HEIC photo.");
  }

  const base = file.name.replace(/\.hei[cf]$/i, "") || "photo";
  return new File([blob], `${base}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
