import type { SupabaseClient } from "@supabase/supabase-js";

function looksLikeEmail(value: string): boolean {
  return value.includes("@");
}

function cleanDisplayName(raw: unknown): string | null {
  const name = String(raw ?? "").trim();
  if (!name || looksLikeEmail(name)) return null;
  return name;
}

/**
 * Display name for {{USER_NAME}} in outbound HR emails.
 * Prefers profiles.full_name (or linked staff name); never returns an email.
 */
export async function resolveSignedInUserDisplayName(
  supabase: SupabaseClient,
  userId: string,
  fallback = "Human Resources",
): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, staff_id")
    .eq("id", userId)
    .maybeSingle();

  const fromProfile = cleanDisplayName(profile?.full_name);
  if (fromProfile) return fromProfile;

  const staffId = String(profile?.staff_id ?? "").trim();
  if (staffId) {
    const { data: staff } = await supabase
      .from("staff")
      .select("full_name")
      .eq("id", staffId)
      .maybeSingle();
    const fromStaff = cleanDisplayName(staff?.full_name);
    if (fromStaff) return fromStaff;
  }

  return fallback;
}
