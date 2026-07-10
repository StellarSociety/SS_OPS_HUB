"use server";

import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";

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
