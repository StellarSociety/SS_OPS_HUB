"use server";

import { writeAuditLog } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";

export async function updateOwnPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  await writeAuditLog({
    actor_id: user.id,
    action: "update",
    module_key: "auth",
    entity: "password",
    entity_id: user.id,
  });

  return { success: "Password updated." };
}
