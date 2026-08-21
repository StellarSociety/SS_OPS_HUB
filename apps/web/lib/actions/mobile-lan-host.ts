"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getLanIPv4, requestDevPort } from "@/lib/mobile/lan-host";
import { MOBILE_APP_BASE } from "@/lib/mobile/app-path";

export type MobileLanHostResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function createMobileLanHost(): Promise<MobileLanHostResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to create a phone host." };
  }

  const ip = getLanIPv4();
  if (!ip) {
    return {
      ok: false,
      error: "No local network address found. Join Wi-Fi and try again.",
    };
  }

  const headerStore = await headers();
  const port = requestDevPort(headerStore.get("host"));

  return { ok: true, url: `http://${ip}:${port}${MOBILE_APP_BASE}` };
}
