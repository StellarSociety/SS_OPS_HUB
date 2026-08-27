import "server-only";

import { randomBytes } from "node:crypto";
import QRCode from "qrcode";

export async function generateQrSvg(value: string): Promise<string> {
  const svg = await QRCode.toString(value, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#3D421F", light: "#ffffff" },
  });
  return svg.replace(/width="[\d.]+"/, 'width="100%"').replace(
    /height="[\d.]+"/,
    'height="100%"',
  );
}

export async function generateQrPng(value: string): Promise<Buffer> {
  return QRCode.toBuffer(value, {
    type: "png",
    margin: 2,
    width: 640,
    errorCorrectionLevel: "M",
    color: { dark: "#3D421F", light: "#ffffff" },
  });
}

export function newPublicToken(): string {
  return randomBytes(9).toString("base64url");
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newRedeemCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
