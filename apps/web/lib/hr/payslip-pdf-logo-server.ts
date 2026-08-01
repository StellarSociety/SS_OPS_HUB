import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PayslipPdfLogo } from "@/lib/hr/payslip-pdf";
import { loadSharp } from "@/lib/storage/convert-to-webp";

function absoluteAssetUrl(url: string): string {
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return `${base}${url.startsWith("/") ? url : `/${url}`}`;
}

async function readLocalPublicAsset(url: string): Promise<Buffer | null> {
  const clean = url.split("?")[0] ?? url;
  if (!clean.startsWith("/") || clean.includes("..")) return null;
  const candidates = [
    path.join(process.cwd(), "public", clean),
    path.join(process.cwd(), "apps/web/public", clean),
  ];
  for (const filePath of candidates) {
    try {
      return await readFile(filePath);
    } catch {
      // try next candidate
    }
  }
  return null;
}

function isPngBuffer(bytes: Buffer): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function isJpegBuffer(bytes: Buffer): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

/** Load venue logo/stamp for PDF embedding on the server (email attachments). */
export async function loadPayslipPdfLogoServer(
  url: string | null | undefined,
): Promise<PayslipPdfLogo | null> {
  if (!url) return null;

  try {
    let bytes: Buffer | null = null;
    let contentType = "";

    if (url.startsWith("/")) {
      bytes = await readLocalPublicAsset(url);
      const clean = (url.split("?")[0] ?? url).toLowerCase();
      if (clean.endsWith(".svg")) contentType = "image/svg+xml";
      else if (clean.endsWith(".png")) contentType = "image/png";
      else if (clean.endsWith(".webp")) contentType = "image/webp";
      else if (/\.jpe?g$/i.test(clean)) contentType = "image/jpeg";
    }

    if (!bytes) {
      const response = await fetch(absoluteAssetUrl(url));
      if (!response.ok) return null;
      bytes = Buffer.from(await response.arrayBuffer());
      contentType = response.headers.get("content-type") || contentType;
    }

    const lowerUrl = (url.split("?")[0] ?? url).toLowerCase();
    const isSvg =
      contentType.includes("svg") ||
      lowerUrl.includes(".svg") ||
      bytes.toString("utf8", 0, 64).includes("<svg");

    if (isSvg) {
      const sharp = await loadSharp();
      const png = await sharp(bytes, { density: 220 }).png().toBuffer();
      const meta = await sharp(png).metadata();
      return {
        dataUrl: `data:image/png;base64,${png.toString("base64")}`,
        format: "PNG",
        width: meta.width || 400,
        height: meta.height || 120,
      };
    }

    // Pass PNG through unchanged so alpha is preserved for stamps.
    if (isPngBuffer(bytes) || contentType.includes("png") || lowerUrl.endsWith(".png")) {
      const sharp = await loadSharp();
      const meta = await sharp(bytes).metadata();
      return {
        dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
        format: "PNG",
        width: meta.width || 400,
        height: meta.height || 120,
      };
    }

    if (isJpegBuffer(bytes) || contentType.includes("jpeg") || /\.jpe?g$/i.test(lowerUrl)) {
      const sharp = await loadSharp();
      const meta = await sharp(bytes).metadata();
      return {
        dataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}`,
        format: "JPEG",
        width: meta.width || 400,
        height: meta.height || 120,
      };
    }

    // Other formats → PNG via sharp
    const sharp = await loadSharp();
    const png = await sharp(bytes).ensureAlpha().png().toBuffer();
    const meta = await sharp(png).metadata();
    return {
      dataUrl: `data:image/png;base64,${png.toString("base64")}`,
      format: "PNG",
      width: meta.width || 400,
      height: meta.height || 120,
    };
  } catch {
    return null;
  }
}
