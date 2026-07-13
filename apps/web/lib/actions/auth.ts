"use server";

import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type AuthState = { error: string };

export async function signIn(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", data.user.id)
    .single();

  if (profile?.status === "disabled") {
    await supabase.auth.signOut();
    return { error: "Your account has been deactivated." };
  }

  const nowIso = new Date().toISOString();
  try {
    const service = createServiceClient();
    await service
      .from("profiles")
      .update({ last_login_at: nowIso })
      .eq("id", data.user.id);
  } catch {
    // best-effort — column may not be migrated yet
  }

  try {
    await supabase.from("access_events").insert({
      user_id: data.user.id,
      event_type: "login",
    });
  } catch {
    // best-effort
  }

  await writeAuditLog({
    actor_id: data.user.id,
    action: "login",
    module_key: "auth",
    entity: "session",
    entity_id: data.user.id,
  });

  redirect("/select-venue");
}

export async function signOut() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    try {
      await supabase.from("access_events").insert({
        user_id: user.id,
        event_type: "logout",
      });
    } catch {
      // best-effort
    }
    await writeAuditLog({
      actor_id: user.id,
      action: "logout",
      module_key: "auth",
      entity: "session",
      entity_id: user.id,
    });
  }

  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { error: "Email is required." };
  }

  const supabase = await createClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: "Check your email for a password reset link." };
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: error.message };
  }

  if (user) {
    // Mark the invitation as accepted the first time a password is set.
    try {
      const service = createServiceClient();
      const { data: profile } = await service
        .from("profiles")
        .select("invite_accepted_at")
        .eq("id", user.id)
        .maybeSingle();
      if (profile && !profile.invite_accepted_at) {
        await service
          .from("profiles")
          .update({ invite_accepted_at: new Date().toISOString() })
          .eq("id", user.id);
      }
    } catch {
      // best-effort — column may not be migrated yet
    }

    await writeAuditLog({
      actor_id: user.id,
      action: "update",
      module_key: "auth",
      entity: "password",
      entity_id: user.id,
    });
  }

  redirect("/select-venue");
}
