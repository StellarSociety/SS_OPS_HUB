import "server-only";

import { decryptSecret, encryptSecret } from "@/lib/email/secret";
import { createServiceClient } from "@/lib/supabase/service";

/** Persist an admin-recoverable copy of a login password (encrypted at rest). */
export async function storeUserLoginPassword(
  userId: string,
  password: string,
): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("user_login_passwords").upsert(
    {
      user_id: userId,
      password_encrypted: encryptSecret(password),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    throw new Error(error.message);
  }
}

/** Remove the recoverable copy (e.g. when the live password is no longer known). */
export async function clearUserLoginPassword(userId: string): Promise<void> {
  const service = createServiceClient();
  await service.from("user_login_passwords").delete().eq("user_id", userId);
}

/** Decrypt the stored login password, or null if none is on file. */
export async function readUserLoginPassword(
  userId: string,
): Promise<string | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("user_login_passwords")
    .select("password_encrypted")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data?.password_encrypted) return null;

  return decryptSecret(data.password_encrypted);
}
