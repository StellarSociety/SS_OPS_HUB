import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encrypt/decrypt mailbox app passwords at rest.
 * Prefers APP_SECRETS_KEY; falls back to hashing SUPABASE_SERVICE_ROLE_KEY
 * so existing deploys keep working until APP_SECRETS_KEY is set.
 */

function getEncryptionKey(): Buffer {
  const raw =
    process.env.APP_SECRETS_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!raw) {
    throw new Error(
      "APP_SECRETS_KEY (or SUPABASE_SERVICE_ROLE_KEY) is required to store email passwords.",
    );
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

/** Returns base64(iv || authTag || ciphertext). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  if (buf.length < 28) {
    throw new Error("Invalid encrypted secret payload.");
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}
