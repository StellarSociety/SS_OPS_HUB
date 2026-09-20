import type { SupabaseClient } from "@supabase/supabase-js";
import { HUB_TERMS_VERSION } from "@/lib/mobile/terms-content";

export type HubTermsClient = "web" | "mobile";

export type HubTermsAcknowledgementRow = {
  id: string;
  userId: string;
  venueId: string;
  termsVersion: string;
  client: HubTermsClient;
  userEmail: string;
  userName: string;
  acceptedAt: string;
};

export type HubTermsUserRecord = {
  userId: string;
  name: string;
  email: string;
  empNo: string | null;
  staffId: string | null;
  photoUrl: string | null;
  status: "acknowledged" | "pending";
  client: HubTermsClient | null;
  acceptedAt: string | null;
  lastLoginAt: string | null;
  accountStatus: "active" | "disabled";
};

export function hubTermsClientLabel(client: HubTermsClient | null): string {
  if (client === "mobile") return "Mobile";
  if (client === "web") return "Web";
  return "—";
}

export async function fetchHubTermsAcceptance(opts: {
  supabase: SupabaseClient;
  userId: string;
  venueId: string;
  termsVersion?: string;
}): Promise<HubTermsAcknowledgementRow | null> {
  const version = opts.termsVersion ?? HUB_TERMS_VERSION;
  const { data, error } = await opts.supabase
    .from("hub_terms_acknowledgements")
    .select(
      "id, user_id, venue_id, terms_version, client, user_email, user_name, accepted_at",
    )
    .eq("user_id", opts.userId)
    .eq("venue_id", opts.venueId)
    .eq("terms_version", version)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    venueId: data.venue_id,
    termsVersion: data.terms_version,
    client: data.client === "mobile" ? "mobile" : "web",
    userEmail: data.user_email ?? "",
    userName: data.user_name ?? "",
    acceptedAt: data.accepted_at,
  };
}

export async function userHasAcceptedHubTerms(opts: {
  supabase: SupabaseClient;
  userId: string;
  venueId: string;
  termsVersion?: string;
}): Promise<boolean> {
  const row = await fetchHubTermsAcceptance(opts);
  return Boolean(row);
}
