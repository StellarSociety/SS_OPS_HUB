import "server-only";

import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LiveDisplaySettings } from "./types";

type Client = SupabaseClient;

const SHORT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newLiveDisplayCode(length = 6): string {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += SHORT_CODE_ALPHABET[bytes[i]! % SHORT_CODE_ALPHABET.length];
  }
  return code;
}

function asSettings(row: Record<string, unknown>): LiveDisplaySettings {
  return {
    venue_id: String(row.venue_id),
    public_code: String(row.public_code),
    enabled: Boolean(row.enabled ?? true),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function uniqueShortCode(client: Client): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = newLiveDisplayCode();
    const { data, error } = await client
      .from("live_display_settings")
      .select("venue_id")
      .ilike("public_code", code)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return code;
  }
  return newLiveDisplayCode(8);
}

export async function ensureLiveDisplayDefaults(
  client: Client,
  venueId: string,
): Promise<LiveDisplaySettings> {
  const { data: existing, error: readError } = await client
    .from("live_display_settings")
    .select("*")
    .eq("venue_id", venueId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (existing) return asSettings(existing as Record<string, unknown>);

  const code = await uniqueShortCode(client);
  const { data, error } = await client
    .from("live_display_settings")
    .insert({
      venue_id: venueId,
      public_code: code,
      enabled: true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return asSettings(data as Record<string, unknown>);
}

export async function getLiveDisplaySettings(
  client: Client,
  venueId: string,
): Promise<LiveDisplaySettings | null> {
  const { data, error } = await client
    .from("live_display_settings")
    .select("*")
    .eq("venue_id", venueId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? asSettings(data as Record<string, unknown>) : null;
}

export async function getLiveDisplaySettingsByCode(
  client: Client,
  code: string,
): Promise<LiveDisplaySettings | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const { data, error } = await client
    .from("live_display_settings")
    .select("*")
    .ilike("public_code", trimmed)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return asSettings(data as Record<string, unknown>);

  const { data: venue, error: venueError } = await client
    .from("venues")
    .select("id")
    .eq("slug", trimmed.toLowerCase())
    .maybeSingle();
  if (venueError) throw new Error(venueError.message);
  if (!venue?.id) return null;
  return getLiveDisplaySettings(client, String(venue.id));
}

export async function updateLiveDisplaySettings(
  client: Client,
  venueId: string,
  values: Partial<Pick<LiveDisplaySettings, "enabled" | "public_code">>,
): Promise<LiveDisplaySettings> {
  const { data, error } = await client
    .from("live_display_settings")
    .update(values)
    .eq("venue_id", venueId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return asSettings(data as Record<string, unknown>);
}

export async function rotateLiveDisplayCode(
  client: Client,
  venueId: string,
): Promise<LiveDisplaySettings> {
  const code = await uniqueShortCode(client);
  return updateLiveDisplaySettings(client, venueId, { public_code: code });
}
